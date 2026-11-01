import * as THREE from 'three/webgpu';
import { MISSIONS, getMission, SPITAL_PAD, LAUNCHER, formatTime, formatDistance, relativeBearing, bestTimeKey, readBestTimes, recordBestTime, simulateShot, inZone } from './missions-data.js';
import { createTargetMarker, createZoneRing, createAimMarker, createLauncher, createShell, createScriptedRega, createPoliceCar, PROP_BUILDERS, slopeQuaternion } from './missions-props.js';
import { ParticleBatch, MissionAudio } from './missions-fx.js';
import { surfaceHeight, groundHeight, groundNormal } from './terrain.js';
import { setWinter } from './season.js';
import { groomMap } from './groom-map.js';
import { HELIPAD } from './helipad.js';
import { TELEPORT_LOCATIONS, isTypingInField } from './city-config.js';
import { inWorld } from './quality.js';

// js/missions.js
// Missions: timed tasks in the city (js/missions-data.js has their definitions and the pure progress logic). Nothing
// of this shows in the normal game: a mission starts only from the URL, ?mission=<id> (?mission=list shows the list,
// &night=1 the night variant where there is one). The module builds its HUD panel (top centre, the city's glass
// panels), the target marker and the mission's props into the world, runs the stopwatch (it starts with the first
// input after "Start", stops at the finish; a split a step; the best time a mission in localStorage) and ends with the
// finish panel. A teleport or a change of mode during a mission aborts it (unless the step allows the mode); R restarts.
// js/main.js: buildMissions(scene, hooks) once the city stands, missions.update(dt, controllers, cameras) every frame.

const inactive = { active: false, update() {} };
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const ARROW = 'M12 2.5 19 20l-7-4-7 4z';

export function buildMissions(scene, hooks) {
  const params = new URLSearchParams(location.search);
  const id = params.get('mission');
  if (!id) return inactive;
  // (the pad the helipad module built: the Rega missions start and end on it)
  if (HELIPAD) Object.assign(SPITAL_PAD, { x: HELIPAD.x, z: HELIPAD.z, r: Math.max(5, (HELIPAD.radius || 7) - 0.5) });
  if (id === 'list') { showList(); return inactive; }
  const def = getMission(id);
  if (!def) { showList(`Unbekannte Mission „${id}“`); return inactive; }
  try {
    const run = new MissionRun(scene, def, hooks, { night: params.get('night') === '1' });
    globalThis.__slopdavosMission = run; // (test hooks: tools/probe scripts drive the mission through it)
    return run;
  } catch (error) {
    console.warn('[missions] could not start', id, error);
    return inactive;
  }
}

/** ?mission=list: the missions to click on */
function showList(note = null) {
  const overlay = el('div', 'mission-overlay');
  overlay.id = 'mission-overlay';
  const panel = el('div', 'panel mission-dialog');
  panel.append(el('div', 'mission-kicker', 'Missionen'), el('h2', 'mission-dialog-title', 'Wähle eine Mission'));
  if (note) panel.append(el('p', 'mission-dialog-note', note));
  const list = el('ul', 'mission-list');
  const best = readBestTimes(globalThis.localStorage);
  for (const m of MISSIONS) {
    const li = el('li');
    const a = el('a', 'mission-link', m.title);
    a.href = `?mission=${m.id}`;
    li.append(a);
    const b = best[bestTimeKey(m.id)];
    if (Number.isFinite(b)) li.append(el('span', 'mission-list-best', `Bestzeit ${formatTime(b)}`));
    if (m.nightTime) { const n = el('a', 'mission-link-night', 'Nacht'); n.href = `?mission=${m.id}&night=1`; li.append(n); }
    list.append(li);
  }
  panel.append(list);
  const back = el('a', 'mission-btn mission-btn-secondary', 'Zurück zum Spiel');
  back.href = location.pathname;
  panel.append(back);
  overlay.append(panel);
  document.body.append(overlay);
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
    this.audio = new MissionAudio(hooks.audio);
    this.buildHud();
    this.bindKeys();
    this.buildProps();
    for (const f of def.features || []) if (FEATURES[f]) { this.features[f] = FEATURES[f]; FEATURES[f].setup(this); }
    this.setup();
    this.showIntro();
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
    hooks.selectMode(def.mode);
    if (def.season === 'winter') setWinter(true, { animate: false });
    else if (def.season === 'summer') setWinter(false, { animate: false });
    hooks.selectTime(this.night ? def.nightTime : def.time || 'golden');
    const start = this.resolveStart();
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
    // (the mobile profile builds the town around the saved player: a start beyond it saves and reloads once)
    if (!inWorld(ent.position.x, ent.position.z, -250) && !sessionStorage.getItem('slopdavos-mission-reload')) {
      try { sessionStorage.setItem('slopdavos-mission-reload', '1'); } catch { /* storage may be off */ }
      hooks.savePlayerState?.();
      setTimeout(() => location.reload(), 50);
    }
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
          this.hooks.trafficBodies.push({ x: p.x, z: p.z, prevX: p.x, prevZ: p.z, y, sin: Math.sin(heading), cos: Math.cos(heading), halfW: 0.95, halfL: 2.35, mass: 1800, vx: 0, vz: 0, angularVel: 0, parked: 'police' });
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
    panel.append(head, this.ui.clock, step, this.ui.text, this.ui.bar, this.ui.nav, this.ui.hint, this.ui.splits);
    hud.append(panel);
    document.body.append(hud);
    this.renderBest();
    this.ui.overlay = el('div', 'mission-overlay');
    this.ui.overlay.id = 'mission-overlay';
    this.ui.overlay.hidden = true;
    document.body.append(this.ui.overlay);
  }

  renderBest() {
    const best = readBestTimes(globalThis.localStorage)[this.bestKey];
    this.ui.best.textContent = Number.isFinite(best) ? `Bestzeit ${formatTime(best)}` : 'Noch keine Bestzeit';
  }

  renderSplits() {
    this.ui.splits.replaceChildren(...this.splits.map((s) => {
      const li = el('li', 'mission-split');
      li.append(el('span', 'mission-split-title', s.title), el('span', 'mission-split-time', formatTime(s.t)));
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
    const best = readBestTimes(globalThis.localStorage)[this.bestKey];
    const nodes = [el('p', 'mission-dialog-text', this.def.intro)];
    const meta = el('p', 'mission-dialog-meta');
    meta.append(el('span', null, `${this.def.objectives.length} Schritte`), el('span', null, this.night ? 'Nacht' : 'Tag'),
      el('span', 'mission-dialog-best', Number.isFinite(best) ? `Bestzeit ${formatTime(best)}` : 'Noch keine Bestzeit'));
    nodes.push(meta, el('p', 'mission-dialog-note', 'Die Stoppuhr läuft mit der ersten Eingabe nach dem Start.'));
    this.dialog('Mission', this.def.title, nodes, [['Start', 'Enter', () => this.start()], ['Alle Missionen', null, () => { location.search = '?mission=list'; }, true]]);
  }

  showEnd() {
    const r = this.result;
    const nodes = [];
    const time = el('div', 'mission-final-time', formatTime(r.total));
    if (r.improved) time.classList.add('is-best');
    nodes.push(time);
    const line = el('p', 'mission-dialog-meta');
    if (r.improved) line.append(el('span', 'mission-new-best', r.previous === null ? 'Erste Bestzeit' : `Neue Bestzeit (vorher ${formatTime(r.previous)})`));
    else line.append(el('span', null, `Bestzeit ${formatTime(r.best)}`));
    if (this.def.bonusMs && r.total < this.def.bonusMs) line.append(el('span', 'mission-bonus', `Bonus: unter ${formatTime(this.def.bonusMs).replace(/\.\d$/, '')}`));
    nodes.push(line);
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
    this.dialog('Mission erfüllt', this.def.title, nodes, [['Neustart', 'R', () => this.restart()], ['Alle Missionen', null, () => { location.search = '?mission=list'; }, true]]);
  }

  showStopped(kicker, reason) {
    this.dialog(kicker, this.def.title, [el('p', 'mission-dialog-text', reason), el('p', 'mission-dialog-meta', `Zeit ${formatTime(this.elapsed)}`)],
      [['Neustart', 'R', () => this.restart()], ['Alle Missionen', null, () => { location.search = '?mission=list'; }, true]]);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (isTypingInField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Enter' && this.phase === 'intro') { e.preventDefault(); this.start(); return; }
      if (e.code === 'KeyR' && !e.repeat && this.phase !== 'intro') { e.preventDefault(); this.restart(); return; }
      for (const f of Object.values(this.features)) f.key?.(this, e);
    }, { capture: true });
  }

  start() {
    this.setup();
    this.phase = 'ready';
    this.ui.overlay.hidden = true;
    this.ui.panel.dataset.phase = 'ready';
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
    const now = performance.now();
    const ent = cm.getActiveEntity();
    const ctx = this.frame(cm, cs, dt, now);
    if (this.phase === 'ready' && this.inputDetected(cm, cs, ent)) {
      this.phase = 'running';
      this.startedAt = now;
      this.ui.panel.dataset.phase = 'running';
    }
    if (this.phase === 'running') this.elapsed = now - this.startedAt;
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
        this.showStopped('Mission gescheitert', view.fail);
      } else if (view.done) {
        const t = this.phase === 'running' ? now - this.startedAt : 0;
        if (this.phase === 'ready') { this.phase = 'running'; this.startedAt = now; }
        this.splits.push({ title: objective.title, t });
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
      if (!allowed.includes(mode)) return this.abort(`Moduswechsel (${mode}): Die Mission wurde abgebrochen.`);
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
    if (jump > 60) return this.abort('Teleport: Die Mission wurde abgebrochen.');
    this.lastPos.copy(ent.position);
  }

  abort(reason) {
    this.phase = 'aborted';
    this.ui.panel.dataset.phase = 'aborted';
    this.showStopped('Mission abgebrochen', reason);
  }

  finish(now) {
    this.phase = 'done';
    this.ui.panel.dataset.phase = 'done';
    const total = now - this.startedAt;
    this.elapsed = total;
    const { best, previous, improved } = recordBestTime(globalThis.localStorage, this.bestKey, total);
    this.result = { total, best, previous, improved };
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
    u.stepTitle.textContent = this.phase === 'done' ? 'Mission erfüllt' : objective.title;
    if (view) {
      if (u.text.textContent !== view.text) u.text.textContent = view.text || '';
      u.bar.hidden = view.progress == null;
      if (view.progress != null) u.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, view.progress))})`;
      const hint = view.hint || (this.phase === 'ready' ? 'Bereit: Die Zeit läuft mit der ersten Eingabe' : '');
      if (u.hint.textContent !== hint) u.hint.textContent = hint;
      u.hint.hidden = !hint;
      this.placeTarget(view.target, ctx);
    } else if (this.phase === 'intro') {
      u.text.textContent = 'Start mit Enter oder dem Knopf';
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
      const fire = el('button', 'panel mission-fire', 'Feuer');
      fire.type = 'button';
      fire.addEventListener('pointerdown', (e) => { e.preventDefault(); FEATURES.shooter.fire(run); });
      run.ui.fire = fire;
      document.body.append(fire);
      // a click (not a drag) on the view fires too
      let down = null;
      const canvas = run.hooks.cameraSystem.camera && document.getElementById('canvas-container');
      canvas?.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch' && e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      canvas?.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (moved < 6 && performance.now() - down.t < 300) FEATURES.shooter.fire(run);
        down = null;
      });
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
      const info = `Elevation ${elev.toFixed(1)}°${predicted ? ` · Einschlag ${formatDistance(Math.hypot(predicted.x - ctx.x, predicted.z - ctx.z))}` : ''}${off != null ? (off <= zone.r ? ' · in der Zone' : ` · ${Math.round(off)} m neben Zone`) : ''}${s.shell ? ' · unterwegs' : reload > 0 ? ` · Nachladen ${reload.toFixed(1)} s` : ''} · ${s.ammo} Schuss`;
      if (run.ui.aimInfo.textContent !== info) run.ui.aimInfo.textContent = info;
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
        setTimeout(() => run.audio.boom(Math.hypot(x - ctx.x, z - ctx.z), 0.5), 1200); // the slope's rumble
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
