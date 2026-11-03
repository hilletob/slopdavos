import * as THREE from 'three/webgpu';
import { MISSIONS, getMission, SPITAL_PAD, LAUNCHER, formatTime, formatDistance, relativeBearing, bestTimeKey, readBestTimes, recordBestTime, simulateShot, inZone } from './missions-data.js';
import { createTargetMarker, createZoneRing, createAimMarker, createLauncher, createShell, createScriptedRega, createPoliceCar, PROP_BUILDERS, slopeQuaternion } from './missions-props.js';
import { ParticleBatch, MissionAudio } from './missions-fx.js';
import { surfaceHeight, groundHeight, groundNormal } from './terrain.js';
import { setWinter } from './season.js';
import { groomMap } from './groom-map.js';
import { HELIPAD, buildHelipad } from './helipad.js';
import { TELEPORT_LOCATIONS, isTypingInField } from './city-config.js';
import { setWorldCenter } from './quality.js';
import { MissionManager, worldCellsReady } from './missions-manager.js';
import { createProgressStore, missionMedals, MEDAL_LABELS, MEDAL_POINTS, FIRST_CLEAR_POINTS, entryPoints } from './missions-progress.js';
import { buildMissionWorld } from './missions-world.js';
import { t as translateUI, setLocalizedText } from './i18n.js';
import { SNOW_FEATURES } from './missions-snow.js';
import { ICE_FEATURES } from './missions-ice.js';
import { FUN_FEATURES } from './missions-fun.js';
import { GOLF_FEATURES } from './missions-golf.js';
import { SLEDGE_FEATURES } from './missions-sledge.js';
import { MINE_FEATURES } from './missions-mine.js';
import { LOCAL_FEATURES } from './missions-local.js';
import { WORK_FEATURES } from './missions-work.js';
import { SPORT_FEATURES } from './missions-sport.js';
import { RESORT_FEATURES } from './missions-resort.js';
import { GASTRO_FEATURES } from './missions-gastro.js';
import { WEF_FEATURES } from './missions-wef.js';

// js/missions.js
// Missions: timed tasks in the city (js/missions-data.js has their definitions and the pure progress logic). In the
// open world every mission has its pin (js/missions-world.js: Enter in the start circle starts it); the list, a link
// (?mission=<id>, ?mission=list, &night=1 the night variant where there is one) or the HUD's score start them too.
// A completed run earns a medal by its time and points (js/missions-progress.js, the best medal a mission counts). The module builds its HUD panel (top centre, the city's glass
// panels), the target marker and the mission's props into the world, runs the stopwatch (it starts with the first
// input after "Start", stops at the finish; a split a step; the best time a mission in localStorage) and ends with the
// finish panel. A teleport or a change of mode during a mission aborts it (unless the step allows the mode); R restarts.
// js/main.js: buildMissions(scene, hooks) once the city stands, missions.update(dt, controllers, cameras) every frame.
// The missions switch without a reload (js/missions-manager.js): the list and the dialogs' buttons start the next one,
// the run before is torn down (MissionRun.dispose: its meshes, HUD, keys, features, traffic bodies and sounds) and the
// URL follows along (history.replaceState), so that a link or a reload comes back to the same mission.

const WORLD_WAIT_RADIUS = 600; // m: the streamed town's cells round the start built before the stopwatch is armed
const WORLD_WAIT_MAX_MS = 25000; // (a cell that never comes, e.g. a builder failed: the mission starts anyway)
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const ARROW = 'M12 2.5 19 20l-7-4-7 4z';
/** A scoreMode mission's score with its unit (def.scoreUnit: 'goals', …; default points) */
const scoreText = (def, v) => `${Math.round(v)} ${def.scoreUnit || 'pts'}`;

export function buildMissions(scene, hooks) {
  // (the pad the helipad module built: the Rega missions start and end on it)
  if (HELIPAD) Object.assign(SPITAL_PAD, { x: HELIPAD.x, z: HELIPAD.z, r: Math.max(5, (HELIPAD.radius || 7) - 0.5) });
  let listOverlay = null, world = null;
  const progress = createProgressStore(globalThis.localStorage, MISSIONS);
  const manager = new MissionManager({
    getMission,
    createRun: (def, opts) => {
      const run = new MissionRun(scene, def, { ...hooks, missions: manager, progress, flashPoints: (n, anchor) => world?.flashPoints(n, anchor) }, opts);
      globalThis.__slopdavosMission = run; // (test hooks: tools/probe scripts drive the mission through it)
      return run;
    },
    showList: (note) => { listOverlay = showList(manager, progress, note); },
    hideList: () => { listOverlay?.remove(); listOverlay = null; },
    setSearch: (search) => {
      try { history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`); } catch { /* (sandboxed) */ }
    },
    onError: (error, id) => console.warn('[missions] could not', id === 'dispose' ? 'tear down the run' : `start ${id}`, error),
    onFrame: (active, dt, cm) => world?.update(active, dt, cm)
  });
  try {
    world = buildMissionWorld(scene, { manager, progress, mapSystem: hooks.mapSystem, controllerManager: hooks.controllerManager });
  } catch (error) { console.warn('[missions] the pins in the world could not be built', error); }
  globalThis.__slopdavosMissions = manager; // (test hooks)
  globalThis.__slopdavosProgress = progress;
  globalThis.__slopdavosMissionWorld = world;
  manager.fromSearch(location.search);
  return manager;
}

/** ?mission=list: the missions to click on (the links keep their URLs: a new tab, a copied link work as ever) */
function showList(manager, progress, note = null) {
  const overlay = el('div', 'mission-overlay');
  overlay.id = 'mission-overlay'; overlay.dataset.list = '1';
  const go = (a, id, night) => a.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // (a new tab: the browser's)
    e.preventDefault();
    manager.start(id, { night });
  });
  const panel = el('div', 'panel mission-dialog');
  panel.append(el('div', 'mission-kicker', 'Missions'), el('h2', 'mission-dialog-title', 'Choose a mission'));
  const total = el('p', 'mission-list-total');
  total.append(el('span', 'mission-score-star', '★'), el('strong', null, progress.points.toLocaleString('en-US')), el('span', null, ` of ${progress.maxPoints.toLocaleString('en-US')} points`));
  panel.append(total);
  if (note) panel.append(el('p', 'mission-dialog-note', note));
  const list = el('ul', 'mission-list');
  const best = readBestTimes(globalThis.localStorage);
  for (const m of MISSIONS) {
    const li = el('li');
    const a = el('a', 'mission-link', m.title);
    a.href = `?mission=${m.id}`;
    go(a, m.id, false);
    const entry = progress.entry(m.id);
    li.append(medalBadge(entry?.medal, !!entry), a);
    const b = best[bestTimeKey(m.id)];
    const score = el('span', 'mission-list-points', entry ? `${entryPoints(entry)} pts` : `– / ${FIRST_CLEAR_POINTS + MEDAL_POINTS.gold}`);
    if (m.scoreMode) { if (Number.isFinite(entry?.bestScore)) score.append(el('span', 'mission-list-best', scoreText(m, entry.bestScore))); }
    else if (Number.isFinite(b)) score.append(el('span', 'mission-list-best', formatTime(b)));
    li.append(score);
    if (m.nightTime) { const n = el('a', 'mission-link-night', 'Night'); n.href = `?mission=${m.id}&night=1`; go(n, m.id, true); li.append(n); }
    list.append(li);
  }
  panel.append(list);
  const back = el('a', 'mission-btn mission-btn-secondary', 'Back to the game');
  back.href = location.pathname;
  back.addEventListener('click', (e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); manager.stop(); });
  panel.append(back);
  overlay.append(panel);
  document.body.append(overlay);
  return overlay;
}

/** A medal as a small round badge (grey: none yet; dashed: not completed) */
function medalBadge(medal, completed = true) {
  const b = el('span', `mission-medal mission-medal-${medal || 'none'}${completed ? '' : ' is-open'}`);
  b.title = medal ? `${MEDAL_LABELS[medal]} medal` : completed ? 'Completed, no medal' : 'Not completed yet';
  return b;
}

/** The medals' time limits as a line: Gold 3:00 · Silver 4:00 · Bronze 6:00 */
function medalLimits(def, current = null) {
  const limits = missionMedals(def);
  const line = el('p', 'mission-dialog-meta mission-medal-limits');
  if (!limits) return line;
  for (const m of ['gold', 'silver', 'bronze']) {
    const span = el('span', `mission-limit${current === m ? ' is-held' : ''}`);
    span.append(medalBadge(m), document.createTextNode(` ${MEDAL_LABELS[m]} ${def.scoreMode ? scoreText(def, limits[m]) : formatTime(limits[m]).replace(/\.\d$/, '')}`));
    line.append(span);
  }
  return line;
}

/** Disposes what a run built: the geometries, its own materials and their textures (not the shared ones, marked by
 *  js/missions-props.js, nor the city's), the instanced meshes' buffers */
function disposeTree(root) {
  const materials = new Set(), geometries = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) if (!m.userData?.shared) materials.add(m);
    if (o.isInstancedMesh) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
    m.dispose();
  }
}

class MissionRun {
  constructor(scene, def, hooks, { night }) {
    this.active = true;
    this.scene = scene;
    this.def = def;
    this.hooks = hooks;
    this.night = !!night && !!def.nightTime;
    this.bestKey = bestTimeKey(def.id, this.night ? 'night' : null);
    this.phase = 'intro'; // intro | ready | running | done | failed | aborted
    this.startedAt = 0;
    this.elapsed = 0;
    this.splits = [];
    this.index = 0;
    this.state = null;
    this.result = null;
    this.lastMode = null;
    this.lastPos = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = 'Missions';
    scene.add(this.group);
    this.marker = createTargetMarker();
    this.rings = { plain: createZoneRing('plain'), hazard: createZoneRing('hazard'), pad: createZoneRing('pad') };
    this.group.add(this.marker, ...Object.values(this.rings));
    this.props = [];
    this.features = {};
    this.cleanups = []; // (what dispose() undoes: listeners, bodies, DOM)
    this.trafficBodies = [];
    this.disposed = false;
    this.audio = new MissionAudio(hooks.audio);
    this.ui = {};
    try {
      this.buildHud();
      this.bindKeys();
      this.buildProps();
      for (const f of def.features || []) if (FEATURES[f]) { FEATURES[f].setup(this); this.features[f] = FEATURES[f]; }
      this.setup();
      this.showIntro();
    } catch (error) {
      this.dispose(); // (half built: nothing of it stays)
      throw error;
    }
  }

  // --- Setup: the season, the time, the player at the start --------------------------------------------------------
  resolveStart() {
    const s = this.def.start;
    const t = s.teleport ? TELEPORT_LOCATIONS[s.teleport] : null;
    return t ? { ...s, x: t.x, z: t.z, heading: t.heading ?? s.heading } : s;
  }

  setup() {
    const { def, hooks } = this;
    const cm = hooks.controllerManager;
    const start = this.resolveStart();
    // (the mobile profile, js/world-stream.js: the detailed town moves to the start, before the season builds the
    // winter scenery round it; the streets follow in cells, see worldReady)
    if (hooks.world) setWorldCenter(start.x, start.z);
    if (def.mode === 'helicopter' && hooks.world) buildHelipad(this.scene, { force: true }); // (the pad, wherever the game began)
    hooks.selectMode(def.mode);
    if (def.season === 'winter') setWinter(true, { animate: false });
    else if (def.season === 'summer') setWinter(false, { animate: false });
    hooks.selectTime(this.night ? def.nightTime : def.time || 'golden');
    hooks.teleportXZ(start.x, start.z, start.heading);
    const ent = cm.getActiveEntity();
    if (def.mode === 'helicopter') {
      // set down on the pad (the pad's platform is the surface there), or hovering 40 m up
      ent.position.set(start.x, surfaceHeight(start.x, start.z) + (start.onGround ? 0.25 : 40), start.z);
      ent.heading = start.heading;
      ent.speed = ent.verticalSpeed = 0;
      ent.mesh.position.copy(ent.position);
      ent.mesh.rotation.y = ent.heading;
      hooks.cameraSystem.resetForTeleport();
    }
    if (def.mode === 'snowcat' && cm.entities.snowcat) cm.entities.snowcat.tillerRaised = false;
    this.startXZ = { x: start.x, z: start.z };
    this.state = def.createState();
    this.index = 0;
    this.splits = [];
    this.startedAt = 0;
    this.elapsed = 0;
    this.result = null;
    this.lastMode = cm.activeMode;
    this.lastPos.copy(ent.position);
    this.resetProps();
    for (const f of Object.values(this.features)) f.reset?.(this);
    this.renderSplits();
  }

  // --- Props -------------------------------------------------------------------------------------------------------
  buildProps() {
    const webgpu = !!globalThis.__slopdavosBuild?.renderer?.backend?.isWebGPUBackend;
    // (on WebGPU the city's instanced meshes keep their matrices in storage buffers, js/main.js; the shared materials
    // are compiled for those, so the missions' instanced props must match)
    this.storage = (root) => { if (webgpu) root.traverse((o) => { if (o.isInstancedMesh && !o.instanceMatrix.isStorageInstancedBufferAttribute) o.instanceMatrix = new THREE.StorageInstancedBufferAttribute(o.instanceMatrix.array, 16); }); return root; };
    const cm = this.hooks.controllerManager;
    const n = { x: 0, y: 1, z: 0 };
    for (const p of this.def.props || []) {
      const build = PROP_BUILDERS[p.type];
      if (!build) continue;
      const obj = this.storage(build());
      const y = p.type === 'patient' || p.type === 'helper' ? surfaceHeight(p.x, p.z) : cm.getGroundHeight(p.x, p.z, 'car');
      obj.position.set(p.x, y, p.z);
      const heading = p.face ? Math.atan2(p.face.x - p.x, p.face.z - p.z) : (p.heading ?? 0);
      if (p.type === 'patient' || p.type === 'motorbike') {
        groundNormal(p.x, p.z, n);
        obj.quaternion.copy(slopeQuaternion(n)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading));
      } else obj.rotation.y = heading;
      obj.updateMatrixWorld(true);
      if (p.type === 'policeCar') {
        obj.userData.lightbar.visible = !!p.blueLight;
        if (p.block && this.hooks.trafficBodies) {
          // the traffic sees it as a parked, solid body (js/traffic.js tramBodies, like the parked snow groomer)
          const body = { x: p.x, z: p.z, prevX: p.x, prevZ: p.z, y, sin: Math.sin(heading), cos: Math.cos(heading), halfW: 0.95, halfL: 2.35, mass: 1800, vx: 0, vz: 0, angularVel: 0, parked: 'police' };
          this.hooks.trafficBodies.push(body);
          this.trafficBodies.push(body); // (dispose() takes it out again)
        }
      }
      this.group.add(obj);
      this.props.push({ def: p, obj });
    }
  }

  resetProps() {
    for (const { def, obj } of this.props) obj.visible = !def.showAfter;
    this.marker.visible = false;
    for (const r of Object.values(this.rings)) r.visible = false;
  }

  onObjectiveDone(objId) {
    for (const { def, obj } of this.props) {
      if (def.hideAfter === objId) obj.visible = false;
      if (def.showAfter === objId) obj.visible = true;
    }
  }

  // --- HUD -----------------------------------------------------------------------------------------------------------
  buildHud() {
    const hud = el('div', 'hud hud-top-center mission-hud');
    hud.id = 'mission-hud';
    const panel = el('section', 'panel mission');
    panel.setAttribute('aria-label', 'Mission');
    const head = el('div', 'mission-head');
    this.ui = {
      hud, panel,
      kicker: el('span', 'mission-kicker', 'Mission'),
      title: el('h2', 'mission-title', this.def.title),
      best: el('span', 'mission-best'),
      clock: el('div', 'mission-clock', '00:00.0'),
      stepN: el('span', 'mission-step-n'),
      stepTitle: el('span', 'mission-step-title'),
      text: el('div', 'mission-text'),
      bar: el('div', 'mission-bar'),
      fill: el('span', 'mission-bar-fill'),
      nav: el('div', 'mission-nav'),
      dist: el('span', 'mission-dist'),
      hint: el('div', 'mission-hint'),
      splits: el('ol', 'mission-splits'),
      overlay: null, crosshair: null, fire: null
    };
    const menu = el('button', 'mission-menu', 'Missions');
    menu.type = 'button';
    menu.title = 'All missions';
    menu.addEventListener('click', () => this.hooks.missions?.showList());
    head.append(this.ui.kicker, this.ui.title, this.ui.best);
    const step = el('div', 'mission-step');
    step.append(this.ui.stepN, this.ui.stepTitle);
    this.ui.bar.append(this.ui.fill);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('class', 'mission-arrow');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ARROW);
    arrow.append(path);
    this.ui.arrow = arrow;
    this.ui.nav.append(arrow, this.ui.dist);
    panel.append(head, this.ui.clock, step, this.ui.text, this.ui.bar, this.ui.nav, this.ui.hint, this.ui.splits, menu);
    hud.append(panel);
    document.body.append(hud);
    this.renderBest();
    this.ui.overlay = el('div', 'mission-overlay');
    this.ui.overlay.id = 'mission-overlay';
    this.ui.overlay.hidden = true;
    document.body.append(this.ui.overlay);
  }

  renderBest() {
    this.ui.best.textContent = this.bestText();
  }

  /** "Best time 03:12.4" (a scoreMode mission: its best score) */
  bestText() {
    if (this.def.scoreMode) {
      const s = this.hooks.progress?.entry(this.def.id)?.bestScore;
      return Number.isFinite(s) ? `Best score ${Math.round(s)}` : 'No best score yet';
    }
    const best = readBestTimes(globalThis.localStorage)[this.bestKey];
    return Number.isFinite(best) ? `Best time ${formatTime(best)}` : 'No best time yet';
  }

  /** The time penalties the mission has handed out so far (state.penaltyMs: a missed gate, a crash), in ms */
  penaltyMs() { return this.state?.penaltyMs || 0; }

  renderSplits() {
    this.ui.splits.replaceChildren(...this.splits.map((s) => {
      const li = el('li', 'mission-split');
      // (a scoreMode mission: the score after the step, not its time)
      li.append(el('span', 'mission-split-title', s.title), el('span', 'mission-split-time', Number.isFinite(s.score) ? scoreText(this.def, s.score) : formatTime(s.t)));
      return li;
    }));
    this.ui.splits.hidden = !this.splits.length;
  }

  dialog(kicker, title, nodes, buttons) {
    const o = this.ui.overlay;
    o.replaceChildren();
    const panel = el('div', 'panel mission-dialog');
    panel.append(el('div', 'mission-kicker', kicker), el('h2', 'mission-dialog-title', title), ...nodes);
    const row = el('div', 'mission-dialog-buttons');
    for (const [label, key, onClick, secondary] of buttons) {
      const b = el('button', `mission-btn${secondary ? ' mission-btn-secondary' : ''}`);
      b.type = 'button';
      b.append(document.createTextNode(label));
      if (key) { const k = el('kbd', null, key); b.append(k); }
      b.addEventListener('click', onClick);
      row.append(b);
    }
    panel.append(row);
    o.append(panel);
    o.hidden = false;
  }

  showIntro() {
    const nodes = [el('p', 'mission-dialog-text', this.def.intro)];
    const meta = el('p', 'mission-dialog-meta');
    meta.append(el('span', null, `${this.def.objectives.length} steps`), el('span', null, this.night ? 'Night' : 'Day'),
      el('span', 'mission-dialog-best', this.bestText()));
    nodes.push(meta, medalLimits(this.def, this.hooks.progress?.medal(this.def.id)), el('p', 'mission-dialog-note', 'The stopwatch starts with your first input after Start.'));
    this.dialog('Mission', this.def.title, nodes, [['Start', 'Enter', () => this.start()], ['All missions', null, () => this.hooks.missions?.showList(), true], ['Back to the game', null, () => this.hooks.missions?.stop(), true]]);
  }

  showEnd() {
    const r = this.result;
    const nodes = [];
    const scored = Number.isFinite(r.score);
    const time = el('div', 'mission-final-time', scored ? scoreText(this.def, r.score) : formatTime(r.total));
    if (r.improved) time.classList.add('is-best');
    nodes.push(time);
    const line = el('p', 'mission-dialog-meta');
    const fmt = (v) => (scored ? scoreText(this.def, v) : formatTime(v));
    const word = scored ? 'score' : 'time';
    if (r.improved) line.append(el('span', 'mission-new-best', r.previous === null ? `First best ${word}` : `New best ${word} (was ${fmt(r.previous)})`));
    else line.append(el('span', null, `Best ${word} ${fmt(r.best)}`));
    if (scored) line.append(el('span', null, `Time ${formatTime(r.total)}`));
    nodes.push(line);
    let medalNode = null;
    const award = r.award;
    if (award) {
      medalNode = el('div', `mission-award mission-award-${award.medal || 'none'}`);
      const big = el('span', `mission-medal mission-medal-big mission-medal-${award.medal || 'none'}`);
      const words = el('div', 'mission-award-words');
      words.append(el('strong', null, award.medal ? `${MEDAL_LABELS[award.medal]} medal` : 'No medal this time'));
      const notes = [];
      if (award.firstClear) notes.push(`first completion +${FIRST_CLEAR_POINTS}`);
      if (award.medalUp && award.medal) notes.push(`${MEDAL_LABELS[award.medal]} +${MEDAL_POINTS[award.medal] - (MEDAL_POINTS[award.previousMedal] || 0)}`);
      if (!award.points) notes.push(award.bestMedal ? `you hold ${MEDAL_LABELS[award.bestMedal]}: no new points` : 'no new points');
      words.append(el('span', null, notes.join(' · ')));
      medalNode.append(big, words, el('span', `mission-award-points${award.points ? '' : ' is-zero'}`, `+${award.points}`));
      nodes.push(medalNode, medalLimits(this.def, award.bestMedal));
    }
    const splits = el('ol', 'mission-dialog-splits');
    let prev = 0;
    for (const s of this.splits) {
      const li = el('li');
      li.append(el('span', null, s.title), el('span', 'mission-split-lap', `+${formatTime(s.t - prev)}`), el('span', 'mission-split-time', formatTime(s.t)));
      prev = s.t;
      splits.append(li);
    }
    nodes.push(splits);
    for (const extra of this.def.summary?.(this.state) || []) nodes.push(el('p', 'mission-dialog-note', extra));
    nodes.push(el('p', 'mission-dialog-text', this.def.finish));
    this.dialog('Mission complete', this.def.title, nodes, [['Restart', 'R', () => this.restart()], ['All missions', null, () => this.hooks.missions?.showList(), true], ['Back to the game', null, () => this.hooks.missions?.stop(), true]]);
    if (award?.points) requestAnimationFrame(() => this.hooks.flashPoints?.(award.points, medalNode.querySelector('.mission-award-points')));
  }

  showStopped(kicker, reason) {
    this.dialog(kicker, this.def.title, [el('p', 'mission-dialog-text', reason), el('p', 'mission-dialog-meta', `Time ${formatTime(this.elapsed)}`)],
      [['Restart', 'R', () => this.restart()], ['All missions', null, () => this.hooks.missions?.showList(), true], ['Back to the game', null, () => this.hooks.missions?.stop(), true]]);
  }

  bindKeys() {
    const onKey = (e) => {
      if (isTypingInField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Enter' && this.phase === 'intro' && !e.repeat) { e.preventDefault(); this.start(); return; }
      if (e.code === 'KeyR' && !e.repeat && this.phase !== 'intro') { e.preventDefault(); this.restart(); return; }
      for (const f of Object.values(this.features)) f.key?.(this, e);
    };
    this.listen(window, 'keydown', onKey, { capture: true });
  }

  /** An event listener that dispose() removes again */
  listen(target, type, fn, options) {
    if (!target) return;
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  start() {
    this.setup();
    this.ui.overlay.hidden = true;
    // (the mobile profile: the streets round the start come in cells after the teleport; the stopwatch is armed once
    // they stand, the player held at the start meanwhile)
    if (!this.worldReady()) {
      this.phase = 'loading';
      this.ui.panel.dataset.phase = 'loading';
      this.loadingSince = performance.now();
      return;
    }
    this.phase = 'ready';
    this.ui.panel.dataset.phase = 'ready';
  }

  worldReady() {
    const s = this.startXZ;
    return !s || worldCellsReady(this.hooks.world, s.x, s.z, WORLD_WAIT_RADIUS);
  }

  /** Tears the run down: nothing of it stays in the scene, the page or the traffic (js/missions-manager.js) */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.phase = 'disposed';
    for (const f of Object.values(this.features)) {
      try { f.teardown?.(this); } catch (error) { console.warn('[missions] teardown', error); }
    }
    for (const fn of this.cleanups.splice(0).reverse()) fn();
    const bodies = this.hooks.trafficBodies;
    if (bodies) for (const b of this.trafficBodies) { const i = bodies.indexOf(b); if (i >= 0) bodies.splice(i, 1); }
    this.trafficBodies.length = 0;
    this.audio.dispose();
    this.group.removeFromParent();
    disposeTree(this.group);
    this.props.length = 0;
    for (const node of [this.ui.hud, this.ui.overlay, this.ui.crosshair, this.ui.fire]) node?.remove();
    if (globalThis.__slopdavosMission === this) globalThis.__slopdavosMission = null;
  }

  restart() { this.start(); }

  // --- The frame -----------------------------------------------------------------------------------------------------
  frame(cm, cs, dt, now) {
    const ent = cm.getActiveEntity();
    const p = ent.position;
    const ground = surfaceHeight(p.x, p.z);
    const cat = cm.entities.snowcat;
    return {
      mode: cm.activeMode, x: p.x, y: p.y, z: p.z, heading: ent.heading, speed: ent.speed || 0, verticalSpeed: ent.verticalSpeed || ent.verticalVel || 0,
      agl: p.y - ground, tillerRaised: !!cat?.tillerRaised, tillerLift: cat?.model?.tillerLift?.value ?? 0,
      segs: { array: groomMap.segs, count: groomMap.count }, highBeam: !!cm.highBeam, blueLight: !!this.features.policeCar && !!this.blueLight,
      night: this.night, dt, t: this.phase === 'running' ? now - this.startedAt : 0,
      shooter: this.shooter ? { shots: this.shooter.shots, hits: this.shooter.hits, misses: this.shooter.misses, ammo: this.shooter.ammo, inFlight: !!this.shooter.shell } : null,
      rega: this.rega ? { phase: this.rega.phase } : null, camera: cs.camera
    };
  }

  inputDetected(cm, cs, ent) {
    return Object.values(cm.keys).some(Boolean) || Math.abs(ent.speed || 0) > 0.3 || cs.isDragging || this.shooter?.firedOnce;
  }

  update(dt, cm, cs) {
    if (this.disposed) return;
    // The stopwatch runs on game time (the sum of the frames' dt, which main.js caps at 50 ms): at a low frame rate the
    // simulation slows down, and a wall clock would then hand out slower times (and worse medals) on slower machines
    this.gameClock = (this.gameClock || 0) + dt * 1000;
    const now = this.gameClock;
    if (this.phase === 'loading') {
      if (this.worldReady() || performance.now() - this.loadingSince > WORLD_WAIT_MAX_MS) { this.start(); if (this.phase === 'loading') { this.phase = 'ready'; this.ui.panel.dataset.phase = 'ready'; } }
    }
    const ent = cm.getActiveEntity();
    const ctx = this.frame(cm, cs, dt, now);
    if (this.phase === 'ready' && this.inputDetected(cm, cs, ent)) {
      this.phase = 'running';
      this.startedAt = now;
      this.ui.panel.dataset.phase = 'running';
    }
    if (this.phase === 'running') this.elapsed = now - this.startedAt + this.penaltyMs();
    const live = this.phase === 'ready' || this.phase === 'running';
    let view = null;
    if (live) {
      this.watchPlayer(cm, ent);
      if (this.phase === 'aborted') return this.render(ctx, null);
      for (const f of Object.values(this.features)) f.update?.(this, ctx, dt, cm, cs);
      this.def.update?.(ctx, this.state);
      const objective = this.def.objectives[this.index];
      view = objective.check(ctx, this.state);
      if (view.fail) {
        this.phase = 'failed';
        this.ui.panel.dataset.phase = 'failed';
        this.showStopped('Mission failed', view.fail);
      } else if (view.done) {
        const t = this.phase === 'running' ? now - this.startedAt + this.penaltyMs() : 0;
        if (this.phase === 'ready') { this.phase = 'running'; this.startedAt = now; }
        this.splits.push({ title: objective.title, t, score: this.def.scoreMode ? this.def.score(this.state) : null });
        this.onObjectiveDone(objective.id);
        this.renderSplits();
        this.index++;
        view = { ...view, target: null };
        if (this.index >= this.def.objectives.length) this.finish(now);
      }
    }
    this.render(ctx, view);
    for (const f of Object.values(this.features)) f.after?.(this, ctx, dt, cm, cs);
    this.animateProps(dt);
    this.group.updateMatrixWorld(true);
  }

  // A change of mode or a jump (teleport) stops the mission, unless the step allows the mode
  watchPlayer(cm, ent) {
    const mode = cm.activeMode;
    if (mode !== this.lastMode) {
      const allowed = this.def.objectives[this.index].allowModes || this.def.allowModes || [this.def.mode];
      if (!allowed.includes(mode)) return this.abort(`Mode switch (${mode}): the mission was aborted.`);
      // on foot beside the car: the pedestrian steps out of the driver's door
      if (mode === 'person' && this.lastMode === 'car') {
        const car = cm.entities.car;
        const x = car.position.x + Math.cos(car.heading) * 2.4, z = car.position.z - Math.sin(car.heading) * 2.4;
        cm.teleportActiveTo(x, z, car.heading);
      }
      this.lastMode = mode;
      this.lastPos.copy(cm.getActiveEntity().position);
      return;
    }
    const jump = this.lastPos.distanceTo(ent.position);
    if (jump > 60) return this.abort('Teleport: the mission was aborted.');
    this.lastPos.copy(ent.position);
  }

  abort(reason) {
    this.phase = 'aborted';
    this.ui.panel.dataset.phase = 'aborted';
    this.showStopped('Mission aborted', reason);
  }

  finish(now) {
    this.phase = 'done';
    this.ui.panel.dataset.phase = 'done';
    const total = now - this.startedAt + this.penaltyMs();
    this.elapsed = total;
    let rec;
    const score = this.def.scoreMode ? this.def.score(this.state) : null;
    if (this.def.scoreMode) {
      // (judged by points: the best score is kept with the progress, not with the best times)
      const prev = this.hooks.progress?.entry(this.def.id)?.bestScore;
      const previous = Number.isFinite(prev) ? prev : null;
      rec = { best: previous === null ? score : Math.max(previous, score), previous, improved: previous === null || score > previous };
    } else rec = recordBestTime(globalThis.localStorage, this.bestKey, total);
    const { best, previous, improved } = rec;
    const award = this.hooks.progress ? this.hooks.progress.record(this.def, total, Date.now(), score) : null;
    this.result = { total, score, best, previous, improved, award };
    this.renderBest();
    this.marker.visible = false;
    for (const r of Object.values(this.rings)) r.visible = false;
    this.showEnd();
  }

  render(ctx, view) {
    const u = this.ui;
    u.clock.textContent = formatTime(this.elapsed);
    u.clock.classList.toggle('is-running', this.phase === 'running');
    const n = Math.min(this.index + 1, this.def.objectives.length);
    u.stepN.textContent = `${n}/${this.def.objectives.length}`;
    const objective = this.def.objectives[Math.min(this.index, this.def.objectives.length - 1)];
    u.stepTitle.textContent = this.phase === 'done' ? 'Mission complete' : objective.title;
    if (view) {
      if (u.text.textContent !== translateUI(view.text || '')) setLocalizedText(u.text, view.text || '');
      u.bar.hidden = view.progress == null;
      if (view.progress != null) u.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, view.progress))})`;
      const hint = view.hint || (this.phase === 'ready' ? 'Ready: the clock starts with your first input' : '');
      if (u.hint.textContent !== translateUI(hint || '')) setLocalizedText(u.hint, hint || '');
      u.hint.hidden = !hint;
      this.placeTarget(view.target, ctx);
    } else if (this.phase === 'loading') {
      u.text.textContent = 'Loading the surroundings …';
      u.bar.hidden = true;
      u.nav.hidden = true;
      u.hint.textContent = 'The stopwatch will be ready in a moment';
      u.hint.hidden = false;
    } else if (this.phase === 'intro') {
      u.text.textContent = 'Press Enter or the button to start';
      u.bar.hidden = true;
      u.hint.hidden = true;
      u.nav.hidden = true;
      const first = this.def.objectives[0].check(ctx, this.def.createState());
      this.placeTarget(first.target, ctx, true);
    } else {
      u.nav.hidden = true;
      u.bar.hidden = true;
      u.hint.hidden = true;
    }
  }

  // The marker in the world and the arrow in the HUD
  placeTarget(target, ctx, quiet = false) {
    const u = this.ui;
    if (!target) {
      this.marker.visible = false;
      for (const r of Object.values(this.rings)) r.visible = false;
      u.nav.hidden = true;
      return;
    }
    const y = surfaceHeight(target.x, target.z);
    this.marker.visible = true;
    this.marker.position.set(target.x, y, target.z);
    this.marker.userData.colour.value.set(target.style === 'hazard' ? 0xffc21a : target.style === 'pad' ? 0xffffff : 0x3fd6ff);
    for (const [style, ring] of Object.entries(this.rings)) {
      const on = !!target.r && (target.style || 'plain') === style;
      ring.visible = on;
      if (on) { ring.position.set(target.x, y + 0.2, target.z); ring.scale.set(target.r, 1, target.r); }
    }
    const d = Math.hypot(target.x - ctx.x, target.z - ctx.z);
    const rel = relativeBearing(ctx.x, ctx.z, ctx.heading, target.x, target.z);
    u.nav.hidden = quiet;
    u.arrow.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
    const dy = y - ctx.y;
    u.dist.textContent = formatDistance(d) + (this.def.mode === 'helicopter' && Math.abs(dy) > 15 ? ` · ${dy > 0 ? '↑' : '↓'} ${Math.round(Math.abs(dy))} m` : '');
  }

  animateProps(dt) {
    this.waveT = (this.waveT || 0) + dt;
    for (const { obj } of this.props) {
      const arm = obj.userData?.wave;
      if (arm && obj.visible) arm.rotation.z = -2.6 + Math.sin(this.waveT * 5.5) * 0.45;
    }
  }
}

// =====================================================================================================================
// Features: the runtime extras a mission can ask for (def.features)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

const FEATURES = {
  // The avalanche launcher (lawinen-sprengen): aim with the camera, fire with Space / Enter / F, a click or the touch
  // button; the shell flies ballistically with a smoke trail and comes down on the slope
  shooter: {
    setup(run) {
      run.shooter = { shots: 0, hits: 0, misses: 0, ammo: run.def.ammo, shell: null, lastShot: -1e9, firedOnce: false, zoneIndex: 0 };
      run.launcher = createLauncher();
      run.shellMesh = createShell();
      run.aimMarker = createAimMarker();
      run.group.add(run.launcher, run.shellMesh, run.aimMarker);
      run.particles = new ParticleBatch(run.scene);
      run.storage(run.particles.mesh);
      // HUD: the crosshair with the elevation, the fire button on touch screens
      const cross = el('div', 'mission-crosshair');
      cross.append(el('span', 'mission-crosshair-ring'), el('span', 'mission-crosshair-dot'));
      const info = el('div', 'mission-aim-info');
      cross.append(info);
      run.ui.crosshair = cross;
      run.ui.aimInfo = info;
      document.body.append(cross);
      const fire = el('button', 'panel mission-fire', 'Fire');
      fire.type = 'button';
      run.listen(fire, 'pointerdown', (e) => { e.preventDefault(); FEATURES.shooter.fire(run); });
      run.ui.fire = fire;
      document.body.append(fire);
      // a click (not a drag) on the view fires too
      let down = null;
      const canvas = run.hooks.cameraSystem.camera && document.getElementById('canvas-container');
      run.listen(canvas, 'pointerdown', (e) => { if (e.pointerType !== 'touch' && e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      run.listen(canvas, 'pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (moved < 6 && performance.now() - down.t < 300) FEATURES.shooter.fire(run);
        down = null;
      });
    },
    // (the tube, the shell and the aim ring go with the run's group; the particles live in the scene itself)
    teardown(run) {
      run.particles.dispose();
      const cs = run.hooks.cameraSystem;
      cs.orbitYawOffset = 0;
      cs.orbitPitchOffset = 0.09; // (js/cameras.js: the chase camera's own)
      run.lastAim = null;
    },
    reset(run) {
      const cs = run.hooks.cameraSystem;
      cs.orbitYawOffset = 0;
      cs.orbitPitchOffset = 0.68 - (26 - 5) / 45; // 26° up the slope to start with
      Object.assign(run.shooter, { shots: 0, hits: 0, misses: 0, ammo: run.def.ammo, shell: null, lastShot: -1e9, firedOnce: false });
      run.shellMesh.visible = false;
      run.particles.particles.length = 0;
      run.particles.releases = [];
    },
    key(run, e) {
      if (e.code === 'Space' || e.code === 'KeyF' || (e.code === 'Enter' && run.phase !== 'intro')) {
        // (Space would make the pedestrian jump: the controllers never see it during this mission)
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) FEATURES.shooter.fire(run);
      }
    },
    // The aim: the direction of the drag-orbit (yaw) and its pitch as the elevation (drag up: aim higher), 5-50°
    aim(run, ctx) {
      const cs = run.hooks.cameraSystem;
      const yaw = ctx.heading + (cs.orbitYawOffset || 0);
      const elev = (5 + (0.68 - (cs.orbitPitchOffset ?? 0.09)) * 45) * Math.PI / 180;
      const muzzle = { x: ctx.x + Math.cos(yaw) * 0.3 + Math.sin(yaw) * 0.35, y: ctx.y + 1.45, z: ctx.z - Math.sin(yaw) * 0.3 + Math.cos(yaw) * 0.35 };
      const c = Math.cos(elev);
      return { muzzle, dir: { x: Math.sin(yaw) * c, y: Math.sin(elev), z: Math.cos(yaw) * c }, yaw, elev };
    },
    // Over the shoulder, along the line of the tube: the crosshair in the middle of the screen is the launch line
    after(run, ctx) {
      const aim = run.lastAim;
      if (!aim || ctx.mode !== 'person' || run.phase === 'intro') return;
      const cam = ctx.camera, d = aim.dir, h = Math.hypot(d.x, d.z) || 1;
      cam.position.set(aim.muzzle.x - (d.x / h) * 4.2 - (d.z / h) * 0.9, aim.muzzle.y + 0.55 - d.y * 1.5, aim.muzzle.z - (d.z / h) * 4.2 + (d.x / h) * 0.9);
      cam.lookAt(aim.muzzle.x + d.x * 300, aim.muzzle.y + d.y * 300, aim.muzzle.z + d.z * 300);
      cam.updateMatrixWorld();
    },
    fire(run) {
      if (run.phase === 'intro' || run.phase === 'done' || run.phase === 'failed' || run.phase === 'aborted') return;
      const s = run.shooter, now = performance.now();
      if (s.shell || s.ammo <= 0 || now - s.lastShot < LAUNCHER.reloadS * 1000 || !run.lastAim) return;
      const { muzzle, dir } = run.lastAim;
      s.shell = { x: muzzle.x, y: muzzle.y, z: muzzle.z, vx: dir.x * LAUNCHER.speed, vy: dir.y * LAUNCHER.speed, vz: dir.z * LAUNCHER.speed, t: 0 };
      s.ammo--; s.shots++; s.lastShot = now; s.firedOnce = true;
      run.shellMesh.visible = true;
      run.audio.thump();
      run.ui.fire?.classList.add('is-reloading');
    },
    update(run, ctx, dt) {
      const s = run.shooter;
      const aim = run.lastAim = FEATURES.shooter.aim(run, ctx);
      // the launcher on the shoulder, pointing along the aim
      run.launcher.position.set(aim.muzzle.x, aim.muzzle.y - 0.08, aim.muzzle.z);
      run.launcher.lookAt(aim.muzzle.x + aim.dir.x, aim.muzzle.y - 0.08 + aim.dir.y, aim.muzzle.z + aim.dir.z);
      run.launcher.visible = ctx.mode === 'person';
      // the predicted impact
      const predicted = simulateShot(aim.muzzle, { x: aim.dir.x * LAUNCHER.speed, y: aim.dir.y * LAUNCHER.speed, z: aim.dir.z * LAUNCHER.speed }, groundHeight, { dt: 0.08 });
      run.lastPredicted = predicted;
      run.aimMarker.visible = !!predicted && run.phase !== 'intro';
      if (predicted) { run.aimMarker.position.set(predicted.x, predicted.y + 0.3, predicted.z); const sc = Math.max(1, Math.hypot(predicted.x - ctx.x, predicted.z - ctx.z) / 120); run.aimMarker.scale.set(sc, 1, sc); }
      const zone = run.def.zones[Math.min(s.hits, run.def.zones.length - 1)];
      const elev = Math.asin(Math.max(-1, Math.min(1, aim.dir.y))) * 180 / Math.PI;
      const off = predicted ? Math.hypot(predicted.x - zone.x, predicted.z - zone.z) : null;
      const reload = Math.max(0, LAUNCHER.reloadS - (performance.now() - s.lastShot) / 1000);
      const info = `Elevation ${elev.toFixed(1)}°${predicted ? ` · impact ${formatDistance(Math.hypot(predicted.x - ctx.x, predicted.z - ctx.z))}` : ''}${off != null ? (off <= zone.r ? ' · in the zone' : ` · ${Math.round(off)} m off the zone`) : ''}${s.shell ? ' · in flight' : reload > 0 ? ` · reloading ${reload.toFixed(1)} s` : ''} · ${s.ammo} ${s.ammo === 1 ? 'round' : 'rounds'}`;
      if (run.ui.aimInfo.textContent !== translateUI(info)) setLocalizedText(run.ui.aimInfo, info);
      run.ui.aimInfo.classList.toggle('is-on-target', off != null && off <= zone.r);
      if (reload <= 0) run.ui.fire?.classList.remove('is-reloading');
      // the shell in flight
      const sh = s.shell;
      if (sh) {
        const steps = 4, h = dt / steps;
        for (let k = 0; k < steps && s.shell; k++) {
          const nx = sh.x + sh.vx * h, ny = sh.y + sh.vy * h - 4.905 * h * h, nz = sh.z + sh.vz * h;
          sh.vy -= 9.81 * h;
          sh.t += h;
          if (k % 2 === 0) run.particles.trail(nx, ny, nz);
          const ground = groundHeight(nx, nz);
          if (ny <= ground || sh.t > 40) {
            FEATURES.shooter.impact(run, nx, ground, nz, ctx);
            s.shell = null;
            run.shellMesh.visible = false;
          } else { sh.x = nx; sh.y = ny; sh.z = nz; }
        }
        if (s.shell) run.shellMesh.position.set(sh.x, sh.y, sh.z);
      }
      run.particles.update(dt, ctx.camera);
    },
    impact(run, x, y, z, ctx) {
      const s = run.shooter;
      run.particles.impact(x, y, z);
      run.audio.boom(Math.hypot(x - ctx.x, y - ctx.y, z - ctx.z), 1);
      const zone = run.def.zones[s.hits];
      if (zone && inZone(zone, x, z)) {
        s.hits++;
        run.particles.avalanche(x, z, { count: 160, seconds: 2.4, spread: zone.r + 6 });
        setTimeout(() => { if (!run.disposed) run.audio.boom(Math.hypot(x - ctx.x, z - ctx.z), 0.5); }, 1200); // the slope's rumble
      } else s.misses++;
    }
  },

  // The player's car wears the Kantonspolizei estate (toeff-unfall-polizei): the VW T3 hidden, the patrol car on the
  // same physics; K toggles the blue light and the siren
  policeCar: {
    setup(run) {
      run.police = run.storage(createPoliceCar());
      run.police.userData.lightbar.visible = false;
      run.group.add(run.police);
      run.blueLight = false;
      run.hooks.controllerManager.entities.car.mesh.visible = false;
    },
    reset(run) { run.blueLight = false; run.police.userData.lightbar.visible = false; run.audio.siren(false); },
    // the VW T3 back (the patrol car goes with the run's group)
    teardown(run) { run.audio.siren(false); run.hooks.controllerManager.entities.car.mesh.visible = true; },
    key(run, e) {
      if (e.code === 'KeyK' && !e.repeat && run.phase !== 'intro') {
        run.blueLight = !run.blueLight;
        run.police.userData.lightbar.visible = run.blueLight;
        run.audio.siren(run.blueLight);
      }
    },
    update(run, ctx, dt, cm) {
      const car = cm.entities.car;
      run.police.position.copy(car.position);
      if (car.chassisPivot) run.police.position.y += car.chassisPivot.position.y;
      run.police.rotation.set(car.chassisPivot?.rotation.x || 0, car.heading, car.chassisPivot?.rotation.z || 0, 'YXZ');
      const spin = (car.speed || 0) * dt / 0.35;
      for (const w of run.police.userData.wheels) w.rotation.x += spin;
      if (ctx.mode !== 'car') run.audio.siren(false);
      else if (run.blueLight) run.audio.siren(true);
    }
  },

  // A Rega H145 flown by script (toeff-unfall-polizei): once the cones stand it comes up the valley, lands beside the
  // road, takes the patient and leaves
  regaScript: {
    setup(run) {
      run.regaMesh = createScriptedRega();
      run.group.add(run.regaMesh);
      run.rega = { phase: 'none', t: 0 };
    },
    reset(run) { run.rega.phase = 'none'; run.rega.t = 0; run.regaMesh.visible = false; },
    teardown(run) { run.regaMesh.visible = false; run.rega.phase = 'gone'; }, // (its meshes go with the run's group)
    update(run, ctx, dt) {
      const r = run.rega, m = run.regaMesh, lz = run.def.landing;
      const objective = run.def.objectives[run.index];
      if (r.phase === 'none' && objective?.id === 'rega') {
        r.phase = 'inbound';
        const dx = SPITAL_PAD.x - lz.x, dz = SPITAL_PAD.z - lz.z, L = Math.hypot(dx, dz);
        m.position.set(lz.x + (dx / L) * 1400, groundHeight(lz.x, lz.z) + 160, lz.z + (dz / L) * 1400);
        m.visible = true;
        r.speed = 0;
      }
      if (r.phase === 'none' || r.phase === 'gone') return;
      r.t += dt;
      const groundY = groundHeight(lz.x, lz.z);
      m.userData.rotor.rotation.y += dt * 28;
      m.userData.tail.rotation.x += dt * 60;
      if (r.phase === 'inbound') {
        const dx = lz.x - m.position.x, dz = lz.z - m.position.z, d = Math.hypot(dx, dz);
        const targetY = groundY + (d > 1.5 ? Math.min(60, 1.2 + d * 0.3) : 1.2);
        const v = Math.min(40, 4 + d * 0.12);
        if (d > 1.5) { m.position.x += (dx / d) * v * dt; m.position.z += (dz / d) * v * dt; m.rotation.y = Math.atan2(dx, dz); }
        m.position.y += (targetY - m.position.y) * Math.min(1, dt * 1.2);
        m.rotation.x = Math.min(0.2, v / 200);
        if (d <= 1.5 && m.position.y - groundY < 1.5) { m.position.y = groundY + 1.2; r.phase = 'landed'; r.t = 0; m.rotation.x = 0; }
      } else if (r.phase === 'landed') {
        if (r.t > 12) { r.phase = 'departing'; r.t = 0; run.onObjectiveDone('rega'); }
      } else if (r.phase === 'departing') {
        const dx = SPITAL_PAD.x - lz.x, dz = SPITAL_PAD.z - lz.z, L = Math.hypot(dx, dz);
        const climb = Math.min(1, r.t / 4);
        m.position.y += (6 + 10 * climb) * dt;
        if (r.t > 2.5) { m.position.x += (dx / L) * 30 * climb * dt; m.position.z += (dz / L) * 30 * climb * dt; m.rotation.y = Math.atan2(dx, dz); m.rotation.x = 0.15 * climb; }
        if (r.t > 10) r.phase = 'gone';
      }
      m.updateMatrixWorld(true);
    }
  },

  // (the parked patrol car's traffic body is registered by buildProps: nothing per frame)
  trafficBlock: { setup() {} }
};
// skis, board, mtb (js/missions-snow.js)
Object.assign(FEATURES, SNOW_FEATURES);
// skates, speedTrack, hockey, curling (js/missions-ice.js)
Object.assign(FEATURES, ICE_FEATURES);
// the BOX's headbang contest, La Onda's table football, the Carjöl lift, the RhB driver (js/missions-fun.js)
Object.assign(FEATURES, FUN_FEATURES);
// golf at the Golf Club Davos (js/missions-golf.js)
Object.assign(FEATURES, GOLF_FEATURES);
// the horn sledge (js/missions-sledge.js)
Object.assign(FEATURES, SLEDGE_FEATURES);
// the Silberberg mine (js/missions-mine.js)
Object.assign(FEATURES, MINE_FEATURES);
// the eight missions at real places: beer run, Gipfeli, raclette, ibex, squirrels, tennis, slide, Kirchner (js/missions-local.js)
Object.assign(FEATURES, LOCAL_FEATURES);
// the snow shovel, the work vehicles, the lawn, the refuse round, the Alpenrosen, the mushrooms (js/missions-work.js)
Object.assign(FEATURES, WORK_FEATURES);
// Davos Nordic's skis and race, minigolf, darts, the skate bowl (js/missions-sport.js)
Object.assign(FEATURES, SPORT_FEATURES);
// the T-bar at the Hauptertäli, the waxing bench at Hofmänner, the marshal on the Jakobshorn car park (js/missions-resort.js)
Object.assign(FEATURES, RESORT_FEATURES);
// (js/missions-gastro.js: Flämmli in the Rot Liechtli, Pizza Heaven)
Object.assign(FEATURES, GASTRO_FEATURES);
// (js/missions-wef.js: the motorcade and the march of the WEF week)
Object.assign(FEATURES, WEF_FEATURES);
