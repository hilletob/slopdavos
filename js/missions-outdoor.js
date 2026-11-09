import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { PersonCrowd, PersonRig, rollHairstyle } from './pedestrians.js';
import { t } from './i18n.js';
import { createSkater } from './missions-data-ice.js';
import { ICE_FEATURES, buildIceHud, edge, meter, poseSkater, touchLabel } from './missions-ice.js';
import { cheerArms } from './missions-sport.js';
import {
  ROPE, ROPE_KINDS, ROPE_LADDER, ROPE_LEGS, ROPE_STATIONS, ropeAloft, ropePose, stepRope,
  POND, POND_POSTS, POND_RING, containPond, inPond, pondBankPoints, pondLine, startPondGame, stepPond
} from './missions-data-outdoor.js';

// js/missions-outdoor.js
// The runtime of js/missions-data-outdoor.js, as features of js/missions.js (OUTDOOR_FEATURES, merged into its FEATURES):
//   ropePark   — the rope course in the Färich: posts on the real tree sites, decks, a ladder, the crossings (each one mesh
//                that swings with the walker's sway), the safety cables, the zipline with its mattress, the guide. On the
//                ground the player walks as ever (the controllers' own updatePerson); aloft personDriver and personPoser are
//                the course's (the skater's pose of js/missions-ice.js, without the blades).
//   pondHockey — the Seehof Seeli frozen over: the pond's real outline as ice, snow banks, lanterns, boots and jackets for
//                goal posts, the spectators and five skating locals (js/pedestrians.js, mixed hair by rollHairstyle). The
//                skater, the HUD, the shooting camera are js/missions-ice.js's (`skates`, its hockey camera).
// Each is merged geometry on one shared-per-run vertex-colour material, built on entry; everything goes with the run's
// group and its cleanups (MissionRun.dispose).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = t(text); return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const standGround = (_o, x, z) => groundHeight(x, z);
const walkGround = (c, x, z, nearY) => c.getGroundHeight(x, z, 'person', nearY);
const setText = (node, text) => { const v = t(text); if (node.textContent !== v) node.textContent = v; };

// --- Merged geometry: boxes, tubes, quads in one vertex-coloured buffer ------------------------------------------------
const _c = new THREE.Color();
class Mesher {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, colour) {
    _c.set(colour);
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(_c.r, _c.g, _c.b);
  }
  quad(a, b, c, d, colour) { this.tri(a, b, c, colour); this.tri(a, c, d, colour); }
  /** A box centred on (x, y, z), `yaw` round y */
  box(x, y, z, sx, sy, sz, yaw, colour) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const P = (a, b, c) => [x + a * sx * 0.5 * co + c * sz * 0.5 * s, y + b * sy * 0.5, z - a * sx * 0.5 * s + c * sz * 0.5 * co];
    const f = (p, q, r, u) => this.quad(p, q, r, u, colour);
    f(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1));
    f(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1));
    f(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1));
    f(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1));
    f(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1));
    f(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
  }
  /** A round bar from a to b (arrays [x, y, z]) */
  tube(a, b, r, colour, n = 5, r2 = r) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const u = new THREE.Vector3(Math.abs(d.y) > 0.9 ? 1 : 0, Math.abs(d.y) > 0.9 ? 0 : 1, 0).cross(d).normalize();
    const v = new THREE.Vector3().crossVectors(d, u);
    const ring = (p, rad, i) => { const k = (i / n) * Math.PI * 2, c = Math.cos(k) * rad, s = Math.sin(k) * rad; return [p[0] + u.x * c + v.x * s, p[1] + u.y * c + v.y * s, p[2] + u.z * c + v.z * s]; };
    for (let i = 0; i < n; i++) this.quad(ring(a, r, i), ring(a, r, i + 1), ring(b, r2, i + 1), ring(b, r2, i), colour);
  }
  mesh(material, origin = null) {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(this.pos);
    if (origin) for (let i = 0; i < a.length; i += 3) { a[i] -= origin[0]; a[i + 1] -= origin[1]; a[i + 2] -= origin[2]; }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    if (origin) m.position.set(origin[0], origin[1], origin[2]);
    m.frustumCulled = false;
    return m;
  }
}
const vertexMaterial = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide, ...o });

/** The point where a person's bone sits in the world (rig.pose: 8 floats a bone: quaternion, translation) */
const _boneQ = new THREE.Quaternion();
function bonePoint(rig, bone, out, up = 0) {
  const a = rig.pose, o = bone * 8;
  _boneQ.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
  out.copy(rig.bind[bone]).multiplyScalar(rig.s);
  out.y += up;
  return out.applyQuaternion(_boneQ).add({ x: a[o + 4], y: a[o + 5], z: a[o + 6] });
}
const HEAD_BONE = 2, CHEST_BONE = 1;
const _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** A unit bar (0..1 along +z), stretched between two points every frame */
function stretch(mesh, a, b) {
  mesh.position.copy(a);
  mesh.lookAt(b);
  mesh.scale.set(1, 1, a.distanceTo(b));
}

// =====================================================================================================================
// The rope park
// =====================================================================================================================
const WOOD = 0x8a6236, WOOD2 = 0x6e4c29, BARK = 0x4d3a28, CABLE = 0x34383d, ROPE_C = 0xcdbb8a, TYRE = 0x17181a, MAT = 0x2d6fd0;
const CABLE_OVER = 2.0, RAIL_OVER = 1.1;

function buildDeck(m, s, y, ground) {
  m.tube([s.x, ground - 0.3, s.z], [s.x, y + 3.6, s.z], 0.2, BARK, 7, 0.13); // (a post on the tree site: the mobile profile plants only a share of the forest's trees)
  for (let k = -2; k <= 2; k++) {
    const yaw = 0.3;
    const ox = Math.cos(yaw) * k * 0.56, oz = -Math.sin(yaw) * k * 0.56;
    const L = 2 * Math.sqrt(Math.max(0.2, ROPE.deckR ** 2 - (k * 0.56) ** 2));
    m.box(s.x + ox, y - 0.06, s.z + oz, 0.5, 0.1, L, yaw, k % 2 ? WOOD : WOOD2);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    m.tube([s.x + Math.cos(a) * 1.25, y - 0.1, s.z + Math.sin(a) * 1.25], [s.x, y - 1.3, s.z], 0.04, WOOD2, 4); // (the struts under the deck)
  }
}

function buildLadder(m, ground, top) {
  const L = ROPE_LADDER, sx = Math.cos(L.heading) * 0.24, sz = -Math.sin(L.heading) * 0.24;
  for (const k of [-1, 1]) m.tube([L.x + sx * k, ground - 0.2, L.z + sz * k], [L.x + sx * k, top + 1, L.z + sz * k], 0.035, WOOD2, 4);
  for (let y = ground + 0.3; y < top + 0.8; y += 0.32) m.tube([L.x - sx, y, L.z - sz], [L.x + sx, y, L.z + sz], 0.024, WOOD, 4);
}

/** One crossing as its own mesh, with its origin on the cable: the bridge and the tyres swing from there */
function buildCrossing(leg, y0, y1, material) {
  const m = new Mesher();
  const d = leg.dir, sx = -d.z, sz = d.x; // (d: along, s: across)
  const heading = Math.atan2(d.x, d.z);
  const P = (s, off = 0, up = 0) => { const f = s / leg.len; return [leg.out.x + d.x * s + sx * off, y0 + (y1 - y0) * f + up, leg.out.z + d.z * s + sz * off]; };
  const L = leg.len;
  if (leg.kind === 'bridge' || leg.kind === 'wild') {
    const gap = leg.kind === 'wild' ? 0.62 : 0.34, plank = 0.2;
    for (let s = 0.1; s < L; s += plank + gap) { const c = P(s + plank / 2); m.box(c[0], c[1] - 0.04, c[2], 0.66, 0.05, plank, heading, s % 0.7 > 0.35 ? WOOD : WOOD2); }
    for (const k of [-1, 1]) {
      m.tube(P(0, k * 0.3, -0.08), P(L, k * 0.3, -0.08), 0.02, ROPE_C, 4);
      m.tube(P(0, k * 0.52, RAIL_OVER), P(L, k * 0.52, RAIL_OVER), 0.018, ROPE_C, 4);
      for (let s = 0; s <= L; s += 1.6) m.tube(P(s, k * 0.3, -0.08), P(s, k * 0.52, RAIL_OVER), 0.009, ROPE_C, 3);
    }
  } else if (leg.kind === 'beam') {
    m.tube(P(0, 0, -0.1), P(L, 0, -0.1), 0.095, WOOD, 7); // (a single round log: the ropes only stop it rolling away)
    for (let s = 2.5; s < L; s += 3.5) m.tube(P(s, 0, -0.04), P(s, 0, CABLE_OVER), 0.01, ROPE_C, 3);
  } else if (leg.kind === 'tyres') {
    const step = ROPE_KINDS.tyres.step;
    for (let s = step * 0.5; s < L; s += step) {
      const c = P(s);
      const R = 0.36, n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        m.tube([c[0] + Math.cos(a0) * R, c[1] - 0.05, c[2] + Math.sin(a0) * R], [c[0] + Math.cos(a1) * R, c[1] - 0.05, c[2] + Math.sin(a1) * R], 0.1, TYRE, 5);
      }
      for (const k of [-1, 1]) m.tube([c[0] + sx * k * 0.36, c[1], c[2] + sz * k * 0.36], [c[0], c[1] + CABLE_OVER, c[2]], 0.012, ROPE_C, 3);
    }
  }
  const mid = P(L / 2, 0, CABLE_OVER);
  const mesh = m.mesh(material, mid);
  mesh.castShadow = false;
  return mesh;
}

/** The course's static parts: posts, decks, the cables that stay put, the ladder, the zipline and its mattress */
function buildCourse(run, rp, material) {
  const m = new Mesher();
  ROPE_LEGS.forEach((leg, i) => {
    const y = rp.decks[i];
    buildDeck(m, ROPE_STATIONS[i], y, groundHeight(leg.x, leg.z));
    if (leg.kind === 'zip') return;
    const y1 = rp.decks[i + 1], b = ROPE_LEGS[i + 1];
    m.tube([leg.x, y + CABLE_OVER, leg.z], [b.x, y1 + CABLE_OVER, b.z], 0.018, CABLE, 4); // the safety cable, post to post
  });
  buildLadder(m, rp.groundY, rp.decks[0]);
  // the zipline: from high on the last post to the pole by the mattress
  const last = ROPE_LEGS[ROPE_LEGS.length - 1], Z = ROPE.zip, land = ROPE.landing;
  const topY = rp.decks[ROPE_LEGS.length - 1] + Z.cableOverDeck;
  const endY = rp.landY + Z.hang + 0.2;
  m.tube([last.out.x, topY, last.out.z], [land.x, endY, land.z], 0.022, CABLE, 4);
  m.tube([last.x, topY, last.z], [last.out.x, topY, last.out.z], 0.022, CABLE, 4);
  m.tube([land.x + last.dir.x * 1.6, rp.landY - 0.3, land.z + last.dir.z * 1.6], [land.x + last.dir.x * 1.6, endY + 0.8, land.z + last.dir.z * 1.6], 0.14, BARK, 7, 0.11);
  m.tube([land.x, endY, land.z], [land.x + last.dir.x * 1.6, endY + 0.3, land.z + last.dir.z * 1.6], 0.022, CABLE, 4);
  m.box(land.x + last.dir.x * 0.3, rp.landY + 0.22, land.z + last.dir.z * 0.3, 2.2, 0.5, 2.6, Math.atan2(last.dir.x, last.dir.z), MAT);
  const mesh = m.mesh(material);
  mesh.castShadow = true;
  run.group.add(mesh);
}

function ropeGuide(run, rp) {
  // the guide under the first bridge and two who came to watch (a small crowd of the city's figures)
  const spots = [
    { x: ROPE_LEGS[0].x - 3.5, z: ROPE_LEGS[0].z + 6, face: ROPE_LEGS[0] },
    { x: ROPE_LEGS[2].x - 3, z: ROPE_LEGS[2].z - 5, face: ROPE_LEGS[2] },
    { x: ROPE_LEGS[3].x + 2.5, z: ROPE_LEGS[3].z - 5, face: ROPE_LEGS[3] }
  ];
  const crowd = new PersonCrowd(spots.length, { farDistance: 60, castShadow: false });
  for (const mesh of crowd.meshes) run.group.add(mesh);
  rp.crowd = crowd;
  rp.watchers = spots.map((s, i) => {
    const roll = ((i + 2) * 0.6180339) % 1, female = i === 1;
    return { rig: new PersonRig({ seed: (i * 0.37 + 0.2) % 1, female, girth: 1, scale: 0.98, ...rollHairstyle(roll, female) }), x: s.x, z: s.z, yaw: Math.atan2(s.face.x - s.x, s.face.z - s.z), ph: i };
  });
}

const ropePark = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const material = vertexMaterial();
    const rp = run.rope = {
      decks: ROPE_STATIONS.map((s) => groundHeight(s.x, s.z) + s.h),
      groundY: groundHeight(ROPE_LADDER.x, ROPE_LADDER.z),
      landY: groundHeight(ROPE.landing.x, ROPE.landing.z),
      crossings: [], camera: null, phase: 0, bigAt: 0, flashAt: 0, aloftWas: false, wave: 0
    };
    buildCourse(run, rp, material);
    ROPE_LEGS.forEach((leg, i) => {
      if (leg.kind === 'zip') { rp.crossings.push(null); return; }
      const mesh = buildCrossing(leg, rp.decks[i], rp.decks[i + 1], material);
      run.group.add(mesh);
      rp.crossings.push(mesh);
    });
    ropeGuide(run, rp);
    // the lanyards and the helmet
    const line = new THREE.BoxGeometry(0.02, 0.02, 1).translate(0, 0, 0.5);
    const lanyardMat = new THREE.MeshStandardMaterial({ color: 0xe8862a, roughness: 0.7 });
    rp.lanyards = [new THREE.Mesh(line, lanyardMat), new THREE.Mesh(line, lanyardMat)];
    for (const l of rp.lanyards) { l.frustumCulled = false; l.visible = false; run.group.add(l); }
    rp.helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xd8302a, roughness: 0.5 }));
    rp.helmet.visible = false;
    run.group.add(rp.helmet);
    // HUD: the balance needle, the carabiners
    const { hud, flash, big } = buildIceHud(run);
    const mt = meter();
    mt.zone.style.left = '30%'; mt.zone.style.right = '30%';
    mt.fill.style.display = 'none';
    const row = el('div', 'ice-row');
    rp.ui = { hud, flash, big, mt, row, clips: el('span') };
    row.append(rp.ui.clips, mt.m);
    hud.append(row, flash);
    run.hints([[['W'], 'walk'], [['A', 'D'], 'balance'], [['Space'], 'clip'], [['S'], 'brake']]);
    cm.personDriver = (dt) => ropePark.drive(run, dt, cm);
    cm.personPoser = (dt, p) => ropePark.pose(run, dt, p, cm);
    run.cleanups.push(() => {
      ropePark.clearNear(run);
      cm.personDriver = null;
      cm.personPoser = null;
      const p = cm.entities.person;
      p.rig.placed = false;
      p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
      p.speed = 0;
    });
  },
  reset(run) {
    const rp = run.rope;
    rp.camera = null;
    ropePark.clearNear(run);
    rp.pose = null;
    rp.aloftWas = false;
    run.hooks.controllerManager.entities.person.rig.placed = false;
    touchLabel(run, 'Clip');
    run._edge_up = true;
    rp.ui.flash.textContent = '';
    rp.ui.big.classList.remove('is-on');
    for (const c of rp.crossings) if (c) c.rotation.set(0, 0, 0);
    for (const l of rp.lanyards) l.visible = false;
    rp.helmet.visible = false;
  },
  /** On the ground the ordinary walk; aloft the course places the walker */
  drive(run, dt, cm) {
    const g = run.state;
    const p = cm.entities.person;
    if (!g || !ropeAloft(g) || !live(run)) {
      if (run.phase === 'intro' || run.phase === 'loading') { p.speed = 0; return; }
      cm.updatePerson(dt);
      return;
    }
    const rp = run.rope;
    const q = rp.pose = ropePose(g, rp.decks, rp.landY, rp.groundY);
    let x = q.x, y = q.y, z = q.z;
    if (g.stage === 'dangle') {
      // below the crossing, on the lanyards
      const k = Math.min(1, g.dangle * 5);
      y -= 1.75 * k;
    }
    p.position.set(x, y, z);
    p.heading = q.heading;
    p.speed = g.stage === 'zip' ? g.zipV : g.stage === 'cross' ? +cm.keys.forward * ROPE_KINDS[ROPE_LEGS[g.st].kind].speed : g.stage === 'deck' ? +cm.keys.forward * ROPE.walk : 0;
    p.verticalVel = 0;
  },
  pose(run, dt, p, cm) {
    const g = run.state, rp = run.rope;
    if (!g || !ropeAloft(g) || !live(run)) {
      const air = p.position.y - cm.getGroundHeight(p.position.x, p.position.z, 'person', p.position.y);
      p.rig.update(dt, p.position.x, p.position.z, p.heading, walkGround, cm, air > 0.02 ? air : 0);
      for (const l of rp.lanyards) l.visible = false;
      rp.helmet.visible = false;
      return;
    }
    const v = Math.abs(p.speed);
    rp.phase += v * dt * 4.2;
    const opts = { crouch: 0.32, phase: rp.phase, push: clamp(v / 2.2, 0, 0.75), lean: g.stage === 'cross' ? clamp(g.sway, -1, 1) * 0.55 : 0, arms: 'stick' };
    let yaw = p.heading;
    if (g.stage === 'dangle') {
      // comic: slowly turning on the lanyards, legs and arms going
      yaw += g.dangle * 2.1;
      opts.lean = Math.sin(g.dangle * 3.4) * 0.5;
      opts.crouch = 0.75;
      opts.push = 1;
      opts.phase = g.dangle * 11;
      opts.arms = 'swing';
    } else if (g.stage === 'zip') { opts.crouch = 0.9; opts.push = 0; opts.lean = 0; opts.lunge = 0.25; } else if (g.stage === 'climb') { opts.crouch = 0.15; opts.push = 0.5; opts.phase = g.h * 5; }
    poseSkater(p.rig, p.position.x, p.position.y - 0.09, p.position.z, yaw, opts);
    // the helmet on the head, the lanyards from the chest to the cable
    bonePoint(p.rig, HEAD_BONE, _a, 0);
    rp.helmet.visible = !p.crowd?.model; // (made for the lofted head: a Rocketbox figure goes without, js/player-figure.js)
    rp.helmet.position.copy(_a).addScaledVector(_up, 0.075);
    rp.helmet.rotation.y = yaw;
    const q = rp.pose;
    if (q) {
      bonePoint(p.rig, CHEST_BONE, _a, 0.14);
      const cableY = g.stage === 'dangle' ? q.cable : g.stage === 'zip' ? q.cable : q.cable;
      rp.lanyards.forEach((l, i) => {
        const clipped = g.stage === 'zip' || g.stage === 'cross' || g.stage === 'dangle' || (g.stage === 'deck' && g.clips > i);
        l.visible = clipped;
        if (clipped) { _b.set(q.x + (i ? 0.1 : -0.1) * Math.cos(yaw), cableY, q.z - (i ? 0.1 : -0.1) * Math.sin(yaw)); stretch(l, _a, _b); }
      });
    }
  },
  update(run, ctx, dt, cm) {
    const g = run.state, rp = run.rope, k = cm.keys;
    if (!g) return;
    const pressed = edge(run, cm, 'up');
    stepRope(g, dt, { forward: +k.forward || 0, back: +k.backward || 0, steer: (+k.left || 0) - (+k.right || 0), clip: pressed, x: ctx.x, z: ctx.z });
    for (const e of g.events) ropePark.event(run, e);
    g.events.length = 0;
    // the crossing under the walker swings with the lean (the others at rest, but for a little breath)
    rp.crossings.forEach((mesh, i) => {
      if (!mesh) return;
      const active = g.st === i && (g.stage === 'cross' || g.stage === 'dangle');
      const leg = ROPE_LEGS[i];
      const amp = leg.kind === 'beam' ? 0.02 : leg.kind === 'tyres' ? 0.16 : 0.09;
      const target = active ? clamp(g.sway, -1, 1) * amp : Math.sin(performance.now() * 0.0012 + i) * 0.012;
      mesh.quaternion.setFromAxisAngle(_b.set(leg.dir.x, 0, leg.dir.z), target);
    });
    // HUD
    setText(rp.ui.clips, g.stage === 'deck' ? `Carabiners ${g.clips}/2` : g.stage === 'cross' ? 'Balance' : '');
    const showNeedle = g.stage === 'cross';
    rp.ui.row.hidden = g.stage !== 'cross' && g.stage !== 'deck';
    rp.ui.mt.m.style.visibility = showNeedle ? 'visible' : 'hidden';
    if (showNeedle) rp.ui.mt.needle.style.left = `${clamp((1 - g.sway) * 50, 0, 100)}%`;
    if (rp.flashAt && performance.now() - rp.flashAt > 2600) { rp.ui.flash.textContent = ''; rp.flashAt = 0; }
    if (rp.bigAt && performance.now() - rp.bigAt > 1400) { rp.ui.big.classList.remove('is-on'); rp.bigAt = 0; }
  },
  say(run, text, kind) {
    const f = run.rope.ui.flash;
    f.textContent = t(text);
    f.className = `ice-flash ${kind}`;
    run.rope.flashAt = performance.now();
  },
  shout(run, text, colour = '#ffffff') {
    const { big } = run.rope.ui;
    big.textContent = t(text);
    big.style.color = colour;
    big.classList.add('is-on');
    run.rope.bigAt = performance.now();
  },
  event(run, e) {
    if (e.kind === 'clip') { run.audio?.thump?.(); ropePark.say(run, e.n === 1 ? 'Click: one carabiner' : 'Click: both clipped', 'is-good'); }
    else if (e.kind === 'scold') { run.audio?.thump?.(); ropePark.say(run, e.line, 'is-bad'); ropePark.shout(run, 'WHISTLE!', '#ff7a6b'); run.rope.wave = 2.5; }
    else if (e.kind === 'fall') { run.audio?.boom?.(60, 0.2); ropePark.say(run, 'Whoops: hanging in your harness  +5 s', 'is-bad'); ropePark.shout(run, 'WHOOPS!', '#ffc83d'); run.rope.wave = 3; }
    else if (e.kind === 'winch') ropePark.say(run, 'The guide winches you back', 'is-good');
    else if (e.kind === 'arrive') ropePark.say(run, 'New deck: clip in again', 'is-good');
    else if (e.kind === 'zip') { ropePark.say(run, 'Off you go!', 'is-gold'); run.rope.wave = 2; }
    else if (e.kind === 'soft') ropePark.say(run, 'A soft landing', 'is-gold');
    else if (e.kind === 'crash') { run.audio?.boom?.(40, 0.25); ropePark.say(run, 'Into the mattress at full speed  +3 s', 'is-bad'); ropePark.shout(run, 'OOF!', '#ffc83d'); }
  },
  after(run, ctx, dt, cm) {
    const rp = run.rope, g = run.state;
    if (!g) return;
    // the guide and the watchers: arms up when something happens
    rp.wave = Math.max(0, rp.wave - dt);
    rp.crowd.begin();
    for (const w of rp.watchers) {
      w.rig.update(dt, w.x, w.z, w.yaw, standGround);
      if (rp.wave > 0) cheerArms(w.rig, w.ph += dt * 6, 1);
      rp.crowd.add(w.rig, 0);
    }
    rp.crowd.end();
    if (live(run) && ropeAloft(g) && g.stage !== 'climb') ropePark.camera(run, ctx, dt, cm);
    else { rp.camera = null; ropePark.clearNear(run); }
  },
  /** The camera's near plane back as it was */
  clearNear(run) {
    const rp = run.rope, cam = run.hooks.cameraSystem.camera;
    if (rp.nearWas === undefined || !cam) return;
    cam.near = rp.nearWas;
    cam.updateProjectionMatrix();
    rp.nearWas = undefined;
  },
  /** Aloft: behind and a little above the walker, along the crossing. The forest's crowns stand all round up here: the near
   *  plane sits just short of the walker, so that the leaves between the camera and him are cut away */
  camera(run, ctx, dt, cm) {
    const p = cm.entities.person, cam = ctx.camera, rp = run.rope, g = run.state;
    const yaw = p.heading + clamp(run.hooks.cameraSystem.orbitYawOffset || 0, -1.2, 1.2);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const y = p.position.y; // (down with him when he dangles: that is the show)
    const back = g.stage === 'zip' ? 4.4 : g.stage === 'dangle' ? 4.8 : 3.6;
    if (rp.nearWas === undefined) rp.nearWas = cam.near;
    const near = back - 1.1;
    if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
    const want = { x: p.position.x - fx * back + fz * 0.7, y: y + 2.3, z: p.position.z - fz * back - fx * 0.7, lx: p.position.x + fx * 5, ly: y + 0.7, lz: p.position.z + fz * 5 };
    const c = rp.camera || (rp.camera = { ...want });
    const k = Math.min(1, dt * 6);
    for (const key of Object.keys(want)) c[key] += (want[key] - c[key]) * k;
    cam.position.set(c.x, c.y, c.z);
    cam.lookAt(c.lx, c.ly, c.lz);
    cam.updateMatrixWorld();
  }
};

// =====================================================================================================================
// Pond hockey
// =====================================================================================================================
const TEAM_COLOUR = [0x2a6be0, 0xe0702a];
const JACKET = [0x8c2a2a, 0x2c5a3a, 0x2a3f6e, 0x7a5a1f];

function iceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#cfe3ee';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = `rgba(${i % 3 ? '255,255,255' : '140,170,190'},${0.18 + (i % 5) * 0.05})`;
    x.lineWidth = 0.6 + (i % 3) * 0.5;
    x.beginPath();
    const a = i * 12.9898, px = (Math.sin(a) * 0.5 + 0.5) * 256, py = (Math.cos(a * 1.7) * 0.5 + 0.5) * 256, l = 20 + (i % 7) * 12, d = a * 0.7;
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(d) * l * 0.5 + 6, py + Math.sin(d) * l * 0.5 - 6, px + Math.cos(d) * l, py + Math.sin(d) * l);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The ice's height: just over the highest ground under the pond (and whatever water the city draws in it) */
export function pondIceY() {
  let m = -Infinity;
  for (let i = 0; i < POND_RING.length; i += 2) {
    const x = POND.centre.x + (POND_RING[i] - POND.centre.x) * 0.92, z = POND.centre.z + (POND_RING[i + 1] - POND.centre.z) * 0.92;
    m = Math.max(m, groundHeight(x, z));
  }
  for (let x = 700; x < 756; x += 6) for (let z = -1448; z < -1390; z += 6) if (inPond(x, z)) m = Math.max(m, groundHeight(x, z));
  return m + 0.14;
}

function buildPond(run, iceY, material) {
  const O = POND.centre;
  // the ice in the pond's real shape
  const shape = new THREE.Shape();
  for (let i = 0; i < POND_RING.length; i += 2) {
    const sx = POND_RING[i] - O.x, sz = POND_RING[i + 1] - O.z;
    if (i) shape.lineTo(sx, sz); else shape.moveTo(sx, sz);
  }
  shape.closePath();
  const iceGeo = new THREE.ShapeGeometry(shape);
  const uv = iceGeo.attributes.uv, pa = iceGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / 14, pa.getY(i) / 14);
  iceGeo.rotateX(Math.PI / 2);
  const tex = iceTexture();
  const ice = new THREE.Mesh(iceGeo, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x9fb8cc, emissiveIntensity: 0.42, roughness: 0.22, side: THREE.DoubleSide }));
  ice.position.set(O.x, iceY, O.z);
  ice.receiveShadow = true;
  ice.frustumCulled = false;
  run.group.add(ice);
  // the snow bank, shovelled up all round
  const m = new Mesher();
  const n = POND_RING.length / 2;
  const SECTION = [[-0.5, 0.02], [0.3, 0.28], [1.1, 0.72], [2.2, 0.45], [3.6, -0.6]];
  const ringAt = (i) => {
    const k = (i + n) % n, x = POND_RING[k * 2], z = POND_RING[k * 2 + 1];
    const ax = POND_RING[((k + 1) % n) * 2] - POND_RING[((k - 1 + n) % n) * 2], az = POND_RING[((k + 1) % n) * 2 + 1] - POND_RING[((k - 1 + n) % n) * 2 + 1];
    const L = Math.hypot(ax, az) || 1;
    let ox = az / L, oz = -ax / L;
    if ((x - O.x) * ox + (z - O.z) * oz < 0) { ox = -ox; oz = -oz; }
    return { x, z, ox, oz, n: 1 + 0.22 * Math.sin(k * 2.4) + 0.14 * Math.cos(k * 5.1) };
  };
  const V = (r, s) => {
    const [off, h] = SECTION[s];
    const x = r.x + r.ox * off, z = r.z + r.oz * off;
    return [x, Math.max(iceY + h * r.n, groundHeight(x, z) + h * 0.55 * r.n), z];
  };
  for (let i = 0; i < n; i++) {
    const a = ringAt(i), b = ringAt(i + 1);
    for (let s = 0; s < SECTION.length - 1; s++) m.quad(V(a, s), V(b, s), V(b, s + 1), V(a, s + 1), s < 3 ? 0xf1f4f8 : 0xdde3ea);
  }
  // the goal posts: a pair of boots and a jacket on each side of the mouths
  POND_POSTS.forEach((p, i) => {
    const y = iceY;
    m.box(p.x - 0.05, y + 0.12, p.z - 0.09, 0.13, 0.24, 0.3, 0.2, 0x2a211b);
    m.box(p.x + 0.05, y + 0.12, p.z + 0.09, 0.13, 0.24, 0.3, -0.3, 0x2a211b);
    m.box(p.x, y + 0.27, p.z, 0.46, 0.09, 0.42, 0.5 * i, JACKET[i % JACKET.length]);
  });
  // a puck-coloured face-off spot, and the lanterns on the bank (warm, self-lit: no extra lights to pay for)
  const lamp = new Mesher();
  for (const q of pondBankPoints(3, 6)) {
    const g0 = Math.max(groundHeight(q.x, q.z), iceY);
    m.tube([q.x, g0 - 0.3, q.z], [q.x, g0 + 2.5, q.z], 0.04, 0x3a3f46, 4);
    lamp.box(q.x, g0 + 2.62, q.z, 0.26, 0.28, 0.26, 0, 0xffc77a);
  }
  const bank = m.mesh(material);
  bank.receiveShadow = true;
  run.group.add(bank);
  const glow = lamp.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  run.group.add(glow);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8aa3bb, transparent: true, opacity: 0.6, depthWrite: false }));
  spot.position.set(POND.spot.x, iceY + 0.012, POND.spot.z);
  run.group.add(spot);
}

const pondHockey = {
  setup(run) {
    const iceY = pondIceY();
    const cm = run.hooks.controllerManager;
    const ice = run.ice;
    ice.surf = () => iceY;
    // (js/missions-ice.js `skates`: this sheet's edge instead of the rink's boards)
    const q = { x: 0, z: 0 };
    ice.contain = (p, sk) => {
      q.x = p.position.x; q.z = p.position.z;
      if (containPond(q, 0.75)) { p.position.x = q.x; p.position.z = q.z; sk.speed *= 0.5; }
    };
    const material = vertexMaterial();
    buildPond(run, iceY, material);
    // the people: five locals on skates (hair mixed by rollHairstyle) and the spectators on the bank
    const watchers = pondBankPoints(2.8, 4).slice(0, 8).map((s, i) => ({ ...s, y: Math.max(groundHeight(s.x, s.z), iceY), ph: i * 1.1 }));
    const crowd = new PersonCrowd(5 + watchers.length, { farDistance: 70, castShadow: false });
    for (const mesh of crowd.meshes) run.group.add(mesh);
    const rig = (i) => {
      const roll = ((i + 1) * 0.6180339) % 1, female = i % 3 === 1;
      return new PersonRig({ seed: (i * 0.391 + 0.11) % 1, female, girth: 0.95 + (i % 4) * 0.05, scale: 0.94 + (i % 3) * 0.05, ...rollHairstyle(roll, female) });
    };
    const P = run.pond = { iceY, crowd, skaters: [1, 2, 3, 4, 5].map((i) => ({ i, rig: rig(i) })), watchers: watchers.map((w, i) => ({ ...w, rig: rig(i + 6) })), cheer: 0, bigAt: 0, flashAt: 0 };
    // sticks and bibs (the team colours); one mesh each, on shared geometry and materials
    const stickGeo = new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0, 0.5);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x31261b, roughness: 0.7 });
    const bibGeo = new THREE.BoxGeometry(0.33, 0.4, 0.2);
    const bibMats = TEAM_COLOUR.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    P.sticks = [0, 1, 2, 3, 4, 5].map(() => { const m = new THREE.Mesh(stickGeo, stickMat); m.frustumCulled = false; run.group.add(m); return m; });
    P.bibs = [0, 1, 2, 3, 4, 5].map((i) => { const m = new THREE.Mesh(bibGeo, bibMats[i < 3 ? 0 : 1]); m.frustumCulled = false; run.group.add(m); return m; });
    P.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 }));
    P.puck.frustumCulled = false;
    run.group.add(P.puck);
    P.aim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.55, depthWrite: false }));
    P.aim.frustumCulled = false;
    run.group.add(P.aim);
    // HUD: the score over the skates' panel, the flash
    const ui = ice.ui;
    ui.line = el('div', 'ice-tally');
    ui.hud.append(ui.line, ui.flash);
    run.hints([[['W'], 'skate'], [['A', 'D'], 'steer'], [['S'], 'stop'], [['Space'], 'shoot / poke'], [['Drag'], 'aim']]);
    // a click (not a drag) on the view does what Space does
    let down = null;
    const canvas = document.getElementById('canvas-container');
    run.listen(canvas, 'pointerdown', (e) => { if (e.pointerType !== 'touch' && e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    run.listen(canvas, 'pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 300) run._clickShot = true; down = null; });
    void cm;
  },
  reset(run) {
    // (the teleport walks a pedestrian out of water, onto the bank: the mission starts on the ice, so it is put back there)
    const cm = run.hooks.controllerManager, p = cm.entities.person, s = run.def.start;
    p.position.set(s.x, run.pond.iceY, s.z);
    p.heading = s.heading;
    p.speed = 0;
    run.ice.skater = createSkater(s.heading);
    run.lastPos.copy(p.position);
    run.hooks.cameraSystem.resetForTeleport?.();
    touchLabel(run, 'Shoot');
    run.iceCam = null;
    run.hooks.cameraSystem.orbitYawOffset = 0;
    run._clickShot = false;
    run._edge_up = true;
    run.ice.frozen = false;
    run.ice.ui.big.classList.remove('is-on');
    run.ice.ui.flash.textContent = '';
    run.pond.cheer = 0;
    pondHockey.draw(run, 0);
  },
  teardown(run) { run.hooks.cameraSystem.orbitYawOffset = 0; },
  aim(run, p) { return p.heading + clamp(run.hooks.cameraSystem.orbitYawOffset || 0, -0.6, 0.6); },
  update(run, ctx, dt, cm) {
    const g = run.state.game, p = cm.entities.person, P = run.pond;
    if (run.index >= 1) startPondGame(g);
    const pressed = edge(run, cm, 'up') || run._clickShot;
    run._clickShot = false;
    const inp = { x: p.position.x, z: p.position.z, heading: p.heading, speed: run.ice.skater.speed, aim: pondHockey.aim(run, p), press: pressed };
    if (run.phase === 'running') stepPond(g, dt, inp);
    for (const e of g.events) pondHockey.event(run, e, cm);
    g.events.length = 0;
    run.ice.frozen = g.phase === 'faceoff';
    P.cheer = Math.max(0, P.cheer - dt);
    if (run.ice.bigAt && performance.now() - run.ice.bigAt > 1600) { run.ice.ui.big.classList.remove('is-on'); run.ice.bigAt = 0; }
    if (P.flashAt && performance.now() - P.flashAt > 1800) { run.ice.ui.flash.textContent = ''; P.flashAt = 0; }
    setText(run.ice.ui.line, g.phase === 'wait' ? 'Skate to the centre spot' : pondLine(g));
  },
  say(run, text, kind) {
    const ui = run.ice.ui;
    ui.flash.textContent = t(text);
    ui.flash.className = `ice-flash ${kind}`;
    run.pond.flashAt = performance.now();
  },
  shout(run, text, colour) {
    const { big } = run.ice.ui;
    big.textContent = t(text);
    big.style.color = colour;
    big.classList.add('is-on');
    run.ice.bigAt = performance.now();
  },
  event(run, e, cm) {
    if (e.kind === 'faceoff') {
      // to the face-off (a short skate within the run: the watchdog's "teleport" is told)
      const p = cm.entities.person;
      p.position.set(e.x, run.pond.iceY, e.z);
      p.heading = e.heading;
      run.ice.skater = createSkater(e.heading);
      run.lastPos.copy(p.position);
      run.hooks.cameraSystem.orbitYawOffset = 0;
      run.iceCam = null;
      pondHockey.shout(run, 'FACE-OFF', '#ffffff');
    } else if (e.kind === 'drop') { run.audio?.thump?.(); run.ice.ui.big.classList.remove('is-on'); }
    else if (e.kind === 'shot') run.audio?.thump?.();
    else if (e.kind === 'steal' && e.human) pondHockey.say(run, 'Puck stolen!', 'is-good');
    else if (e.kind === 'poke') pondHockey.say(run, 'Poked at nothing', 'is-bad');
    else if (e.kind === 'block') pondHockey.say(run, e.team === 0 ? 'Blocked by your team' : 'Blocked!', e.team === 0 ? 'is-good' : 'is-bad');
    else if (e.kind === 'sudden') pondHockey.shout(run, 'Next goal wins', '#ffc83d');
    else if (e.kind === 'goal') {
      run.audio?.boom?.(30, 0.3);
      run.pond.cheer = 2.4;
      pondHockey.shout(run, e.team === 0 ? 'GOAL!' : 'Locals score', e.team === 0 ? '#ffc83d' : '#ff7a6b');
      if (e.team === 0 && e.scorer === 0) pondHockey.say(run, 'Your goal!', 'is-gold');
    }
  },
  /** The five locals and the watchers into the crowd, the puck on the ice, sticks and bibs */
  draw(run, dt) {
    const P = run.pond, g = run.state?.game;
    if (!g) return;
    const y = P.iceY;
    const c = P.crowd;
    c.begin();
    for (const s of P.skaters) {
      const pl = g.players[s.i];
      const r = poseSkater(s.rig, pl.x, y, pl.z, pl.heading, { crouch: 0.62 + 0.18 * clamp(pl.speed / 5, 0, 1), phase: pl.gait * 2.4, push: clamp(pl.speed / 3, 0, 1), lean: 0, arms: 'stick' });
      c.add(s.rig, 0);
      pondHockey.stick(run, s.i, r.hands, pl, g);
      pondHockey.bib(P.bibs[s.i], s.rig);
    }
    for (const w of P.watchers) {
      w.rig.update(dt, w.x, w.z, w.yaw, (_o, x, z) => Math.max(groundHeight(x, z), y));
      if (P.cheer > 0) cheerArms(w.rig, w.ph += dt * 6, 1);
      c.add(w.rig, 0);
    }
    c.end();
    P.puck.position.set(g.puck.x, y + 0.02, g.puck.z);
  },
  stick(run, i, hands, pl, g) {
    const st = run.pond.sticks[i], y = run.pond.iceY;
    const carrying = g.puck.holder === i;
    const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
    _a.copy(hands[0]).lerp(hands[1], 0.5);
    _b.set(carrying ? g.puck.x : pl.x + fx * 1.1 + fz * 0.3, y + 0.03, carrying ? g.puck.z : pl.z + fz * 1.1 - fx * 0.3);
    stretch(st, _a, _b);
  },
  bib(mesh, rig) {
    bonePoint(rig, CHEST_BONE, _a, 0.02);
    const a = rig.pose, o = CHEST_BONE * 8;
    mesh.position.copy(_a);
    mesh.quaternion.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
  },
  after(run, ctx, dt, cm) {
    const P = run.pond, g = run.state?.game;
    if (!g) return;
    ICE_FEATURES.hockey.camera(run, ctx, dt, cm);
    pondHockey.draw(run, dt);
    const p = cm.entities.person;
    if (run.ice.hands) {
      const me = g.players[0];
      me.x = p.position.x; me.z = p.position.z; me.heading = p.heading;
      pondHockey.stick(run, 0, run.ice.hands, me, g);
      pondHockey.bib(P.bibs[0], p.rig);
    }
    const aimOn = g.puck.holder === 0 && g.phase === 'play';
    P.aim.visible = aimOn;
    if (aimOn) {
      const a = pondHockey.aim(run, p);
      _a.set(g.puck.x, P.iceY + 0.02, g.puck.z);
      _b.set(g.puck.x + Math.sin(a) * 9, P.iceY + 0.02, g.puck.z + Math.cos(a) * 9);
      stretch(P.aim, _a, _b);
    }
  }
};

export const OUTDOOR_FEATURES = { ropePark, pondHockey };
