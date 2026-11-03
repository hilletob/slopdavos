// js/mem-hud.js
// ?memhud=1: a small read-out for a real phone, where no profiler reaches. js/main.js imports this module only with the
// switch in the URL, so that without it nothing of this is loaded, hooked or drawn. Shown at the left below the top bar,
// taking no touches, twice a second:
//   fps (now and the slowest second of the last minute), the JavaScript heap where the browser tells, garbage included
//   (Safari doesn't tell: "n/a"), the vertex and texture bytes on the GPU (counted at the device: what was asked for, not what the driver
//   made of it), the renderer's geometries, textures, draws and triangles, the bytes of vertex data still held in
//   JavaScript, the shader modules and pipelines made so far, the season and whether the winter scenery stands.
// A tab that gets closed takes its read-out with it, so the last line goes to localStorage every few seconds, and the
// next start with the switch shows it below ("last run"): what the numbers were shortly before a crash.

const LAST_KEY = 'slopdavos-memhud';
const SAVE_EVERY = 5; // s

const mb = (bytes) => (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0);

/** One texture's bytes: every mip of every layer, by the format's size (block-compressed: about a byte a texel) */
export function textureBytes({ width, height = 1, layers = 1, mips = 1, samples = 1, format = 'rgba8unorm' }) {
  const f = String(format);
  const bpp = /^(r8|stencil8)/.test(f) ? 1
    : /^(rg8|r16|depth16)/.test(f) ? 2
    : /^(rgba16|rg32|depth32float-stencil8)/.test(f) ? 8
    : /^rgba32/.test(f) ? 16
    : /^(astc|bc|etc|eac)/.test(f) ? 1
    : 4;
  let bytes = 0;
  for (let m = 0, w = width, h = height; m < mips; m++) {
    bytes += w * h * layers * bpp;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return bytes * samples;
}

const counts = { buffers: 0, bufferBytes: 0, textures: 0, textureBytes: 0, shaders: 0, pipelines: 0 };
/** What countGpuAllocations() has counted */
export const gpuCounts = () => ({ ...counts });

/** Counts what the GPU device is asked for: to be called before the renderer is created */
export function countGpuAllocations(env = globalThis) {
  if (!env.GPUDevice?.prototype?.createBuffer) return false;
  const D = env.GPUDevice.prototype, sizes = new WeakMap();
  const { createBuffer, createTexture, createShaderModule, createRenderPipeline, createRenderPipelineAsync } = D;
  D.createBuffer = function (d) {
    const b = createBuffer.call(this, d);
    sizes.set(b, d.size);
    counts.buffers++; counts.bufferBytes += d.size;
    return b;
  };
  D.createTexture = function (d) {
    const t = createTexture.call(this, d);
    const s = d.size, bytes = textureBytes({ width: s.width ?? s[0], height: s.height ?? s[1] ?? 1, layers: s.depthOrArrayLayers ?? s[2] ?? 1, mips: d.mipLevelCount || 1, samples: d.sampleCount || 1, format: d.format });
    sizes.set(t, bytes);
    counts.textures++; counts.textureBytes += bytes;
    return t;
  };
  D.createShaderModule = function (d) { counts.shaders++; return createShaderModule.call(this, d); };
  D.createRenderPipeline = function (d) { counts.pipelines++; return createRenderPipeline.call(this, d); };
  D.createRenderPipelineAsync = function (d) { counts.pipelines++; return createRenderPipelineAsync.call(this, d); };
  const gone = (proto, count, bytes) => {
    const destroy = proto.destroy;
    proto.destroy = function () {
      if (sizes.has(this)) { counts[count]--; counts[bytes] -= sizes.get(this); sizes.delete(this); }
      return destroy.call(this);
    };
  };
  gone(env.GPUBuffer.prototype, 'buffers', 'bufferBytes');
  gone(env.GPUTexture.prototype, 'textures', 'textureBytes');
  return true;
}

/** The vertex data still in JavaScript (static scenery lets go of it once on the GPU, js/gpu-memory.js) */
function cpuVertexBytes(scene) {
  let bytes = 0;
  const seen = new Set();
  scene.traverse((o) => {
    const g = o.geometry;
    if (g && !seen.has(g)) {
      seen.add(g);
      for (const a of Object.values(g.attributes)) bytes += a.array?.byteLength || 0;
      bytes += g.index?.array?.byteLength || 0;
    }
    if (o.isInstancedMesh) bytes += o.instanceMatrix?.array?.byteLength || 0;
  });
  return bytes;
}

/** The read-out, once the first frame stands. `state()`: { season, winterScenery } */
export function startMemHud({ renderer, scene, state = () => ({}) }) {
  const box = document.createElement('pre');
  box.id = 'mem-hud';
  box.style.cssText = 'position:fixed;left:max(4px,env(safe-area-inset-left));top:calc(env(safe-area-inset-top) + 150px);z-index:2147483647;margin:0;padding:4px 6px;'
    + 'font:10px/1.25 ui-monospace,Menlo,monospace;color:#d8ffd8;background:rgba(0,0,0,.72);border-radius:4px;pointer-events:none;white-space:pre;';
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* (storage off) */ }
  document.body.append(box);

  const started = performance.now();
  let frames = 0, windowStart = started, lastSave = started, fps = 0;
  const seconds = []; // the frames of each of the last 60 seconds
  let inSecond = 0, secondStart = started;
  const peak = { heap: 0, gpu: 0 };
  let cpuBytes = 0, cpuAt = -Infinity; // (a walk over the whole scene: not at every line)

  const frame = (now) => {
    frames++; inSecond++;
    if (now - secondStart >= 1000) {
      seconds.push(Math.round(inSecond * 1000 / (now - secondStart)));
      if (seconds.length > 60) seconds.shift();
      inSecond = 0; secondStart = now;
    }
    if (now - windowStart >= 500) {
      fps = Math.round(frames * 1000 / (now - windowStart));
      frames = 0; windowStart = now;
      render(now);
    }
    requestAnimationFrame(frame);
  };

  const render = (now) => {
    const info = renderer.info, mem = info?.memory || {}, frameInfo = info?.render || {};
    const heap = performance.memory?.usedJSHeapSize; // (Chrome only)
    const gpu = counts.bufferBytes + counts.textureBytes;
    if (heap > peak.heap) peak.heap = heap;
    if (gpu > peak.gpu) peak.gpu = gpu;
    const { season = '?', winterScenery = '?' } = state();
    const minutes = Math.floor((now - started) / 60000);
    if (now - cpuAt >= 5000) { cpuAt = now; cpuBytes = cpuVertexBytes(scene); }
    const lines = [
      `fps ${fps} (low ${seconds.length ? Math.min(...seconds) : fps}) up ${minutes} min`,
      `js heap ${heap == null ? 'n/a' : `${mb(heap)} MB (peak ${mb(peak.heap)})`}`,
      `gpu ${mb(gpu)} MB (peak ${mb(peak.gpu)}): buf ${mb(counts.bufferBytes)} tex ${mb(counts.textureBytes)}`,
      `cpu verts ${mb(cpuBytes)} MB`,
      `geo ${mem.geometries ?? '?'} tex ${mem.textures ?? '?'} buf# ${counts.buffers} tex# ${counts.textures}`,
      `draws ${frameInfo.drawCalls ?? '?'} tris ${Math.round((frameInfo.triangles || 0) / 1000)}k`,
      `shaders ${counts.shaders} pipes ${counts.pipelines}`,
      `${season}, winter scenery ${winterScenery}`
    ];
    box.textContent = lines.join('\n') + (last ? `\nlast run: ${last}` : '');
    if (now - lastSave >= SAVE_EVERY * 1000) {
      lastSave = now;
      try {
        localStorage.setItem(LAST_KEY, `${minutes} min, ${season}, heap ${heap == null ? 'n/a' : mb(heap)}, gpu ${mb(gpu)}, geo ${mem.geometries}, tex ${mem.textures}, fps ${fps}`);
      } catch { /* (storage off) */ }
    }
  };
  requestAnimationFrame(frame);
  return box;
}
