import * as THREE from 'three/webgpu';
import { surfaceHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { isWinter, onSeasonChange } from './season.js';
import { buildVwT3Geometry, upgradeVwT3Body } from './vw-t3.js';
import { DAVOS_DATA } from './davos-geodata.js';
import {
  DEPOTS, VEHICLE_LABELS, VEHICLE_FOOTPRINTS, BOARD_RADIUS, GTA_START,
  findEnterable, canExit, exitSpots, pickExitSpot, inSeason, seasonOf, depotsByDistance,
  RETURN_TYPES, atDepot, returnDepot, shouldReturn
} from './vehicle-depots.js';
import { createTakeover } from './gta-takeover.js';
import { t } from './i18n.js';
import { missionAllowsTakeover } from './hijack.js';

// js/gta.js
// The GTA mode: the player is a pedestrian who gets into the vehicles standing about the valley (F, or G; in the snow
// groomer, whose tiller is F, only G; the touch screen's "Get in" button, the gamepad's X; Enter stays the missions'
// start, js/missions-world.js) and out of them again where they stop. There is no other way to change vehicles
// (the mode bar of the old game is gone); the missions still put the player straight into their vehicle
// (js/missions.js selectMode).
//
// One controlled entity per vehicle type (js/controllers.js); every other vehicle is a parked stand-in: a copy of the
// entity's model sharing its geometry and materials, no physics but a
// collider (controllers.parkedVehicles). Getting into a stand-in moves the real entity to its place and leaves a
// stand-in where the real one stood: any number of places, one entity per type. The places start at the depots of
// js/vehicle-depots.js and are kept in localStorage (STATE_KEY) as the player leaves vehicles about. A helicopter left
// off its pads is flown back to the nearest empty depot by its crew once the player has been away from it a while
// (returnStrays; js/vehicle-depots.js shouldReturn), so the pads do not stand empty for good.
// The RhB (js/rhb.js): at a station, beside a train standing at the platform, "Board the RhB" rides along as a
// passenger (the camera follows the train, no controls) to any later station; at the line's end stations "T: Drive"
// takes the train over (the rhb mode).
// The vehicles on the road (js/gta-takeover.js, js/hijack.js): beside a car of the traffic standing or crawling, "Take
// the <kind>" (F) puts the player into it (the T3 stays where it stood); a VBD bus standing at a stop: "Drive the bus";
// a bike standing at a signal: "Take the bike"; a car parked in a car park (js/parking.js): "Get in the <kind>". Got out
// of, they stand where they were left until the player is far away.

const STATE_KEY = 'slopdavos-gta';
const STATE_VERSION = 1;
const VEHICLES = ['car', 'cyclist', 'helicopter', 'snowcat'];
// Stand-ins drawn round the camera (the mobile profile: fewer and nearer, to keep the draw calls down)
const SHOW_RADIUS = QUALITY.mobile ? { car: 260, cyclist: 90, helicopter: 600, snowcat: 320 } : { car: 700, cyclist: 220, helicopter: 1500, snowcat: 900 };
const MAX_SHOWN = QUALITY.mobile ? 5 : 24;
const GLYPHS = { in: '↗', out: '↙', board: '⇢' };
const ICONS = { car: { letter: 'T3', colour: '#3b82f6' }, cyclist: { letter: 'B', colour: '#22c55e' }, helicopter: { letter: 'H', colour: '#e11d2e' }, snowcat: { letter: 'G', colour: '#f97316' } };
const STATION_POS = new Map((DAVOS_DATA.stations || []).map((s) => [s.name, s]));
const ROAD_KINDS_OFF = new Set(['footway', 'path', 'track', 'steps', 'cycleway', 'pedestrian', 'bridleway', 'platform', 'corridor']);

/** Has the GTA mode been played here before (its parked vehicles saved)? */
export function hasGtaState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY))?.version === STATE_VERSION; } catch { return false; }
}

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };

export function buildGta({ scene, controllerManager: cm, touchControls, actions = null, selectMode, rhb, missions = null, mapSystem = null, savePlayerState = null, traffic = null, vbd = null, trafficBodies = null, audio = null }) {
  cm.gtaParkedLook = true;
  const missionRun = () => missions?.run || null;
  const winter = () => isWinter();

  // --- The stand-ins' models ------------------------------------------------------------------------------------------
  // A copy of an entity's model: shared geometry and materials, no lights, its moving parts at rest. The instanced
  // parts get storage attributes like the city's on WebGPU (js/main.js), so that they share their pipelines.
  function cloneModel(src) {
    const copy = src.clone(true);
    const a = [], b = [];
    src.traverse((o) => a.push(o));
    copy.traverse((o) => b.push(o));
    const lights = [];
    b.forEach((o, i) => {
      if (o.isLight) lights.push(o);
      if (o.isInstancedMesh && a[i]?.instanceMatrix?.isStorageInstancedBufferAttribute && !o.instanceMatrix.isStorageInstancedBufferAttribute) {
        o.instanceMatrix = new THREE.StorageInstancedBufferAttribute(o.instanceMatrix.array, 16);
      }
    });
    for (const l of lights) { l.target?.parent?.remove(l.target); l.parent?.remove(l); }
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.matrixAutoUpdate = true;
    return copy;
  }

  const templates = {};
  const templateReady = {};
  function buildTemplate(type) {
    const ent = cm.entities[type];
    if (!ent?.mesh) return null;
    // (the moving parts at rest while the model is copied: the bike upright, the helicopter level, its strobes dark)
    const saved = [];
    const hold = (obj, key, value) => { if (!obj) return; saved.push([obj, key, obj[key]]); obj[key] = value; };
    const visible = ent.mesh.visible;
    ent.mesh.visible = true;
    if (type === 'cyclist') { hold(ent.leanPivot?.rotation, 'z', 0); hold(ent.frontSteerPivot?.rotation, 'y', 0); hold(ent.handlebarPivot?.rotation, 'y', 0); }
    if (type === 'helicopter') {
      hold(ent.tiltPivot?.rotation, 'x', 0); hold(ent.tiltPivot?.rotation, 'z', 0); hold(ent.tiltPivot?.position, 'y', 0);
      for (const s of ent.strobes || []) hold(s, 'visible', false);
      hold(ent.rotorDisc, 'visible', false); // (the rotor at rest: no blur)
    }
    if (type === 'car') { hold(ent.chassisPivot?.rotation, 'x', 0); hold(ent.chassisPivot?.rotation, 'z', 0); hold(ent.chassisPivot?.position, 'y', 0); }
    const copy = cloneModel(ent.mesh);
    for (let i = saved.length - 1; i >= 0; i--) { const [obj, key, value] = saved[i]; obj[key] = value; }
    ent.mesh.visible = visible;
    copy.name = `Parked${type}`;
    templateReady[type] = true;
    if (type === 'car') {
      // The van's body: the full body mesh once it has loaded (vw-t3.js swaps the entity's geometry and disposes the
      // old one: the copies get one of their own, and are made after it has arrived). (Its material is the one shared
      // T3 material: at night the driven van's lamp state shows on the parked ones too.)
      const body = [];
      copy.traverse((o) => { if (o.isMesh && o.geometry?.userData?.vwT3Body) body.push(o); });
      if (body.length) {
        templateReady.car = false;
        body[0].geometry = buildVwT3Geometry();
        upgradeVwT3Body(body[0]).catch(() => false).finally(() => {
          for (const m of body.slice(1)) m.geometry = body[0].geometry;
          templateReady.car = true;
        });
      }
    }
    return copy;
  }
  for (const type of VEHICLES) templates[type] = buildTemplate(type);
  // Taking over the vehicles on the road (after the templates: the car's T3 parts as they are)
  const takeover = createTakeover({ scene, cm, traffic, vbd, trafficBodies, audio });
  let savedTakeover = null;

  // --- The parked vehicles ------------------------------------------------------------------------------------------
  // { id, type, x, z, heading, season, label, depot, since, position: { x, y, z }, visual }
  // (since: when the player left it there, ms of Date.now(); null at a depot)
  let parked = [];
  const leftAt = {}; // { [type]: ms }: when the player got out of each type's entity (the real one, not a stand-in)
  let nextId = 1;
  let dirty = true;
  const group = new THREE.Group();
  group.name = 'GtaParkedVehicles';
  scene.add(group);

  const restY = (type, x, z) => (type === 'helicopter' ? surfaceHeight(x, z) + 0.25 : cm.getGroundHeight(x, z, type));
  function addParked({ type, x, z, heading, label = null, depot = null, season = seasonOf(type), since = depot ? null : Date.now() }) {
    if (!VEHICLES.includes(type) || ![x, z, heading].every(Number.isFinite)) return null;
    const p = { id: nextId++, type, x, z, heading, label, depot, season, since, position: { x, y: restY(type, x, z), z }, visual: null };
    parked.push(p);
    dirty = true;
    return p;
  }
  function removeParked(p) {
    parked = parked.filter((q) => q !== p);
    if (p.visual) { group.remove(p.visual); p.visual = null; }
    dirty = true;
  }
  // The stand-ins in this season are solid (controllers.js dynamicColliders)
  function refreshColliders() {
    cm.parkedVehicles = parked.filter((p) => inSeason(p, winter())).concat(takeover.colliders());
  }

  // On the slope like the driven vehicles (controllers.js update: pitch over the wheelbase, roll over the track)
  const SLOPE = { car: [1.23, 0.8], cyclist: [0.55, 0], snowcat: [2.4, 1.6], helicopter: [0, 0] };
  function placeVisual(p) {
    const v = p.visual;
    p.position.y = restY(p.type, p.x, p.z);
    v.position.set(p.x, p.position.y, p.z);
    v.rotation.order = 'YXZ';
    v.rotation.set(0, p.heading, 0);
    const [half, track] = SLOPE[p.type];
    if (half) {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading), y = p.position.y;
      const front = surfaceHeight(p.x + fx * half, p.z + fz * half, y), back = surfaceHeight(p.x - fx * half, p.z - fz * half, y);
      v.rotation.x = Math.atan2(back - front, 2 * half);
      if (track) {
        const left = surfaceHeight(p.x + fz * track, p.z - fx * track, y), right = surfaceHeight(p.x - fz * track, p.z + fx * track, y);
        v.rotation.z = Math.atan2(left - right, 2 * track);
      }
    }
    v.updateMatrixWorld(true);
  }

  let frame = 0;
  const camPos = new THREE.Vector3();
  function updateVisuals(camera) {
    camPos.copy(camera.position);
    const w = winter();
    const near = [];
    for (const p of parked) {
      const d = Math.hypot(p.x - camPos.x, p.z - camPos.z);
      const want = inSeason(p, w) && d < SHOW_RADIUS[p.type] && templateReady[p.type] && templates[p.type];
      if (want) near.push([d, p]);
      else if (p.visual) {
        p.visual.visible = false;
        // (far away: let the copy go; it is cheap to make again)
        if (d > SHOW_RADIUS[p.type] * 2) { group.remove(p.visual); p.visual = null; }
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    near.forEach(([, p], i) => {
      const show = i < MAX_SHOWN;
      if (show && !p.visual) {
        p.visual = templates[p.type].clone(true);
        // (the instanced parts: storage attributes again, see cloneModel)
        p.visual.traverse((o) => { if (o.isInstancedMesh && !o.instanceMatrix.isStorageInstancedBufferAttribute && cm.entities[p.type]?.mesh) fixInstanced(o, p.type); });
        group.add(p.visual);
        placeVisual(p);
      }
      if (p.visual) {
        if (show && !p.visual.visible) placeVisual(p); // (the terrain under it may have sharpened meanwhile)
        p.visual.visible = show;
      }
    });
  }
  const storageTypes = {};
  function fixInstanced(o, type) {
    if (storageTypes[type] === undefined) {
      let storage = false;
      cm.entities[type].mesh.traverse((q) => { if (q.isInstancedMesh && q.instanceMatrix.isStorageInstancedBufferAttribute) storage = true; });
      storageTypes[type] = storage;
    }
    if (storageTypes[type]) o.instanceMatrix = new THREE.StorageInstancedBufferAttribute(o.instanceMatrix.array, 16);
  }

  // --- Saved state ----------------------------------------------------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        version: STATE_VERSION,
        parked: parked.map(({ type, x, z, heading, label, depot, since }) => ({ type, x: +x.toFixed(2), z: +z.toFixed(2), heading: +heading.toFixed(4), label, depot, since })),
        leftAt,
        takeover: takeover.state()
      }));
      dirty = false;
    } catch { /* (no storage) */ }
    savePlayerState?.(); // (the players' places go with the stand-ins')
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY));
      if (s?.version !== STATE_VERSION || !Array.isArray(s.parked)) return false;
      for (const p of s.parked) addParked(p); // (an older save without `since`: left just now)
      Object.assign(leftAt, s.leftAt || {});
      savedTakeover = s.takeover || null;
      return true;
    } catch { return false; }
  }

  // A first visit: each type's entity at its depot nearest the start, a stand-in at each other depot; the pedestrian by
  // the Bahnhof Davos Platz
  // (a mission begun by link, ?mission=: its vehicle stays where the mission put the player, every depot gets a stand-in)
  function firstVisit() {
    const busy = !!missionRun();
    for (const type of VEHICLES) {
      const depots = depotsByDistance(DEPOTS, type, GTA_START.x, GTA_START.z);
      const own = busy && type === cm.activeMode ? null : depots.shift();
      if (own) cm.placeEntity(type, own.x, own.z, own.heading);
      for (const d of depots) addParked({ type, x: d.x, z: d.z, heading: d.heading, label: d.label, depot: d.id, season: d.season });
    }
    if (busy) {
      cm.placeEntity('person', GTA_START.x, GTA_START.z, GTA_START.heading);
      return;
    }
    selectMode('person');
    cm.teleportActiveTo(GTA_START.x, GTA_START.z, GTA_START.heading);
  }

  const restored = load();
  if (!restored) firstVisit();
  else if (cm.activeMode === 'rhb') {
    // (saved on a train: back on foot by the tracks)
    const p = cm.getActiveEntity().position;
    const { x, z } = p;
    selectMode('person');
    cm.teleportActiveTo(x, z, 0);
  }
  cm.setEntityHidden('person', cm.activeMode !== 'person');
  for (const type of RETURN_TYPES) if (type !== cm.activeMode && !Number.isFinite(leftAt[type])) leftAt[type] = Date.now(); // (an older save)
  takeover.restore(savedTakeover); // (the taken car or bus driven on, or the car put away)
  function applySeason() {
    // the groomer stays in its shed in summer (unless the player drives it)
    cm.setEntityHidden('snowcat', !winter() && cm.activeMode !== 'snowcat');
    refreshColliders();
  }
  applySeason();
  onSeasonChange(applySeason);
  save(); // (with the players where this has put them: a reload finds both)

  // --- Modes changed by anyone (getting in and out here; a mission putting the player into its vehicle) -------------
  let switching = false; // (a change made here: no bookkeeping for code switches)
  let codeSwitch = null; // { type, x, z, heading, frames }: a vehicle taken by code, where it stood before
  cm.onModeChange((prev, next) => {
    // (out of a taken vehicle by code, a mission's start: it stays where it stands)
    if (prev === 'car' && !switching && takeover.body) takeover.leaveBody();
    // (the car put away and taken by code: it comes back where the mission puts it, no stand-in for it)
    const revived = next === 'car' && !switching && takeover.vacant;
    if (revived) takeover.vacant = false;
    cm.setEntityHidden('person', next !== 'person');
    if (VEHICLES.includes(next) && cm.entities[next].hidden) cm.setEntityHidden(next, false);
    if (prev === 'snowcat' && !winter()) cm.setEntityHidden('snowcat', true);
    if (!switching && VEHICLES.includes(next) && !revived) {
      const e = cm.entities[next];
      codeSwitch = { type: next, x: e.position.x, z: e.position.z, heading: e.heading, frames: 0 };
    }
    if (RETURN_TYPES.includes(prev)) leftAt[prev] = Date.now();
    delete leftAt[next];
    if (next !== 'rhb') ride = null;
  });
  // A mission taking the player out of a vehicle of the road (a taken taxi, a bus): it stays where it stands, as when
  // getting out, and the mission drives the player's own car. Otherwise the car went on wearing the taken body (a
  // mission already in 'car' changes no mode), getting out of the mission's car left that body standing and put the car
  // away, and there was nothing to get back into (the patrol car of the speed check).
  missions?.beforeStart?.add(() => {
    if (!takeover.body) return;
    const inCar = cm.activeMode === 'car';
    takeover.leaveBody();
    if (inCar) { takeover.vacant = false; cm.setEntityHidden('car', false); }
    refreshColliders();
    save();
  });

  // A vehicle moved by code (a mission's start) leaves a stand-in where it stood, and takes the place of a stand-in it
  // lands on (the mission's helipad), so the count stays the same
  function bookkeepCodeSwitch() {
    const mode = cm.activeMode;
    if (codeSwitch) {
      const e = cm.entities[codeSwitch.type];
      if (Math.hypot(e.position.x - codeSwitch.x, e.position.z - codeSwitch.z) > 20) {
        if (!parked.some((p) => p.type === codeSwitch.type && Math.hypot(p.x - codeSwitch.x, p.z - codeSwitch.z) < 6)) addParked({ ...codeSwitch, since: Date.now() });
        codeSwitch = null;
      } else if (++codeSwitch.frames > 90) codeSwitch = null;
    }
    if (VEHICLES.includes(mode)) {
      const e = cm.entities[mode];
      for (const p of parked) {
        if (p.type === mode && Math.hypot(p.x - e.position.x, p.z - e.position.z) < Math.max(2, 2 * VEHICLE_FOOTPRINTS[mode].halfL)) { removeParked(p); break; }
      }
    }
  }

  // --- Roads (the pedestrian steps out beside the vehicle, off the roadway if it can) --------------------------------
  let roadCells = null;
  const ROAD_CELL = 32;
  function onRoad({ x, z }) {
    if (!roadCells) {
      roadCells = new Map();
      for (const r of DAVOS_DATA.roads || []) {
        if (ROAD_KINDS_OFF.has(r.kind) || !r.pts) continue;
        const half = (r.width || 4) / 2;
        for (let i = 0; i + 3 < r.pts.length; i += 2) {
          const seg = [r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3], half];
          const x0 = Math.floor((Math.min(seg[0], seg[2]) - half) / ROAD_CELL), x1 = Math.floor((Math.max(seg[0], seg[2]) + half) / ROAD_CELL);
          const z0 = Math.floor((Math.min(seg[1], seg[3]) - half) / ROAD_CELL), z1 = Math.floor((Math.max(seg[1], seg[3]) + half) / ROAD_CELL);
          for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
            const k = `${ix},${iz}`;
            (roadCells.get(k) || roadCells.set(k, []).get(k)).push(seg);
          }
        }
      }
    }
    for (const [ax, az, bx, bz, half] of roadCells.get(`${Math.floor(x / ROAD_CELL)},${Math.floor(z / ROAD_CELL)}`) || []) {
      const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
      const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < half + 0.4) return true;
    }
    return false;
  }

  // --- What the player can do here -------------------------------------------------------------------------------
  let ride = null; // { train, lastStation }: riding the RhB as a passenger
  // During a mission only the switches its current step allows (e.g. out of the patrol car and back)
  function missionAllows(mode) {
    const run = missionRun();
    if (!run) return true;
    if (run.phase === 'intro' || run.phase === 'done' || run.phase === 'failed' || run.phase === 'aborted') return false;
    const allowed = run.def?.objectives?.[run.index]?.allowModes || run.def?.allowModes || [run.def?.mode];
    return allowed.includes(mode);
  }
  function enterCandidates() {
    const w = winter();
    const list = [];
    for (const p of parked) if (inSeason(p, w)) list.push({ kind: 'parked', type: p.type, x: p.x, y: p.position.y, z: p.z, heading: p.heading, ref: p });
    for (const type of VEHICLES) {
      const e = cm.entities[type];
      // (a mission may hide the van behind its own car, the patrol car: it can still be got into)
      if (!e || e.hidden || (e.mesh.visible === false && !missionRun()) || type === cm.activeMode) continue;
      list.push({ kind: 'entity', type, x: e.position.x, y: e.position.y, z: e.position.z, heading: e.heading, ref: e });
    }
    return list;
  }
  // The action on offer: { kind: 'enter' | 'board' | 'exit', label, ... } or null; `blocked`: why getting out waits
  function currentAction() {
    const mode = cm.activeMode;
    const ent = cm.getActiveEntity();
    const p = ent.position;
    if (mode === 'person' && cm.paragliding) return null; // (the wing is out, js/paraglide-free.js: no vehicles meanwhile)
    if (mode === 'person') {
      const vehicle = findEnterable({ x: p.x, y: p.y, z: p.z }, enterCandidates().filter((c) => missionAllows(c.type)));
      const train = missionAllows('rhb') && !missionRun() ? rhb?.boardable?.(p.x, p.z, BOARD_RADIUS) : null;
      if (train && (!vehicle || train.distance < vehicle.distance)) {
        const drive = rhb.isTerminus?.(train.station);
        return { kind: 'board', train: train.train, station: train.station, drive, label: 'Board the RhB', sub: `${train.station.name}${drive ? ' · T: drive it' : ''}` };
      }
      // the vehicles on the road (during a mission only if it allows it)
      const taking = missionAllowsTakeover(missionRun()) ? takeover.candidate({ x: p.x, y: p.y, z: p.z }) : null;
      if (taking && (!vehicle || taking.distance < vehicle.distance) && (!train || taking.distance < train.distance)) return taking;
      // (a mission's work vehicle on the player's car, js/missions-work.js workVehicle: by its own name)
      const name = (vehicle?.kind === 'entity' && vehicle.type === 'car' && (missionRun()?.vehicle?.label || (missionRun()?.features?.policeCar && 'patrol car'))) || VEHICLE_LABELS[vehicle?.type];
      if (vehicle) return { kind: 'enter', target: vehicle, label: `Get in the ${name}`, sub: vehicle.kind === 'parked' ? vehicle.ref.label || null : null };
      return null;
    }
    if (!missionAllows('person')) return null;
    if (mode === 'rhb') {
      const train = cm.rhbPassenger;
      const seat = train ? rhb?.seat?.(train) : null;
      const station = train ? seat?.station : 'cab';
      const check = canExit('rhb', { speed: ent.speed, station });
      if (!train && !check.ok) check.reason = 'Brake to a stop first (S)';
      return { kind: 'exit', ok: check.ok, reason: check.reason, label: train ? 'Get off' : 'Leave the cab', sub: train && seat?.station ? seat.station.name : check.reason };
    }
    if (!VEHICLES.includes(mode)) return null;
    const agl = p.y - surfaceHeight(p.x, p.z);
    const check = canExit(mode, { speed: ent.speed + Math.abs(ent.verticalSpeed || 0), agl });
    return { kind: 'exit', ok: check.ok, reason: check.reason, label: 'Get out', sub: check.ok ? null : check.reason };
  }

  // --- Getting in ---------------------------------------------------------------------------------------------------
  function enter(target) {
    const type = target.type;
    const ent = cm.entities[type];
    switching = true;
    try {
      if (target.kind === 'parked') {
        const stand = target.ref;
        // the real one (where it was left) becomes a stand-in; it takes the stand-in's place
        if (!ent.hidden && ent.mesh.visible !== false) {
          addParked({ type, x: ent.position.x, z: ent.position.z, heading: ent.heading, label: null });
        }
        removeParked(stand);
        if (type === 'car') takeover.vacant = false;
        cm.setEntityHidden(type, false);
        cm.placeEntity(type, stand.x, stand.z, stand.heading);
      }
      selectMode(type);
    } finally {
      switching = false;
    }
    refreshColliders();
    save();
  }

  // A vehicle of the road (js/gta-takeover.js): the player's entity of its type to its place, a stand-in left where the
  // entity stood (unless it was put away)
  function take(a) {
    switching = true;
    try {
      takeover.take(a, {
        place(type, x, z, heading, wear = null) {
          const ent = cm.entities[type];
          if (!ent.hidden && ent.mesh.visible !== false && !(type === 'car' && takeover.body)) {
            addParked({ type, x: ent.position.x, z: ent.position.z, heading: ent.heading, label: null });
          }
          cm.setEntityHidden(type, false);
          wear?.();
          cm.placeEntity(type, x, z, heading);
          selectMode(type);
        }
      });
    } finally {
      switching = false;
    }
    refreshColliders();
    save();
  }

  function board(action, drive = false) {
    switching = true;
    try {
      if (drive) cm.setMode('rhb', { train: action.train });
      else cm.setMode('rhb', { passenger: action.train });
      if (cm.activeMode !== 'rhb') return false;
      selectMode('rhb');
    } finally {
      switching = false;
    }
    ride = drive ? null : { train: action.train, lastStation: action.station };
    return true;
  }

  // --- Getting out --------------------------------------------------------------------------------------------------
  const tooHigh = (spot, y) => Math.abs(cm.getGroundHeight(spot.x, spot.z, 'person', y) - y) > 1.6;
  function exit() {
    const mode = cm.activeMode;
    const ent = cm.getActiveEntity();
    let spots;
    if (mode === 'rhb') {
      const train = cm.rhbPassenger || rhb?.trains?.find((t) => t.manual);
      spots = train ? rhb.alightSpots(train, { driver: !cm.rhbPassenger }) : [];
    } else spots = exitSpots(mode, ent.position.x, ent.position.z, ent.heading, mode === 'car' ? takeover.footprint() : null);
    const leaving = mode === 'car' && !!takeover.body; // (a taken vehicle: it stays, the car is put away)
    const baseY = mode === 'rhb' ? ent.position.y - 0.9 : mode === 'helicopter' ? ent.position.y - 0.25 : ent.position.y;
    const free = (s) => cm.isSpotClear('person', s.x, s.z, s.heading) && !tooHigh(s, baseY);
    const spot = pickExitSpot(spots, free, onRoad) || spots[0];
    switching = true;
    try {
      selectMode('person');
    } finally {
      switching = false;
    }
    ride = null;
    if (spot) {
      if (free(spot)) cm.placeEntity('person', spot.x, spot.z, spot.heading);
      else cm.teleportActiveTo(spot.x, spot.z, spot.heading); // (nothing free right beside it: the nearest clear spot)
    }
    if (mode === 'snowcat' && !winter()) cm.setEntityHidden('snowcat', true);
    if (leaving) { takeover.leaveBody(); refreshColliders(); }
    save();
  }

  // A helicopter left off its pads (a stand-in, or the entity itself with the player out of it) goes back to the nearest
  // empty depot once it has stood a while and the player is far away (js/vehicle-depots.js shouldReturn, returnDepot);
  // not during a mission (its helicopter stands where the mission put it)
  function returnStrays() {
    if (missionRun()) return;
    const me = cm.getActiveEntity().position;
    const now = Date.now();
    for (const type of RETURN_TYPES) {
      if (cm.activeMode === type) continue;
      const e = cm.entities[type];
      const all = parked.filter((p) => p.type === type).map((p) => ({ x: p.x, z: p.z, ref: p, entity: false }));
      if (e && !e.hidden && e.mesh.visible !== false) all.push({ x: e.position.x, z: e.position.z, ref: e, entity: true });
      for (const v of all) {
        const since = v.entity ? leftAt[type] : v.ref.since;
        if (!shouldReturn(DEPOTS, type, v.x, v.z, since, me, now)) continue;
        const home = returnDepot(DEPOTS, type, v.x, v.z, all.filter((o) => o !== v));
        if (!home) continue;
        if (v.entity) {
          cm.placeEntity(type, home.x, home.z, home.heading);
          leftAt[type] = now; // (standing at a depot now: shouldReturn lets it be)
        } else {
          Object.assign(v.ref, { x: home.x, z: home.z, heading: home.heading, label: home.label, depot: home.id, since: null });
          v.ref.position.y = restY(type, home.x, home.z);
          if (v.ref.visual) placeVisual(v.ref);
        }
        v.x = home.x; v.z = home.z; // (the pad is taken now, for the next stray)
        dirty = true;
        flash(`The crew flew the ${VEHICLE_LABELS[type]} back to ${home.label}`);
      }
    }
  }

  // The ridden train left the map (it turns back beyond its end): the passenger gets off at the last station
  function followRide() {
    if (!ride || cm.activeMode !== 'rhb' || !cm.rhbPassenger) return;
    const seat = rhb.seat(ride.train);
    if (seat?.station) ride.lastStation = seat.station;
    if (seat?.visible) return;
    const st = STATION_POS.get(ride.lastStation?.name);
    switching = true;
    try { selectMode('person'); } finally { switching = false; }
    ride = null;
    if (st) cm.teleportActiveTo(st.x, st.z, 0);
    flash('End of the line: you got off');
  }

  // --- The prompt, the touch button, the keys -------------------------------------------------------------------------
  const prompt = el('button', 'panel gta-prompt');
  prompt.type = 'button';
  prompt.hidden = true;
  const keyF = el('kbd', 'gta-key-f', 'F');
  const keyG = el('kbd', 'gta-key-g', 'G');
  const promptBody = el('span', 'gta-prompt-body');
  const promptText = el('span', 'gta-prompt-text');
  const promptSub = el('span', 'gta-prompt-sub');
  promptBody.append(promptText, promptSub);
  prompt.append(keyF, keyG, promptBody);
  prompt.addEventListener('click', () => use());
  document.body.append(prompt);
  const tapButton = touchControls?.addTapButton?.({ className: 'touch-use', label: 'Get in', icon: GLYPHS.in, onTap: () => use() }) || null;

  let action = null;
  let flashText = null, flashUntil = 0;
  function flash(text) { flashText = text; flashUntil = performance.now() + 1800; render(); }

  function use({ drive = false } = {}) {
    if (mapSystem?.isFullMapOpen || missions?.listOpen) return false;
    const a = currentAction();
    if (!a) return false;
    if (a.kind === 'enter') { enter(a.target); return true; }
    if (a.kind === 'take') { take(a); return true; }
    if (a.kind === 'board') return board(a, drive && a.drive);
    if (a.kind === 'exit') {
      if (!a.ok) { flash(a.reason); return false; }
      exit();
      return true;
    }
    return false;
  }

  // The keys, the key bar and the gamepad (js/actions.js; js/main.js keeps them quiet while the map, the missions'
  // list or a mission's intro is open): F, or G (F is the groomer's tiller: out of the groomer with G); Enter is the
  // missions' start (js/missions-world.js). T boards a bus to drive it. K in a taken patrol car: the blue light and
  // the siren (the mission's own patrol car has its own K). The touch button above is the use action's own face.
  actions?.layer('gta', [
    { id: 'use', keys: ['KeyF', 'KeyG'], kbd: () => (cm.activeMode === 'snowcat' ? ['G'] : ['F']), pad: 'x', touch: false, label: () => (cm.activeMode === 'person' ? 'Get in' : 'Get out'), run: (code) => (code === 'KeyF' && cm.activeMode === 'snowcat' ? false : use()) },
    { id: 'drive', keys: ['KeyT'], hint: false, touch: false, when: () => cm.activeMode === 'person', run: () => { const a = currentAction(); if (a?.kind !== 'board' || !a.drive) return false; use({ drive: true }); } },
    { id: 'blue', kind: 'toggle', label: 'Blue light', keys: ['KeyK'], icon: 'i-beacon', pad: 'right', when: () => !missionRun() && takeover.inPatrolCar(), state: () => takeover.blueOn(), run: () => takeover.toggleBlue() }
  ]);

  function render() {
    const now = performance.now();
    const flashing = flashText && now < flashUntil;
    const a = action;
    // (a mission start in reach shows its own prompt above this one: Enter for it, F here)
    const show = !!a && !mapSystem?.isFullMapOpen && (a.kind !== 'exit' || a.ok || flashing);
    prompt.hidden = !show || document.body.classList.contains('touch-enabled');
    if (show) {
      promptText.textContent = flashing && a.kind === 'exit' && !a.ok ? flashText : a.label;
      const reasonShown = flashing && a.kind === 'exit' && !a.ok;
      promptSub.textContent = reasonShown ? '' : a.sub || '';
      promptSub.hidden = reasonShown || !a.sub;
      keyF.hidden = cm.activeMode === 'snowcat';
      keyG.hidden = cm.activeMode !== 'snowcat';
      prompt.dataset.kind = a.kind;
    } else if (flashing) {
      prompt.hidden = document.body.classList.contains('touch-enabled');
      promptText.textContent = flashText;
      promptSub.hidden = true;
    }
    // the touch button: also while moving (a tap then tells why not)
    const label = !a ? null : a.kind === 'take' ? (a.source === 'bus' ? 'Drive' : a.parked ? 'Get in' : 'Take') : a.kind === 'enter' ? 'Get in' : a.kind === 'board' ? 'Board' : a.kind === 'exit' ? (a.label === 'Get off' ? 'Get off' : 'Get out') : null;
    touchControls?.setTapButton?.(tapButton, label, !a ? null : a.kind === 'exit' ? GLYPHS.out : a.kind === 'board' ? GLYPHS.board : GLYPHS.in);
    if (tapButton) tapButton.classList.toggle('is-waiting', !!a && a.kind === 'exit' && !a.ok);
  }

  // --- The maps: the vehicles' places (the radar: those near; the full map: all) -----------------------------------
  // The helicopters stand out: a larger disc with the rotor's ring round it, and on the full map the name of the place
  // (its depot's label, or where it was set down), so that one sees from anywhere in the valley where the nearest is.
  const overlay = {
    draw(ctx, v, isMinimap) {
      const w = winter();
      const items = [];
      for (const p of parked) if (inSeason(p, w)) items.push({ type: p.type, x: p.x, z: p.z, label: p.label });
      for (const type of VEHICLES) {
        const e = cm.entities[type];
        if (e && !e.hidden && e.mesh.visible !== false && type !== cm.activeMode) items.push({ type, x: e.position.x, z: e.position.z, label: null });
      }
      // (the helicopters last: on top of the others)
      items.sort((a, b) => (a.type === 'helicopter') - (b.type === 'helicopter'));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of items) {
        const heli = p.type === 'helicopter';
        const r = (isMinimap ? 5 : 7.5) * (heli ? 1.35 : 1);
        const x = v.toX(p.x), y = v.toY(p.z);
        if (Math.abs(x) > v.w * 0.5 - r || Math.abs(y) > v.h * 0.5 - r) continue;
        const icon = ICONS[p.type];
        ctx.font = `700 ${(isMinimap ? 6.5 : 8.5) * (heli ? 1.3 : 1)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
        ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = icon.colour;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (heli) {
          // the rotor: a thin ring, its two blades
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.lineWidth = isMinimap ? 1 : 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - r - 4, y); ctx.lineTo(x - r - 1, y); ctx.moveTo(x + r + 1, y); ctx.lineTo(x + r + 4, y); ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.fillText(icon.letter, x, y + 0.5);
        if (heli && !isMinimap) {
          // (the entity, or a stand-in left by the player, standing on a pad: the pad's name)
          const label = t(p.label || atDepot(DEPOTS, p.type, p.x, p.z)?.label || 'Rega set down here');
          ctx.font = '600 11px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8, 12, 20, 0.85)';
          ctx.strokeText(label, x + r + 8, y); ctx.fillText(label, x + r + 8, y);
          ctx.textAlign = 'center';
        }
      }
      ctx.restore();
    },
    hover(mx, my, v) {
      const w = winter();
      for (const p of parked) {
        if (!inSeason(p, w)) continue;
        if (Math.hypot(v.toX(p.x) + v.w / 2 - mx, v.toY(p.z) + v.h / 2 - my) < 9) return `${VEHICLE_LABELS[p.type]}${p.label ? ` · ${p.label}` : ''} · Click to teleport here`;
      }
      return null;
    }
  };
  if (mapSystem) (mapSystem.overlays ||= []).push(overlay);

  // --- Every frame --------------------------------------------------------------------------------------------------
  let saveAt = 0;
  function update(dt, camera) {
    frame++;
    bookkeepCodeSwitch();
    if (frame % 120 === 60) returnStrays();
    followRide();
    const leftBefore = takeover.left.length;
    takeover.update(dt);
    if (takeover.left.length !== leftBefore) dirty = true; // (one went back into service: its collider goes)
    if (frame % 6 === 0) updateVisuals(camera);
    action = mapSystem?.isFullMapOpen ? null : currentAction();
    render();
    if (dirty) refreshColliders();
    const now = performance.now();
    if (dirty && now > saveAt) { save(); saveAt = now + 4000; }
  }
  window.addEventListener('pagehide', save);

  return {
    update, use, save,
    get parked() { return parked; },
    get action() { return action; },
    addParked, removeParked, takeover,
    setPlayerCarBody: takeover.setPlayerCarBody
  };
}
