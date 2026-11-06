import * as THREE from 'three/webgpu';
import {
  BODY_SPECS, buildCarGeometry, createLoftedCarMaterial, buildLightbarGeometry, createLightbarMaterial, buildSteerableWheelGeo
} from './actor-models.js';
import { createHelper } from './missions-props.js';
import { MissionAudio } from './missions-fx.js';
import {
  findTakeableCar, findTakeableBike, findTakeableBus, trafficLabel, driveFor, holdVehicle, parkVehicle, releaseVehicle,
  shouldRelease, MAX_LEFT, pickPoolCar, borrowVehicle, endBorrow, bayIsClear, clearSpotBeside
} from './hijack.js';
import { lotCars, takeLotBay, returnLotBay } from './parking.js';

// js/gta-takeover.js
// The GTA mode (js/gta.js): taking over the vehicles on the road (the rules: js/hijack.js). The player's car (the
// controllers' one `car` entity, js/controllers.js, with the VW T3's physics) wears the taken vehicle's body:
// setPlayerCarBody() swaps the T3's body and wheels for a traffic car's (its kind, paint, livery and so its plate:
// js/actor-models.js hashes the plate from the paint) or hides them under a VBD bus (js/vbd.js pose(): the bus's own
// meshes follow the car; the articulated one's rear car swings behind on its hinge), and gives the car the body's size,
// mass, handling (hijack.js driveFor), headlamp places and chase camera. The T3 meanwhile stands where it was, as a
// parked stand-in of js/gta.js.
// Got out of, the taken vehicle stays where it stands, parked in its own system (the traffic draws it with its own
// instances; the bus stays the bus), solid for the player and the traffic, and the car entity is put away (hidden,
// `vacant`); it goes back into service once the player is RELEASE_DISTANCE away. A bike standing at a signal is taken
// by the player's bike (the traffic's goes back into its pool at once).
// A car parked in a car park (js/parking.js) is got into the same way, empty (no driver, no horn): its bay goes empty, a
// traffic car of its kind is borrowed from the pool for the slot (hijack.js borrowVehicle) with the parked car's paint, and
// from there on it is a taken car like the others. When it goes back into service the parked car is back in its bay.
// The driver gets out by the driver's door, waves a fist and walks off; a horn. The patrol car's blue light and siren:
// K, as in the mission.

const DEFAULT_TOP = 1.55;
const MASS = { van: 2400, suv: 1800, hatch: 1300, sedan: 1600, taxi: 1600, truck: 7500 };
const BUS = { halfW: 1.28, top: 3.2, wheelbase: 5.9, mass: 14000, door: null, chase: [17, 4.6] };

export function createTakeover({ scene, cm, traffic = null, vbd = null, trafficBodies = null, audio = null }) {
  const car = cm.entities.car;
  const siren = audio ? new MissionAudio(audio) : null;
  // The T3's own parts, to hide and bring back
  const t3 = {
    meshes: car.chassisPivot.children.filter((o) => o.isMesh),
    wheels: car.wheels,
    label: car.label,
    wheelRadius: car.wheelRadius,
    chase: [car.chaseDistance, car.chaseHeight],
    shadow: car.mesh.children.find((o) => o.isMesh && o.renderOrder === 998) || null
  };

  let body = null; // what the car wears: null (the T3) | { kind: 'traffic', v, bodyType, paint, police, model } | { kind: 'bus', bus }
  let vacant = false; // the car entity put away (the vehicle it was got out of stands in its own system)
  let blue = false;
  const left = []; // { kind: 'traffic' | 'bus', ref, x, z, heading, collider, trafficBody }
  const returning = []; // the bays whose car went back into service, until they are clear for it

  // --- The traffic cars' bodies for the player's car (one per kind and livery, made once, shared materials) -----------
  const models = new Map();
  const wheelMat = () => createLoftedCarMaterial(BODY_SPECS.sedan, 0xffbe14); // (the traffic's, cached)
  function trafficModel(bodyType, police) {
    const key = `${bodyType}|${police ? 1 : 0}`;
    if (models.has(key)) return models.get(key);
    const spec = BODY_SPECS[bodyType] || BODY_SPECS.sedan;
    const geo = buildCarGeometry(spec, false);
    const paint = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
    const state = new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0, police ? 1 : 0]), 4);
    geo.setAttribute('paintColor', paint);
    geo.setAttribute('carState', state);
    const mesh = new THREE.InstancedMesh(geo, createLoftedCarMaterial(spec), 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const root = new THREE.Group();
    root.name = `TakenCar_${key}`;
    root.add(mesh);
    let bar = null;
    if (police) {
      bar = new THREE.InstancedMesh(buildLightbarGeometry(BODY_SPECS.sedan), createLightbarMaterial(), 1);
      bar.setMatrixAt(0, new THREE.Matrix4());
      bar.frustumCulled = false;
      bar.visible = false;
      root.add(bar);
    }
    // the wheels: the traffic's wheel scaled to the kind's radius, steering in front (js/controllers.js updateCar turns
    // and spins them like the T3's)
    const wheels = [];
    const scale = spec.wheelRadius / 0.35;
    for (const side of [-1, 1]) {
      const g = buildSteerableWheelGeo(BODY_SPECS.sedan, side);
      for (const wz of [spec.wheelZ, -spec.wheelZ]) {
        const steerPivot = new THREE.Group();
        steerPivot.position.set(side * spec.wheelX, spec.wheelRadius, wz);
        const tire = new THREE.Mesh(g, wheelMat());
        tire.scale.setScalar(scale);
        tire.castShadow = true;
        steerPivot.add(tire);
        root.add(steerPivot);
        wheels.push({ steerPivot, tire, isFront: wz > 0 });
      }
    }
    const m = { root, paint, state, bar, wheels, spec, wheelsRoot: wheels.map((w) => w.steerPivot) };
    models.set(key, m);
    return m;
  }

  // --- The body swap ----------------------------------------------------------------------------------------------------
  /**
   * The player's car wears `desc`: null (the VW T3), { kind: 'traffic', bodyType, paint: [r, g, b], police, v } or
   * { kind: 'bus', bus } (a VBD bus, js/vbd.js). Size, mass, handling, lamps and camera follow the body.
   */
  function setPlayerCarBody(desc) {
    if (body?.kind === 'traffic' && body.model) {
      body.model.root.removeFromParent();
      for (const p of body.model.wheelsRoot) p.removeFromParent();
    }
    siren?.siren(false);
    blue = false;
    body = desc || null;
    const on = !body;
    for (const m of t3.meshes) m.visible = on;
    for (const w of t3.wheels) w.steerPivot.visible = on;
    if (t3.shadow) { t3.shadow.visible = true; t3.shadow.scale.set(1, 1, 1); }
    car._highBeam = undefined; // (the headlamps placed afresh, js/controllers.js updateVehicleLights)
    if (!body) {
      Object.assign(car, { wheels: t3.wheels, wheelRadius: t3.wheelRadius, dims: null, drive: null, lightSpec: null, label: t3.label, chaseDistance: t3.chase[0], chaseHeight: t3.chase[1] });
      return;
    }
    if (body.kind === 'traffic') {
      const m = body.model = trafficModel(body.bodyType, body.police);
      const spec = m.spec;
      m.paint.array.set(body.paint || [0.5, 0.5, 0.5]);
      m.paint.needsUpdate = true;
      m.state.array.set([0, 0, 0, body.police ? 1 : 0]);
      m.state.needsUpdate = true;
      if (m.bar) m.bar.visible = false;
      car.chassisPivot.add(m.root);
      // (the wheels on the car's root, not its sprung chassis, like the T3's)
      for (const p of m.wheelsRoot) car.mesh.add(p);
      const halfW = Math.max(...spec.halfWidth.map((w) => w[1]));
      const halfL = (spec.zFront - spec.zRear) / 2;
      Object.assign(car, {
        wheels: m.wheels, wheelRadius: spec.wheelRadius,
        dims: { halfW, halfL, top: body.bodyType === 'truck' ? 3.1 : body.bodyType === 'van' ? 2.0 : DEFAULT_TOP, mass: MASS[body.bodyType] || 1600 },
        drive: driveFor(body.bodyType === 'truck' ? 'truck' : 'car', { wheelbase: 2 * spec.wheelZ, police: body.police }),
        lightSpec: spec, label: body.police ? 'Kapo patrol car' : trafficLabel({ bodyType: body.bodyType }),
        chaseDistance: body.bodyType === 'truck' ? 11.5 : 7.6, chaseHeight: body.bodyType === 'truck' ? 3.2 : 1.75
      });
      if (t3.shadow) t3.shadow.scale.set((2 * halfW + 0.2) / 2.1, 1, (2 * halfL + 0.2) / 4.95);
    } else {
      const b = body.bus;
      const fl = b.art && b.rear ? b.frontLen : 12;
      if (t3.shadow) t3.shadow.visible = false;
      Object.assign(car, {
        wheels: [], wheelRadius: 0.5,
        dims: { halfW: BUS.halfW, halfL: fl / 2, top: BUS.top, mass: b.art ? BUS.mass * 1.4 : BUS.mass },
        drive: driveFor('bus', { wheelbase: BUS.wheelbase }),
        lightSpec: { headlight: [0.95, 0.72], zFront: fl / 2 }, label: `VBD bus ${b.ref}`,
        chaseDistance: BUS.chase[0] + (b.art ? 4 : 0), chaseHeight: BUS.chase[1]
      });
    }
  }

  // --- What can be taken here -------------------------------------------------------------------------------------------
  /** The vehicle on the road the pedestrian at `p` can take: { kind: 'take', source, ref, distance, label, sub } or null */
  function candidate(p) {
    const opts = [];
    if (traffic) {
      const c = findTakeableCar(p, traffic.cars);
      if (c) opts.push({ source: 'car', ref: c.car, distance: c.distance, label: `Take the ${trafficLabel(c.car)}`, sub: c.car.isPolice ? 'K: blue light' : null });
      const l = findTakeableCar(p, traffic.cars, { parked: true, maxSpeed: Infinity });
      if (l) opts.push({ source: 'car', ref: l.car, distance: l.distance, label: `Get in the ${trafficLabel(l.car)}`, sub: null, parked: true });
      const k = findTakeableBike(p, traffic.bikes);
      if (k) opts.push({ source: 'bike', ref: k.bike, distance: k.distance, label: 'Take the bike', sub: null });
      const parkedCar = lotCars.find(p);
      if (parkedCar && pickPoolCar(traffic.cars, parkedCar.car.kind, p.x, p.z)) {
        opts.push({ source: 'lot', ref: parkedCar.car, distance: parkedCar.distance, label: `Get in the ${trafficLabel({ bodyType: parkedCar.car.kind })}`, sub: null, parked: true });
      }
    }
    if (vbd?.buses?.length) {
      const b = findTakeableBus(p, vbd.buses, vbd.bodies);
      if (b) opts.push({ source: 'bus', ref: b.bus, distance: b.distance, label: 'Drive the bus', sub: `Line ${b.bus.ref}${b.bus.art ? ' · articulated' : ''}`, parked: !!b.bus.parked });
    }
    opts.sort((a, b) => a.distance - b.distance);
    return opts[0] ? { kind: 'take', ...opts[0] } : null;
  }

  // --- Left standing ----------------------------------------------------------------------------------------------------
  function addLeft(rec) {
    left.push(rec);
    while (left.length > MAX_LEFT) releaseLeft(left[0]);
  }
  function dropLeft(ref) {
    const rec = left.find((r) => r.ref === ref);
    if (!rec) return;
    left.splice(left.indexOf(rec), 1);
    if (rec.trafficBody && trafficBodies) { const i = trafficBodies.indexOf(rec.trafficBody); if (i >= 0) trafficBodies.splice(i, 1); }
  }
  function releaseLeft(rec) {
    dropLeft(rec.ref);
    if (rec.kind === 'traffic') {
      const bay = endBorrow(rec.ref);
      if (bay) returning.push(bay);
      releaseVehicle(rec.ref);
    } else vbd?.release?.(rec.ref);
  }
  // The parked cars back in their bays, once these are clear (not under the player's nose, nor where a vehicle stands)
  function settleBays(player) {
    const others = [...(cm.parkedVehicles || []), ...(car.hidden ? [] : [car])];
    for (let i = returning.length - 1; i >= 0; i--) {
      const parkedCar = lotCars.get(returning[i]);
      if (parkedCar && !bayIsClear(parkedCar, player, others)) continue;
      returnLotBay(returning[i], cm);
      returning.splice(i, 1);
    }
  }
  /** The car entity's vehicle stays where it stands; the entity is put away (getting out, js/gta.js exit) */
  function leaveBody() {
    if (!body) return;
    const x = car.position.x, z = car.position.z, heading = car.heading;
    if (body.kind === 'traffic') {
      const v = body.v;
      parkVehicle(v, { x, z, yaw: heading });
      const d = car.dims;
      const collider = { type: 'takenCar', position: { x, y: car.position.y, z }, heading, dims: { halfW: d.halfW, halfL: d.halfL, top: d.top } };
      const tb = { x, z, prevX: x, prevZ: z, y: car.position.y, sin: Math.sin(heading), cos: Math.cos(heading), halfW: d.halfW, halfL: d.halfL, mass: d.mass, vx: 0, vz: 0, angularVel: 0, parked: 'taken' };
      trafficBodies?.push(tb);
      addLeft({ kind: 'traffic', ref: v, x, z, heading, collider, trafficBody: tb });
    } else {
      const b = body.bus;
      poseBus(0, true);
      vbd.park(b);
      addLeft({ kind: 'bus', ref: b, x, z, heading });
    }
    setPlayerCarBody(null);
    cm.setEntityHidden('car', true);
    vacant = true;
  }

  // --- Taking -------------------------------------------------------------------------------------------------------------
  // `place(type, x, z, heading)`: js/gta.js puts the player's entity there (leaving its stand-in where it stood)
  function take(a, { place }) {
    if (a.source === 'bike') {
      const v = a.ref, yaw = (v.yaw || 0) + (v.yawOffset || 0);
      releaseVehicle(v); // (back to the pool: it rides on elsewhere, out of sight)
      place('cyclist', v.x, v.z, yaw);
      flee(v.x, v.z, yaw, 0.5, false);
      return;
    }
    if (body) leaveBody(); // (not expected: taking happens on foot)
    if (a.source === 'car') {
      const v = a.ref, wasParked = !!v.parked;
      const x = v.x, z = v.z, yaw = (v.yaw || 0) + (v.yawOffset || 0), speed = wasParked ? 0 : Math.max(0, v.speed || 0);
      dropLeft(v);
      holdVehicle(v);
      place('car', x, z, yaw, () => setPlayerCarBody({ kind: 'traffic', v, bodyType: v.bodyType, paint: [...v.paint], police: !!v.isPolice }));
      car.speed = speed * 0.5;
      if (!wasParked) flee(x, z, yaw, (car.dims?.halfW ?? 0.9) + 0.5, true);
    } else if (a.source === 'lot') {
      const c = a.ref, v = pickPoolCar(traffic.cars, c.kind, c.x, c.z);
      if (!v) return;
      borrowVehicle(v, { key: c.key, paint: c.paint });
      takeLotBay(c.key, cm);
      place('car', c.x, c.z, c.heading, () => setPlayerCarBody({ kind: 'traffic', v, bodyType: v.bodyType, paint: [...v.paint], police: false }));
      car.speed = 0;
    } else if (a.source === 'bus') {
      const b = a.ref, wasParked = !!b.parked;
      dropLeft(b);
      vbd.hold(b);
      place('car', b.cx, b.cz, b.yaw, () => setPlayerCarBody({ kind: 'bus', bus: b }));
      const spot = clearSpotBeside(b.cx, b.cz, b.yaw, (x, z) => cm.isSpotClear('car', x, z, b.yaw));
      if (spot && (spot.x !== b.cx || spot.z !== b.cz)) cm.placeEntity('car', spot.x, spot.z, b.yaw);
      if (!wasParked) flee(b.cx, b.cz, b.yaw, BUS.halfW + 0.6, true, (car.dims.halfL - 1.4));
    }
    vacant = false;
  }

  // --- The driver walking off ---------------------------------------------------------------------------------------------
  let walker = null;
  function flee(x, z, yaw, out, horn, along = 0.9) {
    walker ??= { mesh: createHelper(), t: 0 };
    if (!walker.mesh.parent) scene.add(walker.mesh);
    const lx = Math.cos(yaw), lz = -Math.sin(yaw); // the left: the driver's door
    walker.x = x + lx * out + Math.sin(yaw) * along;
    walker.z = z + lz * out + Math.cos(yaw) * along;
    // off to the side and back the way the car came, a little
    const dx = lx * 0.8 - Math.sin(yaw) * 0.6, dz = lz * 0.8 - Math.cos(yaw) * 0.6, l = Math.hypot(dx, dz);
    walker.dx = dx / l; walker.dz = dz / l;
    walker.t = 0;
    walker.mesh.visible = true;
    if (horn && audio?.ready && audio.enabled) {
      try { audio.emit('horn', { id: walker, x, y: car.position.y, z, heading: yaw, seed: 9 }, { intensity: 0.85, priority: true }); } catch { /* (no sound) */ }
    }
  }
  function updateWalker(dt) {
    if (!walker?.mesh.visible) return;
    const w = walker;
    w.t += dt;
    // a moment shouting by the car, then away, turning back now and then
    const go = w.t > 1.2 ? 2.1 : 0;
    w.x += w.dx * go * dt; w.z += w.dz * go * dt;
    const y = cm.getGroundHeight(w.x, w.z, 'person');
    w.mesh.position.set(w.x, y + (go ? Math.abs(Math.sin(w.t * 9)) * 0.05 : 0), w.z);
    const facing = w.t < 1.2 || (w.t % 2.6) > 2.1 ? Math.atan2(-w.dx, -w.dz) : Math.atan2(w.dx, w.dz);
    w.mesh.rotation.set(0, facing, 0);
    const arm = w.mesh.userData.wave;
    if (arm) arm.rotation.z = -2.4 + Math.sin(w.t * 11) * 0.45; // (a fist in the air)
    if (w.t > 9) w.mesh.visible = false;
  }

  // --- Every frame -------------------------------------------------------------------------------------------------------
  function poseBus(dt, solid = false) {
    const b = body?.bus;
    if (!b) return;
    const p = car.position, cp = car.chassisPivot;
    vbd.pose(b, { x: p.x, y: p.y + (cp?.position.y || 0), z: p.z, yaw: car.heading, pitch: cp?.rotation.x || 0, roll: cp?.rotation.z || 0, speed: car.speed || 0, dt, solid });
  }
  let frame = 0;
  function update(dt) {
    frame++;
    const active = cm.activeMode === 'car';
    if (body?.kind === 'traffic' && body.model) {
      // the lamps: brake and turn signals from the car's state (js/controllers.js updateCar), the livery
      const s = car.carState?.value, a = body.model.state.array;
      const x = active ? s?.x || 0 : 0, y = active ? s?.y || 0 : 0, z = active ? s?.z || 0 : 0;
      if (a[0] !== x || a[1] !== y || a[2] !== z) { a[0] = x; a[1] = y; a[2] = z; body.model.state.needsUpdate = true; }
      if (!active && blue) { siren?.siren(false); }
      else if (active && blue) siren?.siren(true);
    }
    if (body?.kind === 'bus') poseBus(dt, !active);
    updateWalker(dt);
    // far enough away: back into service
    if (frame % 30 === 0 && (left.length || returning.length)) {
      const e = cm.getActiveEntity()?.position;
      if (e) for (const rec of [...left]) if (shouldRelease(rec, e.x, e.z)) releaseLeft(rec);
      if (e && returning.length) settleBays(e);
    }
  }

  /** K in the patrol car: the blue light and the siren */
  function toggleBlue() {
    if (!body?.police || cm.activeMode !== 'car') return false;
    blue = !blue;
    if (body.model?.bar) body.model.bar.visible = blue;
    siren?.siren(blue);
    return true;
  }

  // --- Saved with the GTA state (js/gta.js) ------------------------------------------------------------------------------
  function state() {
    const d = body?.kind === 'traffic' ? { kind: 'traffic', bodyType: body.bodyType, paint: body.paint.map((c) => +c.toFixed(4)), police: !!body.police, lotBay: body.v?.lotBay || undefined }
      : body?.kind === 'bus' ? { kind: 'bus', index: vbd.buses.indexOf(body.bus) } : null;
    return { vacant, body: d };
  }
  function restore(s) {
    if (!s) return;
    if (s.body && cm.activeMode === 'car') {
      if (s.body.kind === 'traffic' && traffic) {
        const v = traffic.cars.find((c) => c.bodyType === s.body.bodyType && !!c.isPolice === !!s.body.police && !c.held && !c.parked && !c.edge)
          || traffic.cars.find((c) => c.bodyType === s.body.bodyType && !!c.isPolice === !!s.body.police && !c.held && !c.parked);
        if (v) {
          // (a parked car driven on: its bay stays empty, no second one; the other taken bays come back filled)
          if (s.body.lotBay) { borrowVehicle(v, { key: s.body.lotBay, paint: s.body.paint.map(Math.fround) }); takeLotBay(s.body.lotBay, cm); }
          else if (Array.isArray(s.body.paint) && s.body.paint.length === 3) v.paint = s.body.paint.map(Math.fround);
          holdVehicle(v);
          setPlayerCarBody({ kind: 'traffic', v, bodyType: v.bodyType, paint: [...v.paint], police: !!v.isPolice });
        }
      } else if (s.body.kind === 'bus' && vbd?.buses?.[s.body.index]) {
        const b = vbd.buses[s.body.index];
        vbd.hold(b);
        setPlayerCarBody({ kind: 'bus', bus: b });
        poseBus(0);
      }
    } else if (s.vacant && cm.activeMode !== 'car') {
      cm.setEntityHidden('car', true);
      vacant = true;
    }
  }

  return {
    setPlayerCarBody, candidate, take, leaveBody, update, toggleBlue, state, restore,
    /** Driving a taken patrol car (the blue light's K, js/gta.js) */
    inPatrolCar: () => !!body?.police && cm.activeMode === 'car',
    blueOn: () => blue,
    get body() { return body; },
    get vacant() { return vacant; },
    set vacant(v) { vacant = !!v; },
    get left() { return left; },
    /** The bays waiting to get their car back */
    get returning() { return returning; },
    /** The colliders of the cars left standing (js/controllers.js parkedVehicles) */
    colliders() { return left.filter((r) => r.collider).map((r) => r.collider); },
    /** Where the pedestrian gets out of the worn body: its footprint and door (js/vehicle-depots.js exitSpots) */
    footprint() {
      if (!body || !car.dims) return null;
      return { halfW: car.dims.halfW, halfL: car.dims.halfL, door: body.kind === 'bus' ? car.dims.halfL - 1.4 : 0.6 };
    }
  };
}
