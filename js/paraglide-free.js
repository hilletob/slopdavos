// js/paraglide-free.js
// The free flight: with the paragliding licence (the exam is the mission paraglider-rinerhorn, js/missions-data-paraglide.js;
// the licence is kept with the progress, js/missions-progress.js) the player on foot in the open world takes the wing off
// the back (P; on a touch screen the "Fly" button, shown where a launch works) on any slope that falls away, pulls it up
// (W or Space, as in the mission), runs and flies: the mission's flight on a run of its own (js/missions-paraglide.js,
// `run.free`): the wing, the pilot in the harness, the vario, the wind, the thermals of the whole valley at the time of day
// (none at night). No points. After the landing the wing is folded and the pilot walks on; P on the ground packs it up again.
// A mission starting (js/missions-manager.js beforeStart), a teleport or another mode packs it up at once.
import { groundHeight } from './terrain.js';
import { gameClock } from './game-clock.js';
import { OWN_CONTROLS_CLASS } from './missions-manager.js';
import { PARAGLIDE_FEATURES } from './missions-paraglide.js';
import { LICENCE_ID, LAUNCH_RULE, FREE_THERMALS, freeThermals, launchSpot, createFlight, onGround, FREE_FLIGHT_BOARD, freeFlightEntry, freeFlightText } from './missions-data-paraglide.js';
import * as THREE from 'three/webgpu';

const feature = PARAGLIDE_FEATURES.paraglider;
const PACK_AFTER = 2.6; // s on the ground after the landing: the wing folded, walking on
const LAUNCH_MAX = 10; // s from pulling the wing up to the take-off at most: longer, and the slope ran out
const CHECK_EVERY = 0.4; // s between the looks at the licence and the slope (the hint, the touch button)
const JUMP = 30; // m the walker moved between two frames of the flight: a teleport, the wing packed up
const REFUSALS = {
  flat: 'Too flat to take off: find a slope that falls away',
  steep: 'Too steep to run here: find an open slope',
  ground: 'Stand on the open ground to lay out the wing',
  licence: 'No licence yet: land softly on the field at Glaris.'
};
const GLYPH = '⌒';

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const touch = () => document.body.classList.contains('touch-enabled');
const signedIn = () => { try { return !!globalThis.localStorage?.getItem('slopdavos-session'); } catch { return false; } };
const BEST_KEY = 'slopdavos-free-flight-best'; // (the longest free flight on this device, m: a guest's own best)
const localBest = () => { try { return +globalThis.localStorage?.getItem(BEST_KEY) || 0; } catch { return 0; } };
const keepBest = (m) => { try { globalThis.localStorage?.setItem(BEST_KEY, String(m)); } catch { /* */ } };

/** What the run built: the geometries, the materials and their textures, the instanced buffers */
function disposeTree(root) {
  const materials = new Set(), geometries = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) materials.add(m);
    if (o.isInstancedMesh) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
}

export function buildFreeFlight({ scene, controllerManager: cm, cameraSystem = null, touchControls = null, actions = null, missions = null, progress = null, audio = null, mapSystem = null }) {
  let run = null;
  let checkT = 0, licensed = false, spot = null, flashText = null, flashUntil = 0;
  const person = () => cm.entities.person;
  const busy = () => !!missions?.active || !!missions?.listOpen || !!mapSystem?.isFullMapOpen;
  const onFoot = () => cm.activeMode === 'person' && !cm.rhbPassenger;

  // --- Out and in again --------------------------------------------------------------------------------------------
  function why() {
    const p = person().position;
    if (p.y - groundHeight(p.x, p.z) > LAUNCH_RULE.agl) return { reason: 'ground' }; // (on a roof, a bridge, in the air)
    const s = launchSpot(groundHeight, p.x, p.z, person().heading);
    return s.ok ? { spot: s } : { reason: s.reason };
  }

  /** The wing laid out behind the pilot, facing down the slope: the flight 'ready', W or Space pulls it up */
  function unpack() {
    if (run || !onFoot() || busy()) return false;
    if (!progress?.hasLicence(LICENCE_ID)) { flash(REFUSALS.licence); return false; }
    const { spot: s, reason } = why();
    if (!s) { flash(REFUSALS[reason]); return false; }
    const p = person().position;
    const group = new THREE.Group();
    group.name = 'Free flight';
    scene.add(group);
    run = {
      free: true, phase: 'running', group, cleanups: [],
      hooks: { controllerManager: cm, cameraSystem, audio },
      state: { flight: createFlight({ x: p.x, z: p.z, heading: s.heading }) },
      thermalList: FREE_THERMALS, thermals: freeThermals(gameClock.minute, gameClock.isWinter), thermalsT: 2,
      launchT: 0, landedT: 0, jumped: false, lastX: p.x, lastZ: p.z, airborneAt: 0, ranked: null, judged: false
    };
    // (what the mission's run offers the feature, js/missions.js: the key bar's hints, the touch buttons relabelled;
    // without them setup() threw and P did nothing)
    const r0 = run;
    const airborne = () => r0.state.flight.phase === 'air' && !touch();
    run.hints = (list) => {
      const off = actions?.layer('free flight:air', list.map(([kbd, label]) => ({ kind: 'hint', kbd, label, when: airborne })), { replace: airborne, rank: 10 });
      if (off) r0.cleanups.push(off);
      return off || (() => {});
    };
    run.button = (id, label) => {
      if (!actions) return () => {};
      actions.relabel(id, label);
      const restore = () => actions.relabel(id);
      r0.cleanups.push(restore);
      return restore;
    };
    try {
      feature.setup(run);
      feature.reset(run);
    } catch (error) {
      console.warn('[free flight] could not lay out the wing', error);
      pack();
      return false;
    }
    // (the mission's driver, with an eye on teleports: the walker moved by someone else packs the wing up)
    const drive = cm.personDriver;
    const r = run;
    cm.personDriver = (dt, m) => {
      const q = person().position;
      if (Math.hypot(q.x - r.lastX, q.z - r.lastZ) > JUMP) { r.jumped = true; return; }
      drive(dt, m);
      r.lastX = q.x; r.lastZ = q.z;
    };
    cm.paragliding = true; // (js/gta.js: no getting into vehicles meanwhile)
    render();
    return true;
  }

  /** The wing packed up (or folded after the landing): walking again where the pilot stands */
  function pack(note = null) {
    const r = run;
    if (!r) return;
    run = null;
    try { feature.teardown(r); } catch (error) { console.warn('[free flight] teardown', error); }
    for (const fn of r.cleanups.splice(0).reverse()) {
      try { fn(); } catch (error) { console.warn('[free flight] cleanup', error); }
    }
    r.group.removeFromParent();
    disposeTree(r.group);
    cm.paragliding = false;
    ownControls(false);
    if (note) flash(note);
    checkT = 0;
    render();
  }

  function toggle() {
    if (!run) return unpack();
    const f = run.state.flight;
    if (f.phase === 'air') return false; // (land first)
    pack('Wing packed');
    return true;
  }

  // A mission takes the player: the wing goes first, before the mission's own setup sees the walker
  missions?.beforeStart?.add(() => pack());

  // --- The prompt, the hint, the touch button --------------------------------------------------------------------------
  const prompt = el('button', 'panel gta-prompt pg-free-prompt');
  prompt.type = 'button';
  prompt.hidden = true;
  const keyP = el('kbd', null, 'P');
  const body = el('span', 'gta-prompt-body');
  const text = el('span', 'gta-prompt-text');
  const sub = el('span', 'gta-prompt-sub');
  body.append(text, sub);
  prompt.append(keyP, body);
  prompt.addEventListener('click', () => toggle());
  document.body.append(prompt);
  const tapButton = touchControls?.addTapButton?.({ className: 'touch-pg', label: 'Fly', icon: GLYPH, onTap: () => toggle() }) || null;
  // P, in the key bar and on the gamepad (js/actions.js): on foot with the licence, and while the wing lies laid out
  // (the touch button above is the action's own face: "Fly" where a launch works)
  const laidOut = () => run?.state.flight.phase === 'ready';
  const hintWanted = () => laidOut() || (!run && licensed && onFoot() && !missions?.active);
  let hintShown = false;
  actions?.layer('free flight', [{ id: 'paraglide', keys: ['KeyP'], pad: 'left', touch: false, label: () => (laidOut() ? 'Pack up' : 'Paraglider'), when: hintWanted, run: () => (busy() || !onFoot() ? false : toggle()) }]);

  function flash(message) { flashText = message; flashUntil = performance.now() + 2200; render(); }

  function ownControls(on) { document.body.classList.toggle(OWN_CONTROLS_CLASS, on); }

  function render() {
    const f = run?.state.flight;
    const flashing = !!flashText && performance.now() < flashUntil;
    const laidOut = f?.phase === 'ready';
    prompt.hidden = touch() || !(flashing || laidOut);
    // (over the flight's panel at the bottom while it shows: in the air and folding after the landing)
    prompt.classList.toggle('is-over-flight', !!f && !laidOut);
    if (!prompt.hidden) {
      text.textContent = flashing ? flashText : 'W or Space: pull up the wing and run';
      sub.textContent = flashing ? '' : 'P: pack it up again';
      sub.hidden = flashing;
      keyP.hidden = flashing && !laidOut;
    }
    // the key bar's P (js/actions.js): told when it changes
    const wantHint = `${hintWanted()}:${laidOut}:${!!f && f.phase === 'air'}`; // (shown, "Paraglider" or "Pack up", the flight's keys)
    if (wantHint !== hintShown) { hintShown = wantHint; actions?.notify(); }
    // the touch button: "Fly" where a launch works, "Pack up" while the wing lies on the ground
    const label = laidOut ? 'Pack up' : !run && licensed && onFoot() && !busy() && spot ? 'Fly' : null;
    touchControls?.setTapButton?.(tapButton, label, GLYPH);
  }

  // --- Every frame (js/main.js, after the controllers have moved the walker) ---------------------------------------------
  function update(dt) {
    checkT -= dt;
    if (checkT <= 0) {
      checkT = CHECK_EVERY;
      licensed = !!progress?.hasLicence(LICENCE_ID);
      spot = licensed && !run && onFoot() && !busy() && touch() ? why().spot || null : null;
    }
    if (run) {
      if (!onFoot() || missions?.active || run.jumped) pack();
    }
    if (run) {
      const r = run, f = r.state.flight;
      r.thermalsT -= dt;
      if (r.thermalsT <= 0) { r.thermalsT = 2; r.thermals = freeThermals(gameClock.minute, gameClock.isWinter); }
      if (f.phase === 'inflate' || f.phase === 'run') {
        r.launchT += dt;
        if (r.launchT > LAUNCH_MAX) { pack('The slope ran out: the wing comes down'); render(); return; }
      }
      // the leaderboard: a ranked run from the take-off (signed in), the flight sent on a soft landing
      if (f.phase === 'air' && !r.airborneAt) {
        r.airborneAt = performance.now();
        r.ranked = signedIn() ? import('./leaderboard.js').then((l) => l.startRun(FREE_FLIGHT_BOARD, 'score')).catch(() => null) : null;
      }
      if (f.landing && !r.judged) { r.judged = true; judge(r, f); }
      if (onGround(f)) {
        r.landedT += dt;
        if (r.landedT > PACK_AFTER) { pack(); render(); return; }
      }
      const p = person().position;
      const ctx = { x: p.x, y: p.y, z: p.z };
      feature.update(r, ctx, dt);
      feature.after(r, ctx, dt);
      r.group.updateMatrixWorld(true);
      // the flight's own key hints while airborne (a touch screen keeps its stick: the steering)
      ownControls(f.phase === 'air' && !touch());
    }
    render();
  }

  /** The landing: the flight against the best on this device and, signed in, onto the leaderboard */
  function judge(r, f) {
    const entry = r.airborneAt ? freeFlightEntry(f, performance.now() - r.airborneAt) : null;
    if (!entry) return;
    const best = localBest();
    if (entry.score > best) keepBest(entry.score);
    const own = `${freeFlightText(entry.score)} from the launch${entry.score > best ? ' · personal best!' : ''}`;
    flash(own);
    r.ranked?.then((run) => (run ? import('./leaderboard.js').then((l) => l.submitScore(run, entry.score, entry.total)) : null))
      .then((res) => { if (res?.accepted) flash(`${own} · rank ${res.rank} of ${res.players}`); })
      .catch(() => {});
  }

  const api = {
    update, unpack, pack, toggle,
    /** The wing out (laid out, pulled up, flying or folding after the landing) */
    get active() { return !!run; },
    /** Under the wing: the run and the flight (js/play-stats.js counts it as the paraglider) */
    get gliding() { const ph = run?.state.flight.phase; return ph === 'inflate' || ph === 'run' || ph === 'air'; },
    get flight() { return run?.state.flight || null; },
    get licensed() { return !!progress?.hasLicence(LICENCE_ID); }
  };
  globalThis.__slopdavosFreeFlight = api; // (test hooks)
  return api;
}
