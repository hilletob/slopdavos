import * as THREE from 'three/webgpu';
import { QUAD_MODEL, QUAD_PAINTS, createQuad, createParkedQuad, createQuadMaterial, setQuadLamps } from './quad.js';
import { QUAD } from './missions-data-rural.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { QUAD_STANDS, QUAD_ENTER_RADIUS, findQuad, quadGoesHome } from './vehicle-depots.js';
import { dressRider } from './player-figure.js';
import { QUALITY } from './quality.js';

// js/gta-quads.js
// The GTA mode (js/gta.js, js/gta-takeover.js): the quads standing about the valley (js/vehicle-depots.js QUAD_STANDS)
// that the player gets onto. Like a taken car, a quad is a body the player's car wears (js/gta-takeover.js
// setPlayerCarBody({ kind: 'quad', quad })): wear() hangs the driven quad (js/quad.js createQuad: body, bars and four
// wheels) on the car, with the quad's size, handling (js/missions-data-rural.js QUAD.drive, the mission's), headlamp
// places and chase camera; the player's figure rides it (PersonRig.ride, the hands following the bars). Got off, it
// stands where it was left (one mesh each, createParkedQuad, solid) and is brought back to its stand once the player
// is far away (quadGoesHome). A quad of the street traffic (js/traffic.js quads) is taken the same way: wear({ v, paint })
// with the traffic's vehicle; left, it stands in the traffic's own draw like a taken car. At night the driven quad's lamps glow (setQuadLamps) and the car's two spots shine from
// its headlamps (car.lightSpec).

const SHOW_RADIUS = QUALITY.mobile ? 140 : 420;
const HALF = QUAD_MODEL.wheelZ, TRACK = QUAD_MODEL.wheelX;

export function createQuads({ scene, cm, trafficBodies = null }) {
  const car = cm.entities.car;
  const group = new THREE.Group();
  group.name = 'GtaQuads';
  scene.add(group);

  // { id, home, x, z, heading, paint, held, visual, collider, body }
  const quads = QUAD_STANDS.map((s, i) => ({ id: s.id, home: s, x: s.x, z: s.z, heading: s.heading, paint: QUAD_PAINTS[(s.paint ?? i + 1) % QUAD_PAINTS.length], held: false, visual: null, collider: null, body: null }));
  const looks = new Map(); // the standing ones' materials, one a colour (their lamps dark)
  const lookOf = (hex) => { if (!looks.has(hex)) looks.set(hex, createQuadMaterial(hex)); return looks.get(hex); };

  // --- Standing ---------------------------------------------------------------------------------------------------------
  const ground = (x, z, y) => cm.getGroundHeight(x, z, 'car', y);
  function stand(q) {
    const y = ground(q.x, q.z);
    q.y = y;
    q.collider = { type: 'takenCar', position: { x: q.x, y, z: q.z }, heading: q.heading, dims: QUAD_MODEL.dims };
    if (trafficBodies) {
      if (q.body) drop(q);
      const d = QUAD_MODEL.dims;
      q.body = { x: q.x, z: q.z, prevX: q.x, prevZ: q.z, y, sin: Math.sin(q.heading), cos: Math.cos(q.heading), halfW: d.halfW, halfL: d.halfL, mass: d.mass, vx: 0, vz: 0, angularVel: 0, parked: 'taken' };
      trafficBodies.push(q.body);
    }
    if (q.visual) place(q);
  }
  function drop(q) {
    const i = trafficBodies ? trafficBodies.indexOf(q.body) : -1;
    if (i >= 0) trafficBodies.splice(i, 1);
    q.body = null;
  }
  // on the slope, like the stand-ins of js/gta.js
  function place(q) {
    const v = q.visual, fx = Math.sin(q.heading), fz = Math.cos(q.heading);
    const y = q.y = ground(q.x, q.z);
    if (q.collider) q.collider.position.y = y;
    v.position.set(q.x, y, q.z);
    v.rotation.order = 'YXZ';
    const front = ground(q.x + fx * HALF, q.z + fz * HALF, y), back = ground(q.x - fx * HALF, q.z - fz * HALF, y);
    const left = ground(q.x + fz * TRACK, q.z - fx * TRACK, y), right = ground(q.x - fz * TRACK, q.z + fx * TRACK, y);
    v.rotation.set(Math.atan2(back - front, 2 * HALF), q.heading, Math.atan2(left - right, 2 * TRACK));
    v.updateMatrixWorld(true);
  }
  function showNear(p) {
    for (const q of quads) {
      const near = !q.held && Math.hypot(q.x - p.x, q.z - p.z) < SHOW_RADIUS;
      if (near && !q.visual) {
        q.visual = createParkedQuad(lookOf(q.paint));
        group.add(q.visual);
        place(q);
      } else if (near && !q.visual.visible) place(q); // (the terrain under it may have sharpened meanwhile)
      if (q.visual) q.visual.visible = near;
    }
  }
  for (const q of quads) stand(q);

  // --- The driven one -----------------------------------------------------------------------------------------------------
  let driven = null, worn = null;
  function drivenQuad() {
    if (driven) return driven;
    const m = createQuad();
    // (the wheels on the car's root, not its sprung chassis, each on a pivot that steers: js/controllers.js updateCar)
    const wheels = m.wheels.map((w) => {
      const steerPivot = new THREE.Group();
      steerPivot.position.copy(w.mesh.position);
      w.mesh.position.set(0, 0, 0);
      steerPivot.add(w.mesh);
      return { steerPivot, tire: w.mesh, isFront: w.front };
    });
    const riderCrowd = new PersonCrowd(1, { farDistance: Infinity });
    for (const mesh of riderCrowd.meshes) scene.add(mesh);
    const rider = { riderCrowd, riderRig: new PersonRig({ seed: 7.7, scale: 1.0, girth: 0.97, hair: 0.1 }) };
    dressRider(cm, rider); // (the player's figure, now and when another is chosen: js/player-figure.js)
    driven = { root: m.group, steer: m.steer, look: m.look, wheels, rider, seat: { ...QUAD_MODEL.seat, steerPivot: QUAD_MODEL.steerPivot, steerAngle: 0 } };
    return driven;
  }
  /** The player's car wears quad q: what js/gta-takeover.js gives the car (size, handling, lamps, camera) */
  function wear(q) {
    const d = drivenQuad();
    worn = q;
    q.held = true;
    q.collider = null;
    if (!q.v) drop(q);
    if (q.visual) q.visual.visible = false;
    d.look.paint.value.setHex(q.paint);
    car.chassisPivot.add(d.root);
    for (const w of d.wheels) car.mesh.add(w.steerPivot);
    return {
      wheels: d.wheels, wheelRadius: QUAD_MODEL.wheelRadius, dims: QUAD_MODEL.dims, drive: QUAD.drive, lightSpec: QUAD_MODEL.lights,
      label: 'Quad', chaseDistance: QUAD_MODEL.chase[0], chaseHeight: QUAD_MODEL.chase[1]
    };
  }
  /** Off the car again; with a pose, the quad stands there */
  function unwear(pose = null) {
    if (!worn) return;
    const q = worn, d = driven;
    worn = null;
    d.root.removeFromParent();
    for (const w of d.wheels) w.steerPivot.removeFromParent();
    d.rider.riderCrowd.begin();
    d.rider.riderCrowd.end();
    if (q.v) return; // (one of the traffic's: js/gta-takeover.js leaves it standing in its own system)
    q.held = false;
    if (pose) { q.x = pose.x; q.z = pose.z; q.heading = pose.heading; }
    stand(q);
    if (q.visual) { q.visual.visible = true; place(q); }
  }

  let frame = 0;
  function update(dt, active) {
    frame++;
    if (worn) {
      const d = driven, riding = active && !car.hidden;
      d.steer.rotation.y = car.steerAngle || 0;
      setQuadLamps(d.look, { night: cm.beamScale || 0, high: !!cm.highBeam, brake: car.carState?.value.x || 0, on: riding });
      d.rider.riderCrowd.begin();
      if (riding) {
        d.seat.steerAngle = car.steerAngle || 0;
        d.rider.riderRig.ride(d.root, 0, d.seat);
        d.rider.riderCrowd.add(d.rider.riderRig, 0);
      }
      d.rider.riderCrowd.end();
    }
    if (frame % 30 !== 1) return false;
    const p = cm.getActiveEntity()?.position;
    if (!p) return false;
    let moved = false;
    for (const q of quads) {
      if (!quadGoesHome(q, p)) continue;
      q.x = q.home.x; q.z = q.home.z; q.heading = q.home.heading;
      stand(q);
      moved = true;
    }
    showNear(p);
    return moved; // (a quad went home: the colliders and the save want to know, js/gta.js)
  }

  return {
    quads, wear, unwear, update,
    /** The quad the pedestrian at p ({ x, y?, z }) can get onto: { quad, distance } or null */
    find: (p) => findQuad(p, quads, QUAD_ENTER_RADIUS),
    get worn() { return worn; },
    colliders: () => quads.filter((q) => q.collider).map((q) => q.collider),
    /** Kept with the GTA state: where each stands */
    state: () => quads.map((q) => ({ id: q.id, x: +q.x.toFixed(2), z: +q.z.toFixed(2), heading: +q.heading.toFixed(4) })),
    restore(list) {
      for (const s of Array.isArray(list) ? list : []) {
        const q = quads.find((c) => c.id === s.id);
        if (!q || q.held || ![s.x, s.z, s.heading].every(Number.isFinite)) continue;
        q.x = s.x; q.z = s.z; q.heading = s.heading;
        stand(q);
      }
    }
  };
}
