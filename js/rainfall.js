import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, float, length, max, mix, mod, normalize, positionGeometry, smoothstep, time, uniform, uv, varying, vec3, vec4, abs, cross } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';

// Rain in summer (js/weather.js): a box of drops around the camera, animated on the GPU like the snow (js/snowfall.js).
// Every drop is a thin streak, stretched along the way it falls (its fall and the wind's drift) and turned about that
// axis to face the camera, so that it reads as a streak from any side; its position comes from its own random seed and the
// time alone, wrapped into a BOX-metre cube that moves with the camera. How hard it rains comes from the weather
// (setAmount), the wind from it too (setWind); like the snow it thins out with height above the ground.

const BOX = 46; // metres, the cube of rain around the camera (smaller than the snow's: the drops are quick and many)
const FALL = 7.5; // m/s, a drop's mean speed
const LENGTH = 0.55; // metres, a streak's length (a drop's way in about 1/14 s, what the eye smears)

// One quad per drop: the corners in `position` (x across ±0.5, y along 0..1), the drop's seed (four randoms) in `seed`
function dropGeometry(count) {
  const positions = new Float32Array(count * 12), seeds = new Float32Array(count * 16), uvs = new Float32Array(count * 8);
  const index = new Uint32Array(count * 6);
  const corners = [-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1];
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      positions.set([corners[k * 2], corners[k * 2 + 1], 0], v * 3);
      uvs.set([corners[k * 2] + 0.5, corners[k * 2 + 1]], v * 2);
      seeds.set(s, v * 4);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), BOX);
  return g;
}

// `night`: the lighting's night factor uniform (0 day … 1 midnight), so that the drops dim with the light
export function buildRainfall(parent, { night = null } = {}) {
  const fade = uniform(0); // how hard it rains × height fade, set per frame
  const wind = uniform(new THREE.Vector2(0, 0)); // m/s, the drift (the streaks lean with it)
  const drifted = uniform(new THREE.Vector3()); // metres the wind has carried the drops, summed per frame (a change of wind
  // times the time since the start would throw the whole field sideways)
  let amount = 0, last = performance.now();
  const seed = attribute('seed', 'vec4');
  const t = time;

  const speed = seed.w.mul(0.35).add(0.82).mul(FALL);
  const velocity = vec3(wind.x, speed.negate(), wind.y);
  const start = seed.xyz.mul(BOX);
  const world = mod(start.add(vec3(0, speed.mul(t).negate(), 0)).add(drifted).sub(cameraPosition), BOX).sub(BOX / 2).add(cameraPosition);
  // The streak: along the velocity (back up the way it came), across it facing the camera
  const along = normalize(velocity);
  const toCam = normalize(cameraPosition.sub(world));
  const across = normalize(cross(along, toCam));
  const width = seed.y.mul(0.006).add(0.007);
  const p = world.add(across.mul(positionGeometry.x.mul(width))).sub(along.mul(positionGeometry.y.mul(LENGTH)));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  material.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(p, 1)));

  // Thinning out towards the cube's faces and right at the lens; a streak fades at its ends and edges
  const offset = world.sub(cameraPosition);
  const a = abs(offset);
  const edge = smoothstep(BOX / 2, BOX * 0.36, max(a.x, max(a.y, a.z)));
  const near = smoothstep(0.3, 1.4, length(offset));
  const q = uv();
  const shape = smoothstep(0.5, 0.15, abs(q.x.sub(0.5))).mul(smoothstep(0, 0.25, q.y)).mul(smoothstep(1, 0.6, q.y));
  const light = night ? mix(float(1), float(0.22), night) : float(1);
  material.colorNode = vec3(0.72, 0.76, 0.82).mul(light);
  material.opacityNode = shape.mul(varying(edge.mul(near))).mul(fade).mul(0.42);

  const drops = QUALITY.mobile ? 6000 : 16000;
  const mesh = new THREE.Mesh(dropGeometry(drops), material);
  mesh.name = 'rainfall';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 10;
  mesh.visible = false;
  parent.add(mesh);

  return {
    mesh,
    setAmount(v) { amount = v; },
    /** The wind, 0 calm .. 1 a stiff breeze (from the south-west, as the valley's rain mostly comes) */
    setWind(v) { wind.value.set(1.6 * v, 1.1 * v); },
    update(camera) {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      drifted.value.x = (drifted.value.x + wind.value.x * dt) % BOX;
      drifted.value.z = (drifted.value.z + wind.value.y * dt) % BOX;
      const c = camera.position;
      const ground = groundHeight(c.x, c.z);
      const above = Number.isFinite(ground) ? c.y - ground : 0;
      const high = 1 - THREE.MathUtils.smoothstep(above, 200, 350);
      fade.value = amount * high;
      mesh.visible = fade.value > 0.01;
    }
  };
}
