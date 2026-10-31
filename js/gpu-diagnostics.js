// js/gpu-diagnostics.js
// Two helpers for phones whose GPU process gives up at the start (an iPhone 13 on iOS 27: "createShaderModule: Unable to
// make shader module", then every command encoder failing):
//  - DirectLighting: the renderer's lighting without the point and spot lights (no ClusteredLighting loop in every lit
//    shader; the lamps, shop windows and headlights then glow by their emissive materials and sprites alone)
//  - watchShaderModules(): every shader module the device makes, numbered, with its WGSL length, a hash and the object
//    and material it was built for, as a breadcrumb (localStorage, so the next start can say which one was the last),
//    uncaptured GPU errors (the compiler's complaints among them), and the WGSL of the last module ('slopdavos-last-wgsl') for the Web Inspector.
import * as THREE from 'three/webgpu';

/** A lights node that leaves the point and spot lights out of the shaders */
class DirectLightsNode extends THREE.LightsNode {
  setLights(lights) {
    return super.setLights(lights.some((l) => l.isPointLight || l.isSpotLight) ? lights.filter((l) => !l.isPointLight && !l.isSpotLight) : lights);
  }
}

/** renderer.lighting without point and spot lights (sun, sky, hemisphere and ambient only) */
export class DirectLighting extends THREE.Lighting {
  createNode(lights = []) {
    return new DirectLightsNode().setLights(lights);
  }
}

/** FNV-1a, 32 bit, as 8 hex digits */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const LOG_KEY = 'slopdavos-gpu';
const WGSL_KEY = 'slopdavos-last-wgsl';

/** What the last start logged (shader modules, GPU errors), or null */
export function previousGpuLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)); } catch { return null; }
}

/**
 * Wraps renderer.backend.device.createShaderModule (WebGPU only). `stage(label)` is called before every module,
 * `error(message)` for compiler errors, a module that could not be made, uncaptured GPU errors and a lost device.
 * Unlike the start-up breadcrumbs the log ('slopdavos-gpu') stays after the first frame: shaders compiled while
 * playing are logged too. Returns the log (also window.__slopdavosShaders).
 */
export function watchShaderModules(renderer, { stage = () => {}, error = () => {}, keepWGSL = true } = {}) {
  const device = renderer.backend?.device;
  const log = { at: new Date().toISOString(), modules: 0, last: [], errors: [], lost: null, limits: null };
  globalThis.__slopdavosShaders = log;
  if (!device?.createShaderModule) return log;
  const save = () => { try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* storage may be off */ } };
  const fail = (message) => {
    message = String(message).slice(0, 600);
    if (log.errors.length >= 12) return; // (a dead device fails every call after: the first ones tell)
    log.errors.push(message);
    save();
    error(message);
  };
  try {
    const L = device.limits;
    log.limits = Object.fromEntries(['maxStorageBuffersPerShaderStage', 'maxStorageBuffersInFragmentStage', 'maxSampledTexturesPerShaderStage',
      'maxSamplersPerShaderStage', 'maxUniformBuffersPerShaderStage', 'maxBindingsPerBindGroup', 'maxInterStageShaderVariables']
      .filter((k) => L[k] !== undefined).map((k) => [k, L[k]]));
  } catch { /* (limits are informational) */ }
  save();

  // The render object whose pipeline is being built: three's Pipelines.getForRender makes its programs (the hook only
  // keeps a reference; the names are looked up when a module is made)
  let current = null;
  const pipelines = renderer._pipelines;
  if (pipelines?.getForRender) {
    const getForRender = pipelines.getForRender;
    pipelines.getForRender = function (renderObject, ...rest) {
      current = renderObject;
      return getForRender.call(this, renderObject, ...rest);
    };
  }
  const describe = (desc) => {
    const o = current?.object, m = current?.material;
    const what = o ? `${o.name || o.type}${o.parent?.name ? ' < ' + o.parent.name : ''} (${m?.type || ''}${m?.name ? ' ' + m.name : ''})` : '';
    return [desc?.label, what].filter(Boolean).join(' ');
  };

  const create = device.createShaderModule.bind(device);
  device.createShaderModule = (desc) => {
    const n = ++log.modules;
    const code = String(desc?.code || '');
    const entry = { n, label: describe(desc), length: code.length, hash: hashText(code), t: Math.round(performance.now()) };
    log.last.push(entry);
    if (log.last.length > 8) log.last.shift();
    save();
    if (keepWGSL) try { localStorage.setItem(WGSL_KEY, `// #${n} ${entry.label} ${entry.length} B ${entry.hash}\n${code}`); } catch { /* too big or storage off */ }
    stage(`shader ${n} ${entry.label} ${entry.length} B #${entry.hash}`);
    let module;
    try {
      module = create(desc);
    } catch (e) {
      fail(`createShaderModule #${n} ${entry.label} (${entry.length} B #${entry.hash}): ${e?.message || e}`);
      throw e;
    }
    // (no getCompilationInfo(): it has the browser compile every module at once, ~10x slower in Chrome; a module the
    // compiler rejects shows up as an uncaptured validation error below, or as the exception above in Safari)
    return module;
  };
  device.addEventListener?.('uncapturederror', (e) => fail(`GPU error: ${e.error?.message || e.error}`));
  device.lost?.then((info) => { log.lost = `${info.reason || ''} ${info.message || ''}`.trim(); fail(`GPU device lost: ${log.lost}`); });
  return log;
}
