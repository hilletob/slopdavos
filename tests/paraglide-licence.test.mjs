import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PARAGLIDE_MISSION, PG, LAUNCH, FIELD, THERMALS, FREE_THERMALS, H0, LICENCE_ID, LAUNCH_RULE, licencePassed, thermalDay, freeThermals,
  launchSpot, createFlight, stepFlight, botInput, onGround
} from '../js/missions-data-paraglide.js';
import {
  emptyProgress, readProgress, saveProgress, recordCompletion, createProgressStore, hasLicence, grantLicence, cleanLicences, totalPoints, PROGRESS_KEY
} from '../js/missions-progress.js';
import { mergeProgress, cleanProgress, canonical } from '../js/account-merge.js';
import { travelKind } from '../js/play-stats.js';
import { MissionManager } from '../js/missions-manager.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

// The paragliding licence: the mission paraglider-rinerhorn is its exam, the progress keeps it (and the cloud save), and with
// it js/paraglide-free.js flies from any slope that falls away (the pure parts of it here, on the real terrain)

const memoryStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};
const flat = (y = 0) => () => y;

test('the exam: a soft landing on the field at Glaris passes; landing out, a crash or still flying do not', () => {
  const at = (o) => Object.assign(createFlight(), o);
  assert.equal(licencePassed(at({ phase: 'landed', landing: { crash: false, onField: true } })), true);
  assert.equal(licencePassed(at({ phase: 'landed', landing: { crash: false, onField: false } })), false);
  assert.equal(licencePassed(at({ phase: 'crashed', landing: { crash: true, onField: false } })), false);
  assert.equal(licencePassed(at({ phase: 'air' })), false);
  assert.equal(licencePassed(null), false);
  const lic = PARAGLIDE_MISSION.licence;
  assert.equal(lic.id, LICENCE_ID);
  assert.equal(lic.passed({ flight: at({ phase: 'landed', landing: { crash: false, onField: true } }) }), true);
  for (const k of ['name', 'badge', 'exam', 'earned', 'held', 'failed', 'use', 'useTouch']) assert.equal(typeof lic[k], 'string', k);
  assert.match(PARAGLIDE_MISSION.title, /licence/i);
  assert.match(PARAGLIDE_MISSION.intro, /licence exam: land softly on the field at Glaris/);
  assert.match(PARAGLIDE_MISSION.intro, /any slope in the valley \(P/);
});

test('the bot\'s glide from the Rinerhorn to the field passes the exam on the real terrain', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const f = createFlight(), bot = {};
  for (let real = 0; !onGround(f) && real < 2400; real += 1 / 20) stepFlight(f, botInput(f, bot, [], { groundAt: groundHeight }), 1 / 20, groundHeight);
  assert.equal(PARAGLIDE_MISSION.licence.passed({ flight: f }), true);
});

test('the licence in the progress: granted once, kept through the records, read back, no points of its own', () => {
  const p0 = emptyProgress();
  assert.equal(hasLicence(p0, 'paraglider'), false);
  const { progress: p1, first } = grantLicence(p0, 'paraglider', 123);
  assert.ok(first);
  assert.equal(hasLicence(p1, 'paraglider'), true);
  assert.deepEqual(p0, emptyProgress(), 'the old one left as it was');
  assert.equal(grantLicence(p1, 'paraglider', 999).first, false);
  assert.equal(grantLicence(p1, 'paraglider', 999).progress.licences.paraglider, 123);
  const { progress: p2 } = recordCompletion(p1, PARAGLIDE_MISSION, 600000, 5, 1200);
  assert.equal(p2.licences.paraglider, 123, 'a record keeps the licences');
  assert.equal(totalPoints(p2), totalPoints(recordCompletion(p0, PARAGLIDE_MISSION, 600000, 5, 1200).progress));
  const s = memoryStorage();
  saveProgress(s, p2);
  assert.equal(readProgress(s).licences.paraglider, 123);
  // without a licence the shape stays as before
  assert.equal('licences' in recordCompletion(p0, PARAGLIDE_MISSION, 1, 1, 1).progress, false);
  assert.deepEqual(cleanLicences({ paraglider: 5, 'Bad Key': 1, ok: 'x', neg: -1 }), { paraglider: 5 });
  assert.equal(cleanLicences({}), null);
  assert.equal(cleanLicences([1]), null);
});

test('the store grants and saves the licence, tells its listeners, and sees one a cloud save wrote since', () => {
  const s = memoryStorage();
  const store = createProgressStore(s, [PARAGLIDE_MISSION]);
  let told = 0;
  store.subscribe(() => told++);
  assert.equal(store.hasLicence('paraglider'), false);
  assert.deepEqual(store.grantLicence('paraglider', 77), { first: true });
  assert.equal(told, 1);
  assert.equal(JSON.parse(s.getItem(PROGRESS_KEY)).licences.paraglider, 77);
  assert.deepEqual(store.grantLicence('paraglider', 88), { first: false });
  assert.equal(told, 1);
  store.record(PARAGLIDE_MISSION, 600000, 5, 1100);
  assert.equal(JSON.parse(s.getItem(PROGRESS_KEY)).licences.paraglider, 77, 'a record keeps it in storage');
  // another device's licence, merged into storage by the account (js/account-sync.js) after the store was made
  const t = memoryStorage();
  const late = createProgressStore(t, [PARAGLIDE_MISSION]);
  assert.equal(late.hasLicence('paraglider'), false);
  saveProgress(t, { v: 1, missions: { 'paraglider-rinerhorn': { medal: 'bronze', bestMs: 1, runs: 1, at: 1 } }, licences: { paraglider: 9 } });
  assert.equal(late.hasLicence('paraglider'), true);
  late.record(PARAGLIDE_MISSION, 600000, 5, 1100);
  assert.equal(JSON.parse(t.getItem(PROGRESS_KEY)).licences.paraglider, 9);
});

test('the cloud save: the licence survives cleaning and merging, from either side, since the earliest', () => {
  const m = (lic) => ({ v: 1, missions: { 'paraglider-rinerhorn': { medal: 'bronze', bestMs: 1, runs: 1, at: 1 } }, ...(lic ? { licences: lic } : {}) });
  assert.deepEqual(cleanProgress(m({ paraglider: 5, 'x y': 2 })).licences, { paraglider: 5 });
  assert.equal('licences' in cleanProgress(m(null)), false);
  assert.equal(mergeProgress(m({ paraglider: 5 }), m(null)).licences.paraglider, 5);
  assert.equal(mergeProgress(m(null), m({ paraglider: 7 })).licences.paraglider, 7);
  assert.equal(mergeProgress(m({ paraglider: 9 }), m({ paraglider: 7 })).licences.paraglider, 7);
  assert.equal('licences' in mergeProgress(m(null), m(null)), false);
  // the same content compares the same (no needless upload)
  assert.equal(canonical(mergeProgress(m({ paraglider: 5 }), null)), canonical(mergeProgress(null, m({ paraglider: 5 }))));
  // the game reads what the merge writes
  const s = memoryStorage();
  s.setItem(PROGRESS_KEY, JSON.stringify(mergeProgress(m({ paraglider: 5 }), null)));
  assert.equal(hasLicence(readProgress(s), 'paraglider'), true);
  // the server's points (save_points) count only the missions: nothing to change there
  const sql = readFileSync(new URL('../supabase/migrations/20261106190000_points_cap.sql', import.meta.url), 'utf8');
  assert.match(sql, /progress->'missions'/);
});

test('the free flight\'s thermals: the mission\'s and more over the valley, on sunny faces with room to climb', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  assert.deepEqual(FREE_THERMALS.slice(0, THERMALS.length), THERMALS);
  assert.ok(FREE_THERMALS.length >= THERMALS.length + 4);
  assert.equal(new Set(FREE_THERMALS.map((t) => t.id)).size, FREE_THERMALS.length);
  for (const th of FREE_THERMALS) {
    assert.ok(th.x > WORLD_BOUNDS[0] + 1500 && th.x < WORLD_BOUNDS[2] - 1500 && th.z > WORLD_BOUNDS[1] + 1500 && th.z < WORLD_BOUNDS[3] - 1500, th.id);
    assert.ok(PG.cloudBase - groundHeight(th.x, th.z) > 450, `${th.id}: room to climb`);
    assert.ok(th.w >= 2.5 && th.w <= 4 && th.r >= 40 && th.r <= 80, th.id);
    if (!THERMALS.includes(th)) for (const o of FREE_THERMALS) if (o !== th) assert.ok(Math.hypot(o.x - th.x, o.z - th.z) > 1500, `${th.id} / ${o.id}`);
  }
  // the time of day: none at night, the most in the afternoon, half of it in winter
  assert.equal(thermalDay(3 * 60), 0);
  assert.equal(thermalDay(21 * 60), 0);
  assert.ok(thermalDay(14 * 60) === 1 && thermalDay(11 * 60) > 0.3 && thermalDay(11 * 60) < 1);
  assert.equal(thermalDay(14 * 60, true), 0.5);
  assert.deepEqual(freeThermals(23 * 60), []);
  const day = freeThermals(14 * 60, true);
  assert.equal(day.length, FREE_THERMALS.length);
  assert.equal(day[0].w, FREE_THERMALS[0].w * 0.5);
  assert.notEqual(day[0], FREE_THERMALS[0], 'the list left as it was');
});

test('where the wing can be laid out: the Rinerhorn launch yes (down the slope, whichever way the pilot looks), the field at Glaris no', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const down = launchSpot(groundHeight, LAUNCH.x, LAUNCH.z, LAUNCH.heading);
  assert.ok(down.ok && down.reason === null && down.drop >= LAUNCH_RULE.drop30);
  assert.equal(down.heading, LAUNCH.heading, 'facing down the slope: kept');
  // facing up the slope: turned round to the way down nearest to it
  const up = launchSpot(groundHeight, LAUNCH.x, LAUNCH.z, LAUNCH.heading + Math.PI);
  assert.ok(up.ok);
  const s = Math.sin(up.heading), c = Math.cos(up.heading);
  assert.ok(groundHeight(LAUNCH.x, LAUNCH.z) - groundHeight(LAUNCH.x + s * 30, LAUNCH.z + c * 30) >= LAUNCH_RULE.drop30);
  const field = launchSpot(groundHeight, FIELD.x, FIELD.z, 0);
  assert.equal(field.ok, false);
  assert.equal(field.reason, 'flat');
  // a spire: too steep to run every way down (a steep face can still be run across it, slanting)
  const spire = launchSpot((x, z) => -2 * Math.hypot(x, z), 0, 0, 0);
  assert.equal(spire.ok, false); assert.equal(spire.reason, 'steep');
  const face = launchSpot((x, z) => -z * 2, 0, 0, 0);
  assert.ok(face.ok && Math.abs(face.heading) > 0.5, 'slanting across the face');
  // a gentle meadow: enough
  assert.equal(launchSpot((x, z) => -z * 0.3, 0, 0, Math.PI / 2).ok, true);
});

test('a free flight from a spot the check allows: the wing comes up, the run, airborne; on a flat spot no take-off', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  // above the Schatzalp, the free flight's own thermal there: the pilot faces down the slope found
  const x = -900, z = -1700;
  let spot = launchSpot(groundHeight, x, z, 0);
  let sx = x, sz = z;
  for (let k = 0; !spot.ok && k < 40; k++) { sz -= 25; spot = launchSpot(groundHeight, sx, sz, 0); }
  assert.ok(spot.ok, 'a launchable spot above the Schatzalp');
  const f = createFlight({ x: sx, z: sz, heading: spot.heading });
  let t = 0;
  for (; t < 10 && f.phase !== 'air'; t += 1 / 30) stepFlight(f, { go: true }, 1 / 30, groundHeight, freeThermals(14 * 60));
  assert.equal(f.phase, 'air', `airborne after ${t.toFixed(1)} s`);
  for (let i = 0; i < 30 * 15 && f.phase === 'air'; i++) stepFlight(f, {}, 1 / 30, groundHeight, freeThermals(14 * 60));
  assert.ok(f.phase === 'air' || f.phase === 'landed', f.phase);
  // the flat valley floor: running, never off (js/paraglide-free.js gives up after LAUNCH_MAX)
  const g = createFlight({ x: FIELD.x, z: FIELD.z, heading: 0 });
  for (let i = 0; i < 30 * 10; i++) stepFlight(g, { go: true }, 1 / 30, flat(0));
  assert.equal(g.phase, 'run');
});

test('play statistics: the free flight counts as the paraglider, a mission still as its own', () => {
  assert.equal(travelKind({ mode: 'person', gliding: true }), 'paraglider');
  assert.equal(travelKind({ mode: 'person', gliding: false }), 'walk');
  assert.equal(travelKind({ mode: 'car', gliding: true }), 'car');
  assert.equal(travelKind({ mode: 'person', gliding: true, mission: { id: 'skate-bowl' } }), 'skateboard');
});

test('a mission starting puts the wing away first (the manager\'s beforeStart)', () => {
  const order = [];
  const manager = new MissionManager({ getMission: (id) => (id === 'm' ? { id } : null), createRun: () => { order.push('run'); return { dispose() {} }; } });
  manager.beforeStart.add(() => order.push('pack'));
  manager.start('m');
  assert.deepEqual(order, ['pack', 'run']);
  manager.start('nope');
  assert.deepEqual(order, ['pack', 'run'], 'an unknown mission takes nobody');
});

test('the free flight is wired: P in the register, the touch button, the preload, the controllers guard in js/gta.js; it speaks German', async () => {
  const src = readFileSync(new URL('../js/paraglide-free.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'paraglide', keys: \['KeyP'\], pad: 'left'/, 'the key, the key bar and the gamepad come from js/actions.js');
  assert.doesNotMatch(src, /addEventListener\('keydown'/);
  assert.match(src, /addTapButton/);
  assert.match(readFileSync(new URL('../play.html', import.meta.url), 'utf8'), /modulepreload" href="\.\/js\/paraglide-free\.js"/);
  assert.match(readFileSync(new URL('../js/gta.js', import.meta.url), 'utf8'), /cm\.paragliding\) return null/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /buildFreeFlight\(/); assert.match(main, /freeFlight\.update\(dt\)/); assert.match(main, /gliding: freeFlight\.gliding/);
  // no other binding of P
  for (const f of ['main.js', 'controllers.js', 'gta.js', 'missions-world.js', 'missions.js']) assert.doesNotMatch(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), /'KeyP'/, f);
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.localStorage ??= { getItem() { return null; }, setItem() {} };
  globalThis.window ??= { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const lic = PARAGLIDE_MISSION.licence;
  assert.equal(t(lic.earned), 'Flugschein erhalten!');
  assert.equal(t(lic.name), 'Flugschein');
  for (const k of [lic.badge, lic.exam, lic.held, lic.failed, lic.use, lic.useTouch, 'Fly', 'Pack up', 'Paraglider', 'W or Space: pull up the wing and run', 'P: pack it up again',
    'Too flat to take off: find a slope that falls away', 'Too steep to run here: find an open slope', 'Stand on the open ground to lay out the wing',
    'The slope ran out: the wing comes down', 'Wing packed', 'Landed']) assert.notEqual(t(k), k, k);
  assert.match(t(PARAGLIDE_MISSION.intro), /Flugschein-Prüfung/);
  setLanguage('en');
});

test('the longest free flight: a soft landing after 10 s in the air counts, by the furthest distance; its list in the overview', async () => {
  const { freeFlightEntry, freeFlightText, FREE_FLIGHT_BOARD, FREE_FLIGHT_MAX_MS } = await import('../js/missions-data-paraglide.js');
  const landed = { phase: 'landed', landing: { crash: false }, maxDist: 3421.6 };
  assert.deepEqual(freeFlightEntry(landed, 95000), { score: 3422, total: 95000 });
  assert.equal(freeFlightEntry(landed, 9000), null, 'too short');
  assert.equal(freeFlightEntry({ ...landed, phase: 'crashed', landing: { crash: true } }, 95000), null, 'a crash does not count');
  assert.equal(freeFlightEntry({ ...landed, landing: null, phase: 'air' }, 95000), null, 'still flying');
  assert.equal(freeFlightEntry(landed, 5e6).total, FREE_FLIGHT_MAX_MS);
  assert.equal(freeFlightText(3422), '3.4 km');
  assert.equal(freeFlightText(640), '640 m');
  // (the server makes a list it does not know only for an id of this shape: 20261106120000_boards_on_demand.sql)
  assert.match(FREE_FLIGHT_BOARD, /^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{1,3}$/);
  const { overviewTabs } = await import('../js/leaderboard-overview.js');
  const tabs = overviewTabs();
  assert.equal(tabs.at(-1).id, FREE_FLIGHT_BOARD);
  assert.equal(tabs.filter((t) => t.id === FREE_FLIGHT_BOARD).length, 1);
  const free = readFileSync(new URL('../js/paraglide-free.js', import.meta.url), 'utf8');
  assert.match(free, /startRun\(FREE_FLIGHT_BOARD, 'score'\)/);
  assert.match(free, /submitScore\(run, entry\.score, entry\.total\)/);
  // the gamepad: d-pad left takes the wing out, like P (the action's slot, js/actions.js PAD_SLOTS)
  assert.match(free, /pad: 'left'/);
  const { PAD_SLOTS } = await import('../js/actions.js');
  assert.equal(PAD_SLOTS.left, 14);
  assert.match(readFileSync(new URL('../js/gamepad-controls.js', import.meta.url), 'utf8'), /PAD_SLOTS\[a\.pad\]/);
});
