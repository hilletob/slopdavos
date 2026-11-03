// tools/mission-smoke.mjs
// A playthrough audit of the missions in a real browser (Playwright, Chrome with WebGPU), one after the other in one page.
// For each mission: from the world (the player teleported onto its pin, on foot; U waits behind the fade when the pin is
// closed, Enter starts) or by link (--via link: ?mission=<id>, one page load each), then the intro, the first input, the
// clock's hold and the season; a generic frame-locked autopilot plays what it can for --play seconds (it follows the
// objective's target with the game's own key events); whatever is left is JUMPED (the objectives' check() answers "done",
// through the run's own finish path); then the end panel, the medal and the points, "Back to the game" and the teardown:
// HUD, DOM, listeners, renderer.info against the moment before the start, the clock going on from the mission's time.
//
//   python3 tools/serve.py 8804
//   node tools/mission-smoke.mjs --port 8804 [--ids a,b,c] [--via world|link] [--play 30] [--lang de] [--out dir] [--shots] [--rounds 2]
// (renderer.info also counts what the world streams in and what a season draws for the first time: --rounds 2 runs the list
// twice in the page, and the second round's counts are the leak test: what stays flat over the round. A difference of a few
// dozen after one mission is the world round that pin, and the DOM differs by the vehicle's HUD the player is left in)
//
// One JSON line a mission goes to <out>/results.jsonl as it comes (a crash loses nothing: the browser restarts), and a line
// to stdout. `endBy` says how the end was reached: "autopilot, no jump" is a finish without a jump.
// (Playwright isn't a dependency of the repo: from node_modules if it is there, or PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((a) => { const [k, ...v] = a.split(/\s+/); return [k, v.join(' ') || true]; }));
const PORT = args.port || 8804, VIA = args.via || 'world', PLAY = +(args.play ?? 30), LANG = args.lang || 'en', SHOTS = !!args.shots;
const OUT = args.out || join(tmpdir(), 'mission-smoke');
const MISSION_TIMEOUT = (PLAY + 150) * 1000;
const BASE = `http://127.0.0.1:${PORT}/`;
const QS = args.qs ? `${args.qs}&` : '';
mkdirSync(OUT, { recursive: true });
const RESULTS = join(OUT, 'results.jsonl');

// --- In the page -----------------------------------------------------------------------------------------------------
const INIT = (lang) => {
  try {
    localStorage.setItem('slopdavos-language', lang);
  } catch { /* */ }
  // The listeners on window and document, to see what a run leaves behind
  const live = (globalThis.__smokeListeners = new Map());
  for (const target of [window, document]) {
    const add = target.addEventListener, rem = target.removeEventListener, name = target === window ? 'w' : 'd';
    const keyOf = (type, o) => `${name}:${type}:${typeof o === 'boolean' ? o : !!o?.capture}`;
    const seen = new Map(); // (the browser ignores a second identical registration)
    target.addEventListener = function (type, fn, o) {
      if (fn) { const k = keyOf(type, o); const s = seen.get(k) || new Set(); if (!s.has(fn)) { s.add(fn); seen.set(k, s); live.set(k, (live.get(k) || 0) + 1); } }
      return add.call(this, type, fn, o);
    };
    target.removeEventListener = function (type, fn, o) {
      const k = keyOf(type, o); const s = seen.get(k);
      if (s?.delete(fn)) live.set(k, live.get(k) - 1);
      return rem.call(this, type, fn, o);
    };
  }
};

const HELPERS = () => {
  const S = (globalThis.__smoke = {});
  const dg = () => globalThis.__slopdavos;
  // (a lost GPU device: the page's loop goes on, but with nothing on the canvas and renderer.info frozen: such a row says nothing)
  dg().renderer.backend.device?.lost?.then((info) => { S.lost = `${info.reason || ''} ${info.message || ''}`.trim() || 'lost'; });
  S.frames = (n = 1) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  S.key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
  S.tap = (code) => { S.key(code, true); S.key(code, false); };
  S.windows = async () => (S.win ||= await import('/js/mission-windows.js'));
  S.pin = (id) => { const p = globalThis.__slopdavosMissionWorld.pins.find((q) => q.def.id === id); return p && { x: p.x, z: p.z, closed: !!p.closed, label: p.closedLabel || '' }; };
  S.census = () => {
    const d = dg();
    const mem = d.renderer.info.memory;
    const missionNodes = [...document.querySelectorAll('[id^="mission-"], [class*="mission-"]')]
      .filter((n) => n.checkVisibility?.() && !n.closest('.mission-prompt, #mission-way, .mission-score, .mission-points, .mission-way, .mission-hud-points, .mission-score-badge'))
      .map((n) => n.id || String(n.className));
    return {
      geometries: mem.geometries, textures: mem.textures, dom: document.body.querySelectorAll('*').length, sceneChildren: d.scene.children.length,
      groups: d.scene.children.filter((c) => c.name === 'Missions').length,
      listeners: Object.fromEntries(globalThis.__smokeListeners), missionNodes: missionNodes.slice(0, 12)
    };
  };
  // renderer.info moves with the world too (the streets streaming in round the player): wait until it stands still
  S.settled = async (ms = 10000) => {
    const t0 = performance.now();
    let last = -1, since = performance.now();
    while (performance.now() - t0 < ms && performance.now() - since < 1500) {
      await S.frames(3);
      const g = dg().renderer.info.memory.geometries + dg().renderer.info.memory.textures;
      if (g !== last) { last = g; since = performance.now(); }
    }
    return S.census();
  };
  S.clock = () => { const c = dg().clock; return { total: c.total, text: c.text, day: c.day, season: c.season, blend: c.winterBlend, held: c.held, frozen: c.frozen }; };
  S.run = () => {
    const M = globalThis.__slopdavosMission;
    if (!M) return null;
    const o = M.def.objectives[Math.min(M.index, M.def.objectives.length - 1)];
    return { phase: M.phase, index: M.index, n: M.def.objectives.length, title: M.ui.stepTitle?.textContent, text: M.ui.text?.textContent, hint: M.ui.hint?.hidden ? '' : M.ui.hint?.textContent, objective: o.id, failText: M.phase === 'failed' || M.phase === 'aborted' ? M.ui.overlay?.textContent?.slice(0, 200) : null };
  };
  S.look = async () => {
    const M = globalThis.__slopdavosMission, c = dg().clock, W = await S.windows();
    const sol = await import('/js/solar.js');
    const def = M.def;
    const test = M.night && def.nightTime ? W.missionWindow(def).nightTest : W.missionWindow(def).test;
    const m = c.minute, w = def.season === 'winter' ? 1 : def.season === 'summer' ? 0 : c.winterBlend;
    return {
      time: M.night ? def.nightTime : def.time, wantSeason: def.season || null, clock: c.text, day: c.day, calendar: c.season, blend: +c.winterBlend.toFixed(2),
      seasonOk: !def.season || def.season === c.season, blendOk: !def.season || c.winterBlend === (def.season === 'winter' ? 1 : 0),
      sun: +sol.sunHeight(m, w).toFixed(1), inWindow: test(sol.sunHeight(m, w), m, sol.solarNoon(w)), held: c.held
    };
  };
  // The autopilot: locked to the frames (it runs inside the run's own render), with the game's key events
  S.startDrive = () => {
    const M = globalThis.__slopdavosMission;
    const held = new Set();
    const set = (code, on) => { if (on && !held.has(code)) { S.key(code, true); held.add(code); } else if (!on && held.has(code)) { S.key(code, false); held.delete(code); } };
    const render = M.render;
    const drive = (S.drive = { stop() { M.render = render; for (const c of [...held]) set(c, false); drive.stopped = true; }, targetSeen: 0, frames: 0 });
    let nearFor = 0, tick = 0, lastD = Infinity, stuck = 0, reverseFor = 0;
    M.render = function (ctx, view) {
      drive.frames++;
      if (view && !drive.stopped && M.phase !== 'done') {
        const T = view.target;
        tick++;
        if (T && Number.isFinite(T.x)) {
          drive.targetSeen++;
          const dx = T.x - ctx.x, dz = T.z - ctx.z, d = Math.hypot(dx, dz);
          let rel = Math.atan2(dx, dz) - ctx.heading;
          while (rel > Math.PI) rel -= 2 * Math.PI;
          while (rel < -Math.PI) rel += 2 * Math.PI;
          if (Math.abs(lastD - d) < 0.02) stuck += ctx.dt; else stuck = Math.max(0, stuck - ctx.dt);
          lastD = d;
          const arrive = d < (T.r ? Math.max(1, T.r * 0.5) : 2);
          if (stuck > 2.5 && !arrive) { reverseFor = 1.2; stuck = 0; }
          if (reverseFor > 0) {
            reverseFor -= ctx.dt;
            set('KeyS', true); set('KeyW', false); set('KeyA', false); set('KeyD', true);
          } else {
            set('KeyS', false);
            set('KeyA', rel > 0.08); set('KeyD', rel < -0.08);
            set('KeyW', !arrive && Math.abs(rel) < 1.4);
          }
          nearFor = arrive ? nearFor + ctx.dt : 0;
        } else {
          // no target: the task is the feature's own; hold still and try the usual keys now and then
          set('KeyW', false); set('KeyA', false); set('KeyD', false); set('KeyS', false);
          nearFor += ctx.dt;
        }
        if (nearFor > 0.8 && tick % 24 === 0) S.tap('Space');
        if (nearFor > 0.8 && tick % 60 === 30) S.tap('KeyE');
      }
      return render.call(this, ctx, view);
    };
    return true;
  };
  // The jump: each objective left says "done" through the run's own frame, so that splits, finish and award go their way
  S.jump = () => {
    const M = globalThis.__slopdavosMission;
    S.drive?.stop();
    S.savedChecks = M.def.objectives.map((o) => [o, o.check]);
    M.def.objectives.forEach((o, i) => { if (i >= M.index) o.check = () => ({ done: true, progress: 1, text: '', target: null, hint: null }); });
  };
  S.unjump = () => { for (const [o, c] of S.savedChecks || []) o.check = c; S.savedChecks = null; };
  S.endPanel = () => {
    const o = document.getElementById('mission-overlay');
    if (!o || o.hidden) return null;
    const q = (s) => o.querySelector(s)?.textContent?.trim() ?? null;
    const M = globalThis.__slopdavosMission;
    return {
      kicker: q('.mission-kicker'), title: q('.mission-dialog-title'), final: q('.mission-final-time'), award: q('.mission-award'),
      splits: o.querySelectorAll('.mission-dialog-splits li').length, buttons: [...o.querySelectorAll('.mission-btn')].map((b) => b.textContent.trim()), text: o.textContent.replace(/\s+/g, ' ').trim(),
      result: M?.result ? { total: Math.round(M.result.total), score: M.result.score, medal: M.result.award?.medal ?? null, points: M.result.award?.points ?? null, firstClear: M.result.award?.firstClear } : null,
      splitTitles: [...o.querySelectorAll('.mission-dialog-splits li span:first-child')].map((n) => n.textContent)
    };
  };
};

// --- A mission -------------------------------------------------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 150 });

async function boot(page, url) {
  await page.goto(url);
  await until(page, () => window.__slopdavos?.ready && window.__slopdavosMissionWorld, null, 240000);
  await page.evaluate(HELPERS);
  await wait(3000);
}

async function playOne(page, id, errors, ctx) {
  const r = { id, via: VIA, start: false, problems: [] };
  const problem = (s) => r.problems.push(s);
  const first = errors.length;
  if (VIA === 'link') {
    await boot(page, `${BASE}?${QS}mission=${id}`);
    r.startPath = 'link';
  }
  const before = await page.evaluate(async (id) => {
    const d = globalThis.__slopdavos, S = globalThis.__smoke;
    if (globalThis.__slopdavosMission) return { census: S.census(), clock: S.clock(), pin: S.pin(id), points: globalThis.__slopdavosProgress.points };
    d.mode('person');
    const pin = S.pin(id);
    d.teleportXZ(pin.x, pin.z, 0);
    await S.frames(40);
    return { census: await S.settled(), clock: S.clock(), pin: S.pin(id), points: globalThis.__slopdavosProgress.points };
  }, id);
  r.pinClosed = before.pin?.closed || false;
  r.clockBefore = `${before.clock.text} d${before.clock.day}`;
  if (VIA === 'world') {
    if (before.pin.closed) {
      r.closedLabel = before.pin.label;
      await page.keyboard.press('KeyU');
      await until(page, (id) => !globalThis.__smoke.pin(id).closed && document.getElementById('clock-veil')?.hidden, id, 30000).catch(() => problem('U: the pin did not open'));
      r.afterU = (await page.evaluate(() => globalThis.__smoke.clock())).text;
      await page.evaluate(() => globalThis.__smoke.frames(5));
    }
    const prompt = await page.evaluate(() => { const p = document.querySelector('.mission-prompt'); return p && !p.hidden ? p.textContent : null; });
    if (!prompt) problem('no prompt on the pin');
    r.prompt = prompt;
    await page.keyboard.press('Enter');
    await until(page, () => globalThis.__slopdavosMission?.phase === 'intro', null, 15000).catch(async () => {
      problem('Enter on the pin did not start the mission');
      await page.evaluate((id) => globalThis.__slopdavosMissions.start(id), id);
    });
    r.startPath ||= before.pin.closed ? 'pin+U' : 'pin';
  }
  await until(page, () => globalThis.__slopdavosMission?.phase === 'intro', null, 20000);
  await page.keyboard.press('Enter');
  await until(page, () => ['ready', 'running', 'done'].includes(globalThis.__slopdavosMission?.phase), null, 40000);
  await wait(600);
  r.look = await page.evaluate(() => globalThis.__smoke.look());
  if (!r.look.seasonOk) problem(`season: wants ${r.look.wantSeason}, calendar ${r.look.calendar}`);
  if (!r.look.blendOk) problem(`snow look: wants ${r.look.wantSeason}, blend ${r.look.blend}`);
  if (!r.look.inWindow) problem(`time: ${r.look.clock} (sun ${r.look.sun}) outside its ${r.look.time} window`);
  if (SHOTS) await page.screenshot({ path: join(OUT, `${id}-start.png`) }).catch(() => {});
  // The first input: a real key
  await page.keyboard.down('KeyW');
  await wait(400);
  await page.keyboard.up('KeyW');
  await until(page, () => ['running', 'done', 'failed'].includes(globalThis.__slopdavosMission?.phase), null, 6000).catch(() => problem('W did not start the stopwatch'));
  if (PLAY > 0) await page.evaluate(() => { globalThis.__smoke.startDrive(); });
  const s0 = await page.evaluate(() => globalThis.__smoke.run());
  r.start = !!s0 && (s0.phase === 'running' || s0.phase === 'done');
  r.first = { objective: s0?.objective, title: s0?.title, text: s0?.text, hint: s0?.hint };
  // Play what the autopilot can
  const t0 = Date.now();
  let st = s0;
  while (Date.now() - t0 < PLAY * 1000 && st && st.phase === 'running') {
    await wait(500);
    st = await page.evaluate(() => globalThis.__smoke.run());
  }
  r.autoSeconds = Math.round((Date.now() - t0) / 1000);
  r.autoIndex = st?.index ?? null;
  if (st?.phase === 'failed' || st?.phase === 'aborted') r.autoFailed = `${st.phase}: ${st.failText}`;
  // The rest: a jump. A failed run is restarted first (R), as a player would
  if (st?.phase === 'running' || st?.phase === 'ready' || st?.phase === 'failed' || st?.phase === 'aborted') {
    r.endBy = `jump from ${st.index}/${st.n}`;
    if (st.phase === 'failed' || st.phase === 'aborted') {
      await page.keyboard.press('KeyR');
      await until(page, () => ['ready', 'running'].includes(globalThis.__slopdavosMission?.phase), null, 30000).catch(() => problem(`R after ${st.phase} did not restart`));
      r.endBy = `${st.phase} under the autopilot at ${st.index}/${st.n}, then R and jump from 0`;
    }
    await page.evaluate(() => globalThis.__smoke.jump());
    await until(page, () => globalThis.__slopdavosMission?.phase === 'done', null, 15000).catch(() => problem('the jump did not reach done'));
    await page.evaluate(() => globalThis.__smoke.unjump());
  } else if (st?.phase === 'done') {
    r.endBy = 'autopilot, no jump';
  } else problem(`unexpected phase ${st?.phase}`);
  await page.evaluate(() => { globalThis.__smoke.drive?.stop(); });
  await wait(400);
  // The end panel
  const end = await page.evaluate(() => globalThis.__smoke.endPanel());
  r.end = end ? { kicker: end.kicker, final: end.final, award: end.award, splits: end.splits, result: end.result } : null;
  const heldAt = await page.evaluate(() => globalThis.__smoke.clock());
  if (!end) problem('no end panel');
  else {
    if (end.splits < 1) problem('no splits on the end panel');
    if (!end.final) problem('no final time/score');
    if (!end.award) problem('no award line');
    const pts = await page.evaluate(() => globalThis.__slopdavosProgress.points);
    if (Number.isFinite(before.points) && end.result && pts - before.points !== end.result.points) problem(`points: panel +${end.result.points}, store ${pts - before.points}`);
    r.pointsAfter = pts;
    if (LANG === 'de') { r.deText = end.text; r.deSplits = end.splitTitles; r.deButtons = end.buttons; r.deHud = r.first; }
  }
  if (SHOTS) await page.screenshot({ path: join(OUT, `${id}-end.png`) }).catch(() => {});
  // The teardown: "Back to the game", the last button
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('#mission-overlay .mission-btn')].pop(); if (!b) return false; b.click(); return b.textContent.trim(); });
  if (!clicked) { problem('no button on the end panel'); await page.evaluate(() => globalThis.__slopdavosMissions.stop()); }
  r.backButton = clicked;
  await page.evaluate(() => globalThis.__smoke.frames(12));
  const after = await page.evaluate(() => ({ census: globalThis.__smoke.census(), clock: globalThis.__smoke.clock(), run: !!globalThis.__slopdavosMission, active: globalThis.__slopdavosMissions.active, search: location.search }));
  await wait(2000);
  const later = await page.evaluate(async () => { const clock = globalThis.__smoke.clock(); return { clock, census: await globalThis.__smoke.settled() }; });
  const b = before.census, a = later.census;
  r.teardown = {
    geometries: a.geometries - b.geometries, textures: a.textures - b.textures, dom: a.dom - b.dom, scene: a.sceneChildren - b.sceneChildren, groups: a.groups,
    missionNodes: a.missionNodes, heldAt: heldAt.text, clockAfter: later.clock.text, ticks: +(later.clock.total - after.clock.total).toFixed(2), held: later.clock.held, jump: +(after.clock.total - heldAt.total).toFixed(2), search: after.search
  };
  const listenerDiff = {};
  for (const k of new Set([...Object.keys(b.listeners), ...Object.keys(a.listeners)])) { const d = (a.listeners[k] || 0) - (b.listeners[k] || 0); if (d) listenerDiff[k] = d; }
  r.teardown.listeners = listenerDiff;
  if (after.run || after.active) problem('the run is still there');
  if (a.groups) problem('Missions group left in the scene');
  if (a.missionNodes.length) problem(`mission DOM left: ${a.missionNodes.join(', ')}`);
  if (Object.keys(listenerDiff).length) problem(`listeners left: ${JSON.stringify(listenerDiff)}`);
  if (a.geometries - b.geometries > 60) problem(`geometries +${a.geometries - b.geometries}`);
  if (a.textures - b.textures > 60) problem(`textures +${a.textures - b.textures}`);
  if (a.dom - b.dom > 10) problem(`DOM +${a.dom - b.dom}`);
  if (a.sceneChildren - b.sceneChildren) problem(`scene children ${a.sceneChildren - b.sceneChildren > 0 ? '+' : ''}${a.sceneChildren - b.sceneChildren}`);
  if (later.clock.held) problem('the clock is still held');
  if (!(later.clock.total > after.clock.total)) problem('the clock does not run after the mission');
  if (Math.abs(after.clock.total - heldAt.total) > 10) problem(`the clock jumped at the release: ${heldAt.text} -> ${after.clock.text}`);
  // Back in the world: which mode the player is left in, and whether the walker still walks (nothing of the mission holds him)
  r.walk = await page.evaluate(async () => {
    const d = globalThis.__slopdavos, S = globalThis.__smoke, cm = d.controllerManager;
    const modeAfter = cm.activeMode, driver = !!cm.personDriver, poser = !!cm.personPoser, yaw = d.cameraSystem.orbitYawOffset;
    const manual = !!d.rhb?.trains?.some((t) => t.manual);
    d.mode('person');
    await S.frames(5);
    const p = cm.entities.person, x = p.position.x, z = p.position.z;
    S.key('KeyW', true);
    await S.frames(40);
    S.key('KeyW', false);
    return { modeAfter, driver, poser, yaw, manual, moved: +Math.hypot(p.position.x - x, p.position.z - z).toFixed(1), speed: +p.speed.toFixed(2), visible: p.mesh?.visible ?? null };
  });
  if (r.walk.driver) problem('personDriver left behind');
  if (r.walk.poser) problem('personPoser left behind');
  if (r.walk.moved < 0.5) problem(`the walker does not walk after the mission (moved ${r.walk.moved} m)`);
  if (r.walk.visible === false) problem('the walker is hidden after the mission');
  r.errors = errors.slice(first);
  if (r.errors.length) problem(`${r.errors.length} page errors`);
  ctx.geoLog.push({ id, geometries: a.geometries, textures: a.textures, dom: a.dom });
  return r;
}

// --- The batch -------------------------------------------------------------------------------------------------------
async function launch(errors) {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--window-position=-2400,0', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errors.push(`PAGEERR ${e.message.slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error' || /\[missions\]|\[fast-forward\]/.test(m.text())) errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  await page.addInitScript(INIT, LANG);
  return { browser, page };
}

const data = await import(new URL('../js/missions-data.js', import.meta.url).href);
const all = data.MISSIONS.map((m) => m.id);
const ids = Array.from({ length: +(args.rounds || 1) }, () => (typeof args.ids === 'string' ? args.ids.split(',') : all)).flat();
const errors = [];
let { browser, page } = await launch(errors);
let dead = false;
page.on('crash', () => { dead = true; });
const ctx = { geoLog: [] };
if (VIA === 'world') await boot(page, `${BASE}?${QS}`);
const rows = [];
const queue = [...ids], retried = new Set();
while (queue.length) {
  const id = queue.shift();
  let row;
  try {
    row = await Promise.race([playOne(page, id, errors, ctx), wait(MISSION_TIMEOUT).then(() => { throw new Error('mission timeout'); })]);
  } catch (e) {
    const state = await page.evaluate(() => globalThis.__smoke?.run()).catch(() => null);
    row = { id, start: false, fatal: e.message.slice(0, 300), state, problems: [`FATAL ${e.message.slice(0, 160)}`], errors: errors.slice(-6) };
    await page.screenshot({ path: join(OUT, `${id}-fatal.png`) }).catch(() => {});
    // back to a clean state, or a new browser
    const clean = await page.evaluate(() => { try { globalThis.__smoke.unjump?.(); globalThis.__smoke.drive?.stop(); globalThis.__slopdavosMissions.stop(); return true; } catch { return false; } }).catch(() => false);
    if (!clean || dead) {
      await browser.close().catch(() => {});
      ({ browser, page } = await launch(errors));
      dead = false;
      page.on('crash', () => { dead = true; });
      if (VIA === 'world') await boot(page, `${BASE}?${QS}`);
    }
  }
  // The GPU device went: the row counts for the logic only. A fresh page, and the mission once more
  const lost = await page.evaluate(() => globalThis.__smoke?.lost || null).catch(() => 'page gone');
  if (lost) {
    row.deviceLost = lost;
    row.problems.push(`GPU device lost: ${lost.slice(0, 80)}`);
    appendFileSync(RESULTS, `${JSON.stringify(row)}\n`);
    console.log(`${id}: GPU device lost (${lost.slice(0, 80)}): reloading, once more`);
    if (!retried.has(id)) { retried.add(id); queue.unshift(id); }
    if (VIA === 'world') await boot(page, `${BASE}?${QS}`);
    continue;
  }
  rows.push(row);
  appendFileSync(RESULTS, `${JSON.stringify(row)}\n`);
  console.log(`${id.padEnd(28)} start:${row.start ? 'ok' : 'NO'} ${row.startPath || ''} end:${row.endBy || '-'} medal:${row.end?.result?.medal ?? '-'} +${row.end?.result?.points ?? '-'} clock:${row.look?.clock ?? ''} ${row.problems.length ? `PROBLEMS: ${row.problems.join(' | ')}` : ''}`);
}
console.log(`\n${rows.filter((r) => !r.problems.length).length}/${rows.length} without problems; memory along the batch: ${JSON.stringify(ctx.geoLog.filter((_, i) => i % 10 === 0 || i === ctx.geoLog.length - 1))}`);
await browser.close();
