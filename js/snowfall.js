import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, float, length, max, mix, mod, positionGeometry, sin, smoothstep, time, uniform, uv, varying, vec3, vec4 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { winter } from './season.js';

// Falling snow in winter: a box of flakes around the camera, animated on the GPU. Every flake is a small camera-facing
// quad whose position comes from its own random seed and the time alone (fall, a light wind drift and a wobble),
// wrapped into a BOX-metre cube that moves with the camera, so the field never runs out and costs nothing on the CPU.
// It fades with season.js's `winter` (hidden outright in summer) and with height: from the helicopter high above the
// valley the flurry thins out and is gone above ~400 m over the ground.

const FLAKES = 12000;
const BOX = 70; // metres, the cube of snow around the camera
const WIND = new THREE.Vector2(0.55, 0.2); // m/s, the drift with the wind

// One quad per flake: the corners in `position` (±0.5), the flake's seed (four randoms) in `seed`
function flakeGeometry(count) {
  const positions = new Float32Array(count * 12), seeds = new Float32Array(count * 16), uvs = new Float32Array(count * 8);
  const index = new Uint32Array(count * 6);
  const corners = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      positions.set([corners[k * 2], corners[k * 2 + 1], 0], v * 3);
      uvs.set([corners[k * 2] + 0.5, corners[k * 2 + 1] + 0.5], v * 2);
      seeds.set(s, v * 4);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  // (the vertex shader places the flakes around the camera; the mesh is never frustum culled)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), BOX);
  return g;
}

// `night`: the lighting's night factor uniform (0 day … 1 midnight), so that the flakes dim with the light
export function buildSnowfall(scene, { night = null } = {}) {
  const fade = uniform(0); // winter × height fade, set per frame
  const seed = attribute('seed', 'vec4');
  const t = time;

  // Fall at 0.8-1.6 m/s, drift with the wind, wobble a little sideways (each flake its own rhythm)
  const speed = seed.w.mul(0.8).add(0.8);
  const phase = seed.x.mul(6.283);
  const wobble = vec3(sin(t.mul(seed.y.mul(0.8).add(0.6)).add(phase)), 0, sin(t.mul(seed.z.mul(0.7).add(0.5)).add(phase.mul(1.7)))).mul(0.45);
  const start = seed.xyz.mul(BOX);
  const drift = vec3(t.mul(WIND.x), t.mul(speed).negate(), t.mul(WIND.y));
  // Wrapped into the cube centred on the camera
  const world = mod(start.add(drift).sub(cameraPosition), BOX).sub(BOX / 2).add(cameraPosition).add(wobble);
  const view = cameraViewMatrix.mul(vec4(world, 1));
  const size = seed.y.mul(0.06).add(0.06);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  material.vertexNode = cameraProjectionMatrix.mul(vec4(view.xyz.add(vec3(positionGeometry.xy.mul(size), 0)), 1));

  // Soft round flakes; thinning out towards the cube's faces (so that the wrap never shows) and right at the lens
  // (both per flake, in the vertex stage)
  const offset = world.sub(cameraPosition);
  const a = offset.abs();
  const edge = smoothstep(BOX / 2, BOX * 0.36, max(a.x, max(a.y, a.z)));
  const near = smoothstep(0.4, 1.6, length(view.xyz));
  const round = smoothstep(0.5, 0.12, length(uv().sub(0.5)));
  const light = night ? mix(float(1), float(0.16), night) : float(1);
  material.colorNode = vec3(0.86, 0.9, 0.98).mul(light);
  material.opacityNode = round.mul(varying(edge.mul(near))).mul(fade).mul(0.85);

  const mesh = new THREE.Mesh(flakeGeometry(FLAKES), material);
  mesh.name = 'snowfall';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 10; // after the other transparent surfaces
  scene.add(mesh);

  return {
    mesh,
    // Per frame: the fade from the season and the camera's height above the ground; nothing drawn in summer
    update(camera) {
      const p = camera.position;
      const ground = groundHeight(p.x, p.z);
      const above = Number.isFinite(ground) ? p.y - ground : 0;
      const high = 1 - THREE.MathUtils.smoothstep(above, 250, 400);
      fade.value = winter.value * high;
      mesh.visible = fade.value > 0.01;
    }
  };
}
