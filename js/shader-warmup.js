import * as THREE from 'three/webgpu';
import { QUALITY } from './quality.js';

// js/shader-warmup.js
// Shader pre-compilation behind the loading screen (js/main.js calls it once the start view is set up). compileAsync()
// builds the node graphs in slices and has the GPU process compile the pipelines in parallel, but after every 8 ms slice
// it waits for a rendered frame, which leaves the main thread idle about half the time while nothing else animates;
// several calls side by side keep it busy (warm cache: 2.1 s instead of 4.0 s). (Rendering straight away compiled ~500
// pipelines one after another: ~25 s with a cold shader cache.)
const _sphere = new THREE.Sphere();
const PRECOMPILE_RADIUS = 600; // m (the mobile profile)
const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));

/**
 * Compiles the pipelines of what the start shows (everything, unless the mobile profile) before the first frame.
 * `scenePass`/`sceneMRT`: the post-processing's scene pass and its MRT (none with ?qset=skip:postfx); `status`: the loading
 * screen's line; `mark`: the start-up timings (js/main.js); `boot`: its breadcrumbs
 */
export async function precompileShaders({ renderer, renderPipeline, scene, camera, scenePass = null, sceneMRT = null, status = null, mark = () => {}, boot }) {
  // (a phone's GPU process, iOS above all, is closed when many pipelines are built at once: two at a time there)
  const COMPILE_POOL = QUALITY.mobile ? 2 : 16;
  // An empty frame first: it sets up the post-processing chain, which configures the scene pass's render target
  // (MSAA samples, depth format), so the pipelines compiled below are the very ones the scene pass asks for
  scene.visible = false;
  renderPipeline.render();
  scene.visible = true;
  mark('postFX');

  // Every visible object with frustum culling off (like the warm-up frame, see the loop). Plain meshes that share
  // a material share its shader, so one job compiles them in turn (the first build serves the rest); every
  // instanced mesh gets a build of its own unless its chunks share a pipeline.
  // The mobile profile (QUALITY.precompileAll false) only compiles what the start view shows: compileAsync() uploads
  // the vertices of every object it builds for, the whole valley's with the culling off, more than a phone takes at
  // once; the rest compiles as it comes into view.
  const culled = [];
  const jobs = [];
  const jobByMaterial = new Map();
  const pipelines = new Set();
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const inView = (o) => {
    if (QUALITY.precompileAll || !o.frustumCulled || o.isInstancedMesh) return true; // (instanced: their own bounds)
    const g = o.geometry;
    if (!g) return true;
    if (!g.boundingSphere) g.computeBoundingSphere();
    return frustum.intersectsSphere(_sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld));
  };
  // (and nothing farther than PRECOMPILE_RADIUS: a few hundred metres of the start show all the town's kinds of things)
  const beyond = (o) => {
    const g = o.geometry;
    if (!g?.boundingSphere) return false;
    _sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    return _sphere.center.distanceTo(camera.position) - _sphere.radius > PRECOMPILE_RADIUS;
  };
  scene.traverseVisible((o) => {
    if ((o.isMesh || o.isLine || o.isPoints) && !inView(o)) return;
    if (!QUALITY.precompileAll && o.isMesh && !o.isInstancedMesh && o.frustumCulled && beyond(o)) return;
    if (o.frustumCulled && QUALITY.precompileAll) {
      culled.push(o);
      o.frustumCulled = false;
    }
    if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
    // Use the first visible chunk: the original representative may be in an inactive tree cell. Shadow stand-ins
    // only draw in the shadow maps (the warm-up frame compiles those).
    if (o.userData.shadowProxy) return;
    const pipeline = o.userData.sharesPipelineWith || o;
    if (pipelines.has(pipeline)) return;
    pipelines.add(pipeline);
    if (o.isInstancedMesh || Array.isArray(o.material)) {
      jobs.push([o]);
      return;
    }
    let job = jobByMaterial.get(o.material);
    if (!job) {
      job = [];
      jobByMaterial.set(o.material, job);
      jobs.push(job);
    }
    job.push(o);
  });

  if (scenePass) {
    renderer.setRenderTarget(scenePass.renderTarget);
    renderer.setMRT(sceneMRT);
  }
  const compile = async (object) => {
    // Each compile starts in a task of its own: compileAsync() keeps one precompilation state on the renderer,
    // which must not be mid-step for two of them in the same microtask checkpoint
    await nextTask();
    try {
      await renderer.compileAsync(object, camera, scene);
    } catch (e) {
      console.warn('[compile]', e); // the warm-up frame compiles it instead
      boot.error('compile: ' + (e?.message || String(e)));
    }
  };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      // (on the mobile profile every job is a breadcrumb: a GPU process closed mid-compile names the object it died on)
      if (QUALITY.mobile) boot.stage(`compile ${next}/${jobs.length} ${job[0].name || job[0].type} (${job[0].material?.type || ''})`);
      for (const object of job) await compile(object);
      done++;
      if (status) {
        const message = done < jobs.length * 0.75 ? 'Bringing Davos to life…' : 'Your ride is almost ready…';
        if (status.textContent !== message) status.textContent = message;
      }
    }
  };
  await Promise.all(Array.from({ length: COMPILE_POOL }, worker));
  renderer.setMRT(null);
  renderer.setRenderTarget(null);
  for (const o of culled) o.frustumCulled = true;
}
