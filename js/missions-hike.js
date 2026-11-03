// js/missions-hike.js
// The runtime of js/missions-data-hike.js:
//  - hikeTrail: red and white waymarks along the line (one merged mesh, their white tops self-lit so that they read before
//    dawn), a cairn at its end, and the hike's walk, time and time off the path. The walking itself is the controllers' own.
//  - sunriseClock: the one mission clock that moves. js/game-clock.js holds it for a mission; this moves the held time on, in
//    half minutes, so the light steps are no more than the world's usual, and lets it go on past the sunrise.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { gameClock, dayOf, MINUTES_PER_DAY } from './game-clock.js';
import { stepHike, lineLengths, pointAt, dawnMinute, dawnStart, sunriseMinute, DAWN } from './missions-data-hike.js';

const MARK_EVERY = 45; // m between the waymarks
const live = (run) => run.phase === 'ready' || run.phase === 'running';

const painted = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
};

/** The worn path, draped over the ground: pale enough to find by first light, a little self-lit for before it */
function buildPath(route) {
  const lengths = lineLengths(route), total = lengths[lengths.length - 1], pos = [], HALF = 0.75, STEP = 4;
  let prev = null;
  for (let s = 0; s <= total; s += STEP) {
    const p = pointAt(route, lengths, s), q = pointAt(route, lengths, s + 1.5), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const nx = dz / L * HALF, nz = -dx / L * HALF;
    const cur = [[p.x + nx, 0, p.z + nz], [p.x - nx, 0, p.z - nz]].map((v) => { v[1] = groundHeight(v[0], v[2]) + 0.14; return v; });
    if (prev) pos.push(...prev[0], ...cur[0], ...cur[1], ...prev[0], ...cur[1], ...prev[1]);
    prev = cur;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9c8f78, roughness: 1, emissive: 0x4a4436, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}

function buildMarks(route) {
  const lengths = lineLengths(route), total = lengths[lengths.length - 1];
  const body = [], glow = [];
  for (let s = 12; s < total; s += MARK_EVERY) {
    const p = pointAt(route, lengths, s), y = groundHeight(p.x, p.z);
    // a little to the side of the line, as a stake stands beside a path
    const q = pointAt(route, lengths, s + 2), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const x = p.x + (dz / L) * 1.1, z = p.z - (dx / L) * 1.1;
    const ground = Math.min(y, groundHeight(x, z));
    body.push(painted(new THREE.BoxGeometry(0.09, 1.2, 0.09).translate(x, ground + 0.6, z), 0xb3261e));
    // white, red, white, as a Swiss mountain path is marked
    glow.push(painted(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, ground + 1.12, z), 0xffffff));
    glow.push(painted(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, ground + 0.8, z), 0xffffff));
  }
  const end = route[route.length - 1], y = groundHeight(end[0], end[1]);
  for (let k = 0; k < 7; k++) { // the cairn
    const r = 0.75 - k * 0.09;
    body.push(painted(new THREE.DodecahedronGeometry(r, 0).translate(end[0] + 2.2 + (k % 2) * 0.1, y + 0.3 + k * 0.32, end[1] + 1.4 - (k % 3) * 0.08), 0x6a6862));
  }
  const solid = new THREE.Mesh(mergeGeometries(body), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const lit = new THREE.Mesh(mergeGeometries(glow), new MeshBasicNodeMaterial({ vertexColors: true }));
  for (const g of [...body, ...glow]) g.dispose();
  solid.castShadow = false;
  solid.frustumCulled = lit.frustumCulled = false;
  return [solid, lit];
}

const hikeTrail = {
  setup(run) {
    const route = run.def.createState().hike.route;
    const marks = run.hikeMarks = [...buildMarks(route), buildPath(route)];
    for (const m of marks) run.group.add(m);
  },
  update(run, ctx, dt) {
    const h = run.state?.hike;
    if (h && run.phase === 'running') stepHike(h, ctx.x, ctx.z, dt);
  }
};

const sunriseClock = {
  setup(run) { run.dawn = { day: dayOf(gameClock.total), shown: -1, watch: 0 }; },
  reset(run) {
    run.dawn.day = dayOf(gameClock.total);
    run.dawn.shown = -1; run.dawn.watch = 0;
  },
  update(run, ctx, dt) {
    const h = run.state?.hike, d = run.dawn;
    if (!h || !live(run)) return;
    const rise = sunriseMinute();
    let minute = dawnMinute(h);
    if (h.arrivedAt !== null) {
      // on the summit: the clock runs up to the sunrise and a little past it, in a set time however early you came
      d.watch += dt;
      const from = d.from ?? (d.from = minute), t = Math.min(1, d.watch / DAWN.watch);
      minute = Math.max(from, from + (Math.max(rise, from) + DAWN.afterglow - from) * t);
      if (t >= 1) run.state.watched = true;
    }
    minute = Math.max(dawnStart(), Math.min(rise + 40, minute));
    const step = Math.round(minute * 2) / 2;
    if (step !== d.shown) { d.shown = step; gameClock.jumpTo(d.day * MINUTES_PER_DAY + step); }
  }
};

export const HIKE_FEATURES = { hikeTrail, sunriseClock };
