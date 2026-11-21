import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { surfaceHeight } from './terrain.js';
import { t as tr, getLanguage } from './i18n.js';
import {
  QUIZ, GIGI, QUIZ_BOTS, quizHandoff, pickQuestions, seenQuestions, noteQuestions, tableSeats, createRound, roundPhase, lockGuess, cutWaiting,
  hasGuessed, guessOf, questionResult, tableStandings, gigiLine, parseGuess, formatNumber
} from './missions-data-quiz.js';

// js/missions-quiz.js
// The runtime of "Gigi's guessing round" (js/missions-data-quiz.js has the questions, the points, the regulars and the
// round's clock): js/missions.js merges QUIZ_FEATURES into its features.
//  - quiz: the umbrella bar beside Bolgen Plaza (the umbrella, the barrel table, the glasses), Gigi and the four
//    regulars standing round it, and the card over the view: Gigi's line, the question, the time left, the field for
//    the number, the seats with a tick for everyone who has guessed, and at the reveal the guesses on a line with the
//    answer, the points and the table's standing.
// The table is either this run's own (a lone player and the regulars: made when the player steps up) or a session with
// other players (js/quiz-session.js through quizHandoff: the round and its clock are the session's, the player sits
// from the start). Both are driven by Date.now() against the round's start: the card shows where the clock says the
// round stands, whatever the frame rate.
// The card's texts are translated here at each render (tr), numbers written as the language does: the observer of
// js/i18n.js leaves the card alone (.player-name on its root), the names in it stay as typed.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = () => document.body.classList.contains('touch-enabled') || matchMedia('(pointer: coarse)').matches;
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
const ME_COLOUR = '#f5c542';

const STYLE = `
.gq{position:fixed;left:50%;bottom:calc(var(--keybar-clear,54px) + 6px);transform:translateX(-50%);z-index:40;width:min(660px,calc(100vw - 16px));max-height:calc(100vh - 150px);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:16px;background:rgba(10,12,20,.86);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 10px 34px rgba(0,0,0,.45);font-family:Inter,system-ui,sans-serif;color:#fff;font-variant-numeric:tabular-nums}
.gq[hidden],.gq [hidden]{display:none!important}
.gq-gigi{display:flex;gap:10px;align-items:flex-start}
.gq-face{flex:none;width:38px;height:38px;border-radius:50%;background:#d9261c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:900 18px Inter,system-ui,sans-serif}
.gq-say{flex:1;min-width:0}
.gq-who{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#f5c542;font-weight:800}
.gq-who span{color:rgba(255,255,255,.55);font-weight:600;text-transform:none;letter-spacing:0}
.gq-line{margin:2px 0 0;font-size:14px;line-height:1.35;color:rgba(255,255,255,.92)}
.gq-kicker{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.gq-kicker b{color:#f5c542}
.gq-question{margin:2px 0 0;font-size:19px;line-height:1.3;font-weight:800}
.gq-timer{height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}
.gq-timer i{display:block;height:100%;background:#f5c542;transform-origin:left center}
.gq-timer.is-late i{background:#ff6b6b}
.gq-form{display:flex;gap:8px;align-items:center}
.gq-input{flex:1;min-width:0;padding:10px 12px;font:800 22px Inter,system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.28);border-radius:10px;outline:none;font-variant-numeric:tabular-nums}
.gq-input:focus{border-color:#f5c542}
.gq-unit{flex:none;max-width:38%;font-size:13px;color:rgba(255,255,255,.75)}
.gq-ok{flex:none;border:0;border-radius:10px;padding:12px 18px;font:800 16px Inter,system-ui,sans-serif;color:#14161f;background:#f5c542;touch-action:manipulation}
.gq-ok:disabled{opacity:.45}
.gq-mine{font-size:15px;font-weight:700}
.gq-mine b{font-size:20px;color:#f5c542}
.gq-mine span{color:rgba(255,255,255,.6);font-weight:600}
.gq-seats{display:flex;flex-wrap:wrap;gap:6px}
.gq-seat{display:flex;align-items:center;gap:6px;padding:4px 9px 4px 7px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);font-size:12.5px;max-width:100%}
.gq-seat i{flex:none;width:9px;height:9px;border-radius:50%;background:var(--c,#fff)}
.gq-seat em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14ch}
.gq-seat u{text-decoration:none;flex:none;width:15px;height:15px;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);font-size:10px;line-height:15px;text-align:center;color:transparent}
.gq-seat.is-in{background:rgba(126,231,135,.16);border-color:rgba(126,231,135,.55)}
.gq-seat.is-in u{background:#7ee787;border-color:#7ee787;color:#0c1a10;font-weight:900}
.gq-seat.is-me{border-color:#f5c542}
.gq-count{font-size:12px;color:rgba(255,255,255,.65)}
.gq-count.is-all{color:#7ee787;font-weight:700}
.gq-axis{position:relative;height:54px;margin:4px 10px 0}
.gq-axis::before{content:'';position:absolute;left:-10px;right:-10px;top:34px;height:2px;background:rgba(255,255,255,.3)}
.gq-dot{position:absolute;top:27px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--c,#fff);border:2px solid rgba(10,12,20,.9);box-sizing:border-box;transition:left .5s}
.gq-dot.is-me{width:18px;height:18px;margin-left:-9px;top:25px;border-color:#fff;z-index:2}
.gq-mark{position:absolute;top:0;bottom:6px;width:2px;margin-left:-1px;background:#f5c542;z-index:1}
.gq-mark b{position:absolute;left:50%;top:-2px;transform:translateX(-50%);white-space:nowrap;font-size:15px;color:#f5c542;background:rgba(10,12,20,.9);padding:0 6px;border-radius:6px}
.gq-mark.at-left b{left:0;transform:none}.gq-mark.at-right b{left:auto;right:0;transform:none}
.gq-ends{display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-top:-6px}
.gq-head{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.gq-rows{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;font-size:13.5px}
.gq-rows li{display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:7px;border-left:3px solid var(--c,#fff)}
.gq-rows li.is-me{background:rgba(245,197,66,.14);font-weight:800}
.gq-rows .n{min-width:1.5em;color:rgba(255,255,255,.55)}
.gq-rows .who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gq-rows .who small{color:rgba(255,255,255,.5);font-weight:500}
.gq-rows .g{color:rgba(255,255,255,.85)}
.gq-rows .p{min-width:5.2em;text-align:right;color:#f5c542;font-weight:800}
.gq-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#f5c542;margin-left:6px}
.gq-table{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.14)}
.gq-table .gq-rows li{border-left-color:var(--c,#fff)}
.gq-verdict{margin:0;font-size:14px;line-height:1.35}
.gq-verdict b{color:#f5c542}
body.gq-seated .gta-prompt,body.gq-seated .touch-use,body.gq-seated .mission-prompt{display:none!important}
body.gq-seated #touch-controls{display:none!important}
@media (max-width:820px),(pointer:coarse){.gq{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 58px);max-height:calc(100vh - 66px);padding:10px 12px;gap:8px}.gq-question{font-size:17px}.gq-line{font-size:13px}.gq-axis{height:48px}}
@media (max-height:500px){.gq{top:calc(env(safe-area-inset-top,0px) + 4px);max-height:calc(100vh - 8px);z-index:46;gap:6px}.gq-gigi{display:none}.gq-question{font-size:15px}.gq-input{font-size:18px;padding:7px 10px}}
`;

// --- The umbrella bar ---------------------------------------------------------------------------------------------------
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  const count = g.attributes.position.count, c = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const cyl = (rt, rb, h, y, col, seg = 14, x = 0, z = 0) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return paint(g, col); };

/** The umbrella over a barrel table with the glasses on it, at the table's place on the ground */
function buildBar(run) {
  const t = QUIZ.table;
  const group = new THREE.Group();
  group.name = 'GigiBar';
  group.position.set(t.x, surfaceHeight(t.x, t.z), t.z);
  const parts = [
    cyl(0.34, 0.3, 1.02, 0.51, 0x7a4a26, 12), cyl(0.36, 0.36, 0.05, 0.3, 0x2c2c30, 12), cyl(0.36, 0.36, 0.05, 0.75, 0x2c2c30, 12), // the barrel and its hoops
    cyl(0.62, 0.62, 0.06, 1.06, 0x9b6a3a, 20), // the table top
    cyl(0.04, 0.05, 3.1, 1.55, 0xd8d8dc, 8), // the umbrella's pole, through the table
    cyl(0.5, 0.7, 0.12, 0.06, 0x3a3a40, 12) // its foot
  ];
  // the umbrella: eight panels, yellow and white by turns
  for (let i = 0; i < 8; i++) {
    const g = new THREE.ConeGeometry(2.5, 0.85, 1, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4);
    g.translate(0, 3.0, 0);
    parts.push(paint(g, i % 2 ? 0xf7f4ea : 0xf5c542));
  }
  parts.push(cyl(0.06, 0.02, 0.2, 3.5, 0xd8d8dc, 6));
  // the glasses, one each
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    parts.push(cyl(0.035, 0.03, 0.11, 1.145, i % 3 ? 0x5a3a22 : 0xe9e2d0, 8, Math.sin(a) * 0.4, Math.cos(a) * 0.4));
  }
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
  mesh.castShadow = true; mesh.receiveShadow = false;
  group.add(mesh);
  run.group.add(group);
  return group;
}

/** Gigi and the regulars round the table (the side towards the start stays free for the player) */
function buildPeople(run) {
  const t = QUIZ.table;
  const ground = (_owner, x, z) => surfaceHeight(x, z);
  const spots = [
    { key: 'gigi', a: Math.PI, r: 1.25, look: { seed: 0.42, hair: 0.85, girth: 1.04 } },
    ...QUIZ_BOTS.map((b, i) => ({ key: b.id, a: Math.PI + [-0.95, 0.95, -1.9, 1.9][i], r: 1.3, look: { seed: (0.17 + i * 0.6180339) % 1, female: b.id === 'bot-seraina', hair: [0.05, 0.3, 0.9, 0.2][i], girth: [1.1, 1.14, 0.98, 1.02][i] } }))
  ].map((s) => {
    const x = t.x + Math.sin(s.a) * s.r, z = t.z + Math.cos(s.a) * s.r;
    return { ...s, x, z, yaw: Math.atan2(t.x - x, t.z - z) };
  });
  // (ski jackets: the instructors' red, blue, yellow, green; dark ski trousers)
  const crowd = new PersonCrowd(spots.length, { farDistance: 1e9, castShadow: false, dress: { casual: true, coat: [0xd9261c, 0x1f6fd0, 0xf2b01e, 0x2aa775], coatF: [0xd9261c, 0x8c5a7a, 0x1f6fd0, 0xf2b01e], legs: [0x1c1e26, 0x23252e], legsF: [0x1c1e26, 0x23252e] } });
  for (const m of crowd.meshes) run.group.add(m);
  const people = spots.map((s) => {
    const rig = new PersonRig({ scale: 1, ...s.look });
    rig.reset(s.x, s.z, s.yaw, ground);
    return { ...s, rig };
  });
  return { crowd, people, ground };
}
function posePeople(p, dt) {
  p.crowd.begin();
  for (const q of p.people) { q.rig.update(dt, q.x, q.z, q.yaw, p.ground); p.crowd.add(q.rig, 0); }
  p.crowd.end();
}

// --- The walker waits at the table -----------------------------------------------------------------------------------
function holdWalker(run, on) {
  const cm = run.hooks.controllerManager;
  const g = run._gq;
  if (on) {
    if (g.held) return;
    g.held = { had: 'personDriver' in cm, prev: cm.personDriver };
    document.body.classList.add('gq-seated');
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
  } else if (g.held) {
    const h = g.held;
    g.held = null;
    document.body.classList.remove('gq-seated');
    if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver;
    run.hooks.cameraSystem?.resetForTeleport?.(); // (the view was the table's: back behind the player)
  }
}
/** The view while the player is at the table: from behind them onto Gigi and the regulars, held clear of the card (at the
 *  bottom of a desk's screen: the table in the upper half; at the top of a phone's: in the lower) */
function tableView(run) {
  const cam = run.hooks.cameraSystem?.camera;
  if (!cam) return;
  const t = QUIZ.table, y = surfaceHeight(t.x, t.z);
  const cardOnTop = matchMedia('(max-width:820px),(pointer:coarse)').matches;
  cam.position.set(t.x + 1.3, y + 2.6, t.z + 7);
  cam.up.set(0, 1, 0);
  cam.lookAt(t.x, y + (cardOnTop ? 3.0 : -0.5), t.z);
  cam.updateMatrixWorld();
}

/** A small sound on the city's mix (silent when the sound is off): a guess is in, the player's own is locked, the answer */
function blip(run, kind) {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(a.mix);
  const o = ctx.createOscillator();
  o.type = kind === 'answer' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(kind === 'answer' ? 660 : kind === 'lock' ? 880 : 520, t);
  if (kind === 'answer') o.frequency.setValueAtTime(990, t + 0.1);
  const level = kind === 'in' ? 0.12 : 0.3, len = kind === 'answer' ? 0.32 : 0.1;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(gain); o.start(t); o.stop(t + len + 0.03);
}

// --- A lone player's table ----------------------------------------------------------------------------------------------
function localTable() {
  const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const qids = pickQuestions(seed, seenQuestions());
  noteQuestions(qids);
  const me = { id: 'me', name: '' };
  const round = createRound({ seed, qids, startAt: Date.now(), seats: tableSeats([{ id: me.id, name: '', colour: ME_COLOUR }], { solo: true }), solo: true });
  return {
    me, round, solo: true,
    guess(qi, value) { const now = Date.now(); if (!lockGuess(round, me.id, qi, value, now)) return false; cutWaiting(round, now); return true; },
    sendGuesses() {}
  };
}

// --- The card -----------------------------------------------------------------------------------------------------------
function buildCard(run) {
  const style = el('style');
  style.textContent = STYLE;
  document.head.append(style);
  const card = el('div', 'gq player-name'); // (.player-name: translated here, not by the observer)
  card.hidden = true;
  card.setAttribute('role', 'group');
  const gigi = el('div', 'gq-gigi');
  const say = el('div', 'gq-say');
  const who = el('div', 'gq-who'), line = el('p', 'gq-line');
  say.append(who, line);
  gigi.append(el('div', 'gq-face', 'G'), say);
  const main = el('div');
  const kicker = el('div', 'gq-kicker'), question = el('p', 'gq-question');
  main.append(kicker, question);
  const timer = el('div', 'gq-timer'), bar = el('i');
  timer.append(bar);
  const form = el('form', 'gq-form');
  form.noValidate = true;
  const input = el('input', 'gq-input');
  Object.assign(input, { type: 'text', inputMode: 'numeric', autocomplete: 'off', spellcheck: false, maxLength: 16, enterKeyHint: 'done' });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  const unit = el('span', 'gq-unit'), ok = el('button', 'gq-ok', 'OK');
  ok.type = 'submit';
  form.append(input, unit, ok);
  const mine = el('div', 'gq-mine');
  const reveal = el('div');
  const seats = el('div', 'gq-seats'), count = el('div', 'gq-count');
  card.append(gigi, main, timer, form, mine, reveal, seats, count);
  document.body.append(card);
  run.cleanups.push(() => { card.remove(); style.remove(); });
  return { card, who, line, kicker, question, timer, bar, form, input, unit, ok, mine, reveal, seats, count, shown: {} };
}
/** innerHTML / textContent set only when it changes (the card is re-rendered every frame) */
function put(ui, key, node, html, asText = false) {
  if (ui.shown[key] === html) return;
  ui.shown[key] = html;
  if (asText) node.textContent = html; else node.innerHTML = html;
}

/** The guesses and the answer on a line: where a value sits, 0..1 (log scale when the guesses are far apart) */
function axis(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  if (!(hi > lo)) return { at: () => 0.5, lo, hi };
  const log = lo > 0 && hi / lo > 12;
  const f = log ? Math.log : (v) => v;
  const a = f(lo), b = f(hi);
  return { at: (v) => 0.04 + 0.92 * ((f(v) - a) / (b - a)), lo, hi };
}

function seatName(table, seat) {
  if (seat.id === table.me.id) return seat.name || tr('You');
  return seat.name;
}

function render(run, now) {
  const g = run._gq, ui = g.ui, table = g.table, round = table.round;
  const lang = getLanguage();
  const num = (v, q) => formatNumber(v, lang, { year: !!q?.year });
  const p = roundPhase(round, now);
  const qi = p.q, q = round.questions[qi];
  const n = round.questions.length;
  const mySeat = round.seats.find((s) => s.id === table.me.id) || null;
  const myGuess = mySeat ? round.guesses.get(mySeat.id)[qi] : null;
  const since = QUIZ.revealMs - p.left; // (ms into the reveal)
  const stage = p.phase !== 'reveal' ? '' : since < 1400 ? 'in' : since < 5600 ? 'answer' : 'table';

  // Gigi
  put(ui, 'who', ui.who, `${esc(GIGI.name)} <span>· ${esc(tr(GIGI.role))}</span>`);
  let line = '';
  if (p.phase === 'lead') line = gigiLine('welcome', round.seed);
  else if (p.phase === 'ask' || p.phase === 'guess') line = GIGI.ask[Math.min(qi, GIGI.ask.length - 1)];
  else if (stage === 'in') line = 'The guesses are in …';
  else {
    const rows = questionResult(round, qi);
    const mineRow = rows.find((r) => r.id === table.me.id);
    const kind = !mineRow ? 'arosa' : mineRow.guess === null ? 'none' : mineRow.place === 1 ? 'best' : mineRow.place === rows.length ? 'worst' : 'mid';
    line = stage === 'answer' ? gigiLine(kind, round.seed, qi) : gigiLine('arosa', round.seed, qi);
  }
  put(ui, 'line', ui.line, tr(line), true);

  // the question
  const asking = p.phase === 'ask' || p.phase === 'guess';
  if (p.phase === 'lead') {
    put(ui, 'kicker', ui.kicker, esc(tr('Gigi’s table')));
    put(ui, 'question', ui.question, tr('Three questions, one number each. Type your guess and press Enter.'), true);
  } else {
    const double = QUIZ.weights[qi] > 1 ? ` · <b>${esc(tr('counts double'))}</b>` : '';
    put(ui, 'kicker', ui.kicker, `${esc(fill(tr('Question {n} of {m}'), { n: qi + 1, m: n }))}${double}`);
    put(ui, 'question', ui.question, tr(q.text), true);
  }

  // the time left
  ui.timer.hidden = !asking;
  if (asking) {
    const k = p.phase === 'ask' ? 1 : Math.max(0, p.left / QUIZ.guessMs);
    ui.bar.style.transform = `scaleX(${k.toFixed(3)})`;
    ui.timer.classList.toggle('is-late', p.phase === 'guess' && p.left < 5000);
  }

  // the guess: the field, then what was locked in
  const canType = asking && !!mySeat && myGuess === null;
  ui.form.hidden = !canType;
  if (canType) {
    put(ui, 'unit', ui.unit, tr(q.unit || ''), true);
    if (ui.input.placeholder !== tr('Your guess')) ui.input.placeholder = tr('Your guess');
    const valid = parseGuess(ui.input.value) !== null;
    if (ui.ok.disabled === valid) ui.ok.disabled = !valid;
    if (g.focusFor !== `${round.seed}:${qi}`) { // (a new question: an empty field, the cursor in it on a desk)
      g.focusFor = `${round.seed}:${qi}`;
      ui.input.value = '';
      if (!isTouch()) { try { ui.input.focus({ preventScroll: true }); } catch { /* */ } }
    }
  } else if (document.activeElement === ui.input) ui.input.blur();
  const unitText = q?.unit ? ` ${esc(tr(q.unit))}` : '';
  let mine = '';
  if (p.phase !== 'lead' && mySeat) {
    if (myGuess !== null) mine = `${esc(tr('Your guess'))}: <b>${num(myGuess, q)}</b>${unitText}${asking ? ` <span>· ${esc(tr('locked in'))}</span>` : ''}`;
    else if (p.phase === 'reveal') mine = `<span>${esc(tr('No guess from you'))}</span>`;
  } else if (p.phase !== 'lead' && !mySeat) mine = `<span>${esc(tr('You are watching this round'))}</span>`;
  ui.mine.hidden = !mine;
  put(ui, 'mine', ui.mine, mine);

  // the seats: who has guessed
  const showSeats = p.phase !== 'reveal';
  ui.seats.hidden = !showSeats;
  ui.count.hidden = !asking;
  if (showSeats) {
    let inCount = 0;
    const chips = round.seats.map((seat) => {
      const isIn = asking && hasGuessed(round, seat, qi, p.t);
      if (isIn) inCount++;
      const me = seat.id === table.me.id;
      const title = asking ? tr(isIn ? 'has guessed' : 'still thinking') : '';
      return `<span class="gq-seat${isIn ? ' is-in' : ''}${me ? ' is-me' : ''}" style="--c:${esc(seat.colour)}" title="${esc(title)}"><i></i><em>${esc(seatName(table, seat))}</em>${asking ? `<u>${isIn ? '✓' : ''}</u>` : ''}</span>`;
    }).join('');
    put(ui, 'seats', ui.seats, chips);
    if (asking) {
      const all = inCount === round.seats.length;
      put(ui, 'count', ui.count, all ? tr('Everyone has guessed') : fill(tr('{n} of {m} have guessed'), { n: inCount, m: round.seats.length }), true);
      ui.count.classList.toggle('is-all', all);
      if (g.inCount !== `${qi}:${inCount}`) { if (g.inCount !== undefined && inCount > 0) blip(run, 'in'); g.inCount = `${qi}:${inCount}`; }
    }
  }

  // the reveal: the line, the answer, the points; then the table
  ui.reveal.hidden = p.phase !== 'reveal';
  if (p.phase === 'reveal') {
    const rows = questionResult(round, qi);
    const guesses = rows.filter((r) => r.guess !== null);
    const ax = axis([...guesses.map((r) => r.guess), ...(stage === 'in' ? [] : [q.answer])].concat(guesses.length ? [] : [q.answer]));
    const dots = guesses.map((r) => `<span class="gq-dot${r.id === table.me.id ? ' is-me' : ''}" style="left:${(ax.at(r.guess) * 100).toFixed(2)}%;--c:${esc(r.colour)}"></span>`).join('');
    let html = '';
    if (stage === 'in') html = `<div class="gq-axis">${dots}</div><div class="gq-ends"><span>${num(ax.lo, q)}</span><span>${num(ax.hi, q)}</span></div>`;
    else {
      const at = ax.at(q.answer);
      const mark = `<span class="gq-mark${at < 0.16 ? ' at-left' : at > 0.84 ? ' at-right' : ''}" style="left:${(at * 100).toFixed(2)}%"><b>${num(q.answer, q)}${unitText}</b></span>`;
      const list = stage === 'answer'
        ? rows.map((r) => `<li class="${r.id === table.me.id ? 'is-me' : ''}" style="--c:${esc(r.colour)}"><span class="n">${r.place}.</span><span class="who">${esc(seatName(table, r))}</span><span class="g">${r.guess === null ? esc(tr('no guess')) : num(r.guess, q)}</span><span class="p">+${num(r.points)}</span></li>`).join('')
        : tableStandings(round, qi + 1).map((r) => `<li class="${r.id === table.me.id ? 'is-me' : ''}" style="--c:${esc(r.colour)}"><span class="n">${r.place}.</span><span class="who">${esc(seatName(table, r))}${r.role ? ` <small>${esc(tr(r.role))}</small>` : ''}</span><span class="p">${num(r.points)} ${esc(tr('pts'))}</span></li>`).join('');
      const head = stage === 'answer' ? tr('The answer') : fill(tr('The table after question {n}'), { n: qi + 1 });
      html = `<div class="gq-axis">${dots}${mark}</div><div class="gq-ends"><span>${num(ax.lo, q)}</span><span>${num(ax.hi, q)}</span></div><div class="gq-head">${esc(head)}</div><ol class="gq-rows">${list}</ol>`;
    }
    put(ui, 'reveal', ui.reveal, html);
    if (g.stage !== `${qi}:${stage}`) { g.stage = `${qi}:${stage}`; if (stage === 'answer') blip(run, 'answer'); }
  }
  return p;
}

/** The table's standing and Gigi's last word in the run's end dialog; at a table with other players its buttons too */
function decorateEnd(run) {
  const g = run._gq, table = g.table;
  const panel = run.ui.overlay?.querySelector('.mission-dialog');
  const row = panel?.querySelector('.mission-dialog-buttons');
  if (!panel || !row || !table) return;
  const rows = tableStandings(table.round);
  const mine = rows.find((r) => r.id === table.me.id);
  const last = rows[rows.length - 1];
  const box = el('div', 'gq-table');
  const verdict = el('p', 'gq-verdict');
  const kind = !mine ? 'placed' : mine.place === 1 ? 'won' : mine.id === last.id ? 'pays' : 'placed';
  verdict.append(el('b', null, `${GIGI.name}: `), el('span', null, gigiLine(kind, table.round.seed)));
  const list = el('ol', 'gq-rows');
  for (const r of rows) {
    const li = el('li', r.id === table.me.id ? 'is-me' : '');
    li.style.setProperty('--c', r.colour || '#fff');
    const who = el('span', 'who');
    if (r.id === table.me.id && !r.name) who.append(el('span', null, 'You'));
    else who.append(el('span', 'player-name', r.name));
    if (r.id === last.id) who.append(el('span', 'gq-tag', 'pays the round'));
    li.append(el('span', 'n', `${r.place}.`), who, el('span', 'p', `${r.points} pts`));
    list.append(li);
  }
  box.append(el('h3', 'mission-board-title', 'The table'), list, verdict);
  panel.insertBefore(box, row);
  if (table.solo) return;
  // (with other players: the host starts the next round for everyone, no restart of one's own)
  const note = el('p', 'mission-dialog-note');
  box.append(note);
  const renderButtons = () => {
    if (!row.isConnected) return;
    row.replaceChildren();
    const button = (label, onClick, secondary = false) => { const b = el('button', `mission-btn${secondary ? ' mission-btn-secondary' : ''}`, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
    if (table.isHost) row.append(button('Another round', () => table.start()));
    row.append(button('Leave the table', () => run.hooks.missions?.stop(), true));
    note.textContent = table.isHost ? '' : 'The host starts the next round.';
    note.hidden = table.isHost;
  };
  renderButtons();
  g.offMembers?.();
  g.offMembers = table.on((what) => { if (what === 'members') renderButtons(); });
}

const QUIZ_FEATURE = {
  setup(run) {
    const session = quizHandoff.table; // (a table with other players: js/quiz-session.js started this run)
    quizHandoff.table = null;
    const g = run._gq = { session, table: session, ui: buildCard(run), held: null, scored: null, decorated: false };
    try { g.bar = buildBar(run); g.people = buildPeople(run); } catch (error) { console.warn('[quiz] the umbrella bar could not be built', error); }
    const submit = (e) => {
      e?.preventDefault();
      const t = g.table;
      if (!t) return;
      const value = parseGuess(g.ui.input.value);
      if (value === null) { g.ui.input.focus(); return; }
      const p = roundPhase(t.round, Date.now());
      if (t.guess(p.q, value)) { g.ui.input.value = ''; g.ui.input.blur(); blip(run, 'lock'); }
    };
    run.listen(g.ui.form, 'submit', submit);
    // (the field takes numbers and their separators only; the game's keys never see what is typed in it)
    run.listen(g.ui.input, 'input', () => { const v = g.ui.input.value.replace(/[^\d\s'’.,]/g, ''); if (v !== g.ui.input.value) g.ui.input.value = v; });
    run.listen(g.ui.input, 'keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') g.ui.input.blur(); });
    run.listen(window, 'languagechange', () => { g.ui.shown = {}; });
    run.actions([[['0–9'], 'your guess'], [['Enter'], 'lock it in']].map(([kbd, label]) => ({ kind: 'hint', kbd, label, when: () => !!g.held })));
    run.cleanups.push(() => { holdWalker(run, false); g.offMembers?.(); });
  },
  reset(run) {
    const g = run._gq;
    holdWalker(run, false);
    g.table = g.session || null; // (a lone player's table is laid anew when they step up)
    g.decorated = false;
    g.sent = null;
    g.ui.shown = {};
    g.ui.card.hidden = true;
    if (g.session) {
      run.state.seated = true;
      // (a restart after the round was scored: nothing to win until the host starts the next)
      if (g.scored === g.session.round?.seed) run.state.game = { done: false, progress: 1, text: 'The host starts the next round.', score: 0, idle: true };
    }
  },
  teardown(run) {
    const g = run._gq;
    holdWalker(run, false);
    g.offMembers?.();
    g.session?.detach(run);
  },
  ownControls: (run) => !!run._gq?.held,
  key(run, e) {
    const g = run._gq;
    if (!g?.held) return;
    // (at the table: a digit goes into the field, the walker's keys do nothing)
    if (/^(Digit|Numpad)\d$/.test(e.code) && !g.ui.form.hidden) { g.ui.input.focus(); return; }
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
  },
  after(run, ctx, dt) {
    const g = run._gq;
    if (!g) return;
    if (g.people) { try { posePeople(g.people, dt); } catch (error) { console.warn('[quiz] people', error); g.people = null; } }
    const live = run.phase === 'ready' || run.phase === 'running';
    if (run.phase === 'done') {
      g.ui.card.hidden = true;
      holdWalker(run, false);
      if (!g.decorated) { g.decorated = true; try { decorateEnd(run); } catch (error) { console.warn('[quiz] end', error); } }
      return;
    }
    if (!live || run.state.game?.idle) { g.ui.card.hidden = true; return; }
    // the player steps up: a lone player's table is laid; with other players the round is running already
    if (!g.table) {
      if (run.index < 1) { g.ui.card.hidden = true; return; }
      g.table = localTable();
    }
    if (!g.held) {
      holdWalker(run, true);
      if (g.session) { // (everyone is set down at the start: over to the table's free side)
        const t = QUIZ.table;
        run.hooks.teleportXZ?.(t.x + 0.5, t.z + 1.9, Math.atan2(-0.5, -1.9));
        run.lastPos?.copy(run.hooks.controllerManager.getActiveEntity().position);
      }
    }
    const table = g.table, round = table.round, now = Date.now();
    tableView(run);
    g.ui.card.hidden = false;
    const p = render(run, now);
    // (the guessing time is up: this player's guesses once more, should a message have been lost)
    if (p.phase === 'reveal' && g.sent !== `${round.seed}:${p.q}`) { g.sent = `${round.seed}:${p.q}`; table.sendGuesses(); }
    const rows = tableStandings(round, p.phase === 'done' ? round.questions.length : p.phase === 'reveal' && QUIZ.revealMs - p.left >= 1400 ? p.q + 1 : p.q);
    const mine = rows.find((r) => r.id === table.me.id);
    const done = p.phase === 'done';
    const n = round.questions.length;
    run.state.game = {
      done, score: mine?.points ?? 0, place: mine?.place ?? rows.length, seats: rows.length, pays: !!mine && mine.id === rows[rows.length - 1].id,
      progress: done ? 1 : (p.q + (p.phase === 'reveal' ? 1 : p.phase === 'guess' ? 0.5 : 0)) / n,
      text: p.phase === 'lead' ? 'Gigi takes a sip' : `Question ${Math.min(p.q + 1, n)} of ${n}`,
      hint: (p.phase === 'ask' || p.phase === 'guess') && mine && round.guesses.get(table.me.id)[p.q] === null ? 'Type a number and press Enter' : null
    };
    if (done) g.scored = round.seed;
  }
};

export const QUIZ_FEATURES = { quiz: QUIZ_FEATURE };
