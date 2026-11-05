import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { setWorldCenter } from './quality.js';
import { t } from './i18n.js';
import {
  EYE, createEyeTest, eyeCustomer, eyeShown, eyeKernel, eyeLine, EYE_LINES, eyeSetDial, eyeSetStep, eyeFlip, eyeTake, eyeKeep, eyeScold, eyePrescribe, eyeStep, fmtDioptre,
  SNOW, SLF, HARDNESS, GRAINS, DANGER, createSnowGame, snowTempAt, snowTest, snowWrite, snowGrain, snowTap, snowPick, snowDanger, snowClose, snowStep, seededRandom
} from './missions-data-expert.js';

// js/missions-expert.js
// The runtime of the two expert missions (js/missions-data-expert.js has their definitions and the games' pure logic):
// js/missions.js merges EXPERT_FEATURES into its features, a mission asks for one by def.features.
//  - eyeTest: the phoropter on a canvas over the view. The Landolt chart is drawn once and blurred by averaging shifted copies
//    of it over the lens error's ellipse (Safari's canvas has no ctx.filter), only when the lens changes.
//  - snowProfile: the Parsennbahn cut from the SLF to the Weissfluhjoch, the measuring field's few merged props, the pit and
//    the SLF-style profile sheet on a canvas.
// Everything is built on entry and goes with the run (the field in run.group, the DOM in run.cleanups, the off-screen canvases
// emptied at teardown); the games run on the mission's frame time. The canvases' texts call t(): the DOM observer can't see them.

const W = 560, H = 480;
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const live = (run) => run.phase === 'running' || run.phase === 'ready';
const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
const fmtClock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const FONT = 'Inter, system-ui, sans-serif';

const STYLE = `
.ex-game{position:fixed;inset:0;z-index:38;display:flex;align-items:flex-start;justify-content:center;padding-top:196px;box-sizing:border-box;background:rgba(14,14,18,.88);font-family:Inter,system-ui,sans-serif;color:#fff}
.ex-game[hidden],.ex-cut[hidden]{display:none!important}
.ex-box{display:flex;flex-direction:column;gap:6px;align-items:center;max-width:calc(100vw - 16px)}
.ex-game canvas{border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);touch-action:none;max-width:calc(100vw - 16px);background:#222;user-select:none;-webkit-user-select:none}
.ex-info{background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:5px 12px;font-size:13px;text-align:center;max-width:560px}
.ex-cut{position:fixed;inset:0;z-index:47;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center;background:#0a1020;color:#eaf2ff;font:700 22px Inter,system-ui,sans-serif;transition:opacity .45s;opacity:0;pointer-events:none}
.ex-cut.on{opacity:1}
body.ex-busy .controls-hint,body.ex-busy .gta-prompt,body.ex-busy .touch-use,body.ex-busy .mission-prompt,body.ex-busy #touch-controls{display:none!important}
@media (max-width:640px){.ex-game{padding-top:calc(env(safe-area-inset-top,0px) + 168px)}.ex-info{font-size:11px;padding:3px 8px}}
@media (max-height:500px){.ex-game{padding-top:2px;z-index:46}.ex-info{display:none}}
`;
function addStyle(run) {
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

/** The walker waits (the job has its own controls): frozen and out of sight */
function holdPlayer(run, on) {
  const cm = run.hooks.controllerManager;
  if (on) {
    if (run._exHeld) return;
    run._exHeld = { had: 'personDriver' in cm, prev: cm.personDriver };
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
    document.body.classList.add('ex-busy');
    cm.setEntityHidden?.('person', true);
  } else if (run._exHeld) {
    const h = run._exHeld;
    run._exHeld = null;
    document.body.classList.remove('ex-busy');
    cm.setEntityHidden?.('person', false);
    if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver;
    run.hooks.cameraSystem?.resetForTeleport?.();
  }
}

/** A small sound on the city's mix (silent when off) */
function blip(run, kind = 'pock') {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, now = ctx.currentTime, g = ctx.createGain();
  g.connect(a.mix);
  if (kind === 'thud' || kind === 'scrape') {
    const n = Math.floor(ctx.sampleRate * 0.2), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = kind === 'thud' ? 'lowpass' : 'highpass'; f.frequency.value = kind === 'thud' ? 420 : 2600;
    g.gain.value = kind === 'thud' ? 0.8 : 0.22;
    src.connect(f).connect(g); src.start(now);
    return;
  }
  const o = ctx.createOscillator(); o.type = kind === 'good' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(kind === 'good' ? 880 : kind === 'bad' ? 180 : 520, now);
  if (kind === 'good') o.frequency.setValueAtTime(1320, now + 0.08);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.3, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'good' ? 0.22 : 0.09));
  o.connect(g); o.start(now); o.stop(now + 0.25);
}

// --- The board: a canvas with buttons drawn on it -------------------------------------------------------------------
function createBoard(run, onPress) {
  const game = el('div', 'ex-game');
  game.hidden = true;
  const box = el('div', 'ex-box'), info = el('div', 'ex-info', ''), canvas = el('canvas');
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const iw = globalThis.innerWidth || W, ih = globalThis.innerHeight || H;
  const room = ih <= 500 ? ih - 6 : ih - (iw <= 640 ? 210 : 250); // (a phone on its side: the canvas takes the whole height)
  canvas.style.width = `${Math.max(240, Math.min(W, iw - 16, room * (W / H)))}px`;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  box.append(info, canvas);
  game.append(box);
  document.body.append(game);
  run.cleanups.push(() => game.remove());
  const b = { game, canvas, c, info, dpr, hits: [], down: null, keyHold: false, pop: null, open: false };
  run.listen(canvas, 'pointerdown', (e) => {
    e.preventDefault();
    if (run.phase !== 'running') return;
    const r = canvas.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const hit = b.hits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (!hit || hit.off) return;
    b.down = hit.id;
    canvas.setPointerCapture?.(e.pointerId);
    onPress(hit.id);
  });
  for (const ev of ['pointerup', 'pointercancel']) run.listen(canvas, ev, () => { b.down = null; });
  run.listen(window, 'keyup', (e) => { if (e.code === 'Space') b.keyHold = false; }, { capture: true });
  return b;
}
const setInfo = (b, text) => { if (b.info._raw !== text) { b.info._raw = text; b.info.textContent = text; } };
const popUp = (b, text, bad = false, time = 1.5) => { b.pop = { text, bad, t: time }; };
function showBoard(run, b, on) {
  b.open = on; b.game.hidden = !on; b.down = null; b.keyHold = false; b.pop = null; b.hits.length = 0;
  holdPlayer(run, on);
}
/** A button: remembered for the pointer, drawn at once. opts: { on, off, colour, fg, key, sub } */
function button(b, id, x, y, w, h, label, opts = {}) {
  const c = b.c;
  b.hits.push({ id, x, y, w, h, off: !!opts.off });
  const pressed = b.down === id;
  c.fillStyle = opts.off ? '#3a3f4a' : opts.colour || (opts.on ? '#1c76e0' : '#2c3442');
  c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill();
  if (pressed) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fill(); }
  if (opts.on) { c.strokeStyle = '#ffe14f'; c.lineWidth = 2.5; c.stroke(); }
  c.fillStyle = opts.off ? 'rgba(255,255,255,.4)' : opts.fg || '#fff';
  c.textAlign = 'center';
  const mid = y + h / 2, sub = opts.sub ?? null;
  c.font = `800 ${opts.size || 15}px ${FONT}`;
  c.fillText(label, x + w / 2, sub ? mid - 2 : mid + 5, w - 8);
  if (sub) { c.font = `600 11px ${FONT}`; c.globalAlpha = 0.72; c.fillText(sub, x + w / 2, mid + 14, w - 6); c.globalAlpha = 1; }
}
function wrap(c, text, x, y, width, lh) {
  let line = '', yy = y;
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > width) { c.fillText(line, x, yy); line = word; yy += lh; } else line = next;
  }
  if (line) c.fillText(line, x, yy);
  return yy;
}
function drawPop(c, b, y) {
  if (!b.pop) return;
  c.font = `900 22px ${FONT}`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.7)';
  const text = t(b.pop.text);
  c.strokeText(text, W / 2, y, W - 20);
  c.fillStyle = b.pop.bad ? '#ff8a7a' : '#ffe14f';
  c.fillText(text, W / 2, y, W - 20);
}

// =====================================================================================================================
// 1. The eye test
// =====================================================================================================================
const CHART = 250;
const RINGS = [[38, 2], [27, 3], [19, 4], [13, 6], [9, 8], [6.5, 10], [4.5, 12]]; // [size px, how many in the row]

/** The Landolt chart, sharp, on its own canvas */
function buildChart(dpr) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(CHART * dpr);
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  c.fillStyle = '#fff'; c.fillRect(0, 0, CHART, CHART);
  c.strokeStyle = '#000';
  let y = 12, n = 0;
  for (const [size, count] of RINGS) {
    const lw = size / 5, r = size / 2 - lw / 2, gap = Math.asin(clamp(lw / 2 / r, 0, 1));
    const pitch = Math.min((CHART - 16) / count, size * 1.7);
    const x0 = (CHART - pitch * (count - 1)) / 2;
    c.lineWidth = lw;
    for (let i = 0; i < count; i++) {
      const angle = (((n * 5 + i * 3) % 8) * Math.PI) / 4;
      n++;
      c.beginPath(); c.arc(x0 + i * pitch, y + size / 2, r, angle + gap, angle + Math.PI * 2 - gap); c.stroke();
    }
    y += size * 1.55 + 2;
  }
  return canvas;
}

/** The chart through a lens: copies of it averaged over the blur's ellipse (a golden-angle spiral fills it evenly) */
function blurChart(ey, kernel) {
  const key = `${kernel.rx.toFixed(2)}|${kernel.ry.toFixed(2)}|${kernel.rot.toFixed(2)}`;
  if (ey.blurKey === key) return;
  ey.blurKey = key;
  const c = ey.blurC, d = ey.dpr, cos = Math.cos(kernel.rot), sin = Math.sin(kernel.rot);
  c.globalAlpha = 1;
  c.fillStyle = '#fff'; c.fillRect(0, 0, ey.blur.width, ey.blur.height);
  const count = kernel.rx + kernel.ry < 0.15 ? 1 : 32;
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996, k = count === 1 ? 0 : Math.sqrt((i + 0.5) / count);
    const u = Math.cos(a) * k * kernel.rx, v = Math.sin(a) * k * kernel.ry;
    c.globalAlpha = 1 / (i + 1);
    c.drawImage(ey.sharp, (u * cos - v * sin) * d, (u * sin + v * cos) * d);
  }
  c.globalAlpha = 1;
}

function drawFace(c, x, y, r, hair, squint, time) {
  c.fillStyle = '#efc7a2'; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
  c.fillStyle = hair; c.beginPath(); c.arc(x, y - r * 0.15, r * 1.02, Math.PI, 0); c.fill();
  c.strokeStyle = '#20242c'; c.fillStyle = '#20242c'; c.lineWidth = 2.5;
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.4, ey = y + r * 0.02;
    if (squint) {
      // the eyes pressed to slits, the brows down, wobbling with the effort
      const wob = Math.sin(time * 7 + s) * 1.2;
      c.beginPath(); c.moveTo(ex - r * 0.22, ey + wob); c.lineTo(ex + r * 0.22, ey - wob); c.stroke();
      c.beginPath(); c.moveTo(ex - r * 0.26, ey - r * (s < 0 ? 0.3 : 0.14)); c.lineTo(ex + r * 0.26, ey - r * (s < 0 ? 0.14 : 0.3)); c.stroke();
    } else { c.beginPath(); c.arc(ex, ey, r * 0.1, 0, 6.3); c.fill(); }
  }
  c.beginPath();
  if (squint) { c.moveTo(x - r * 0.3, y + r * 0.5); c.quadraticCurveTo(x, y + r * 0.34, x + r * 0.3, y + r * 0.5); } else c.arc(x, y + r * 0.3, r * 0.28, 0.3, Math.PI - 0.3);
  c.stroke();
}

function drawEye(ey, g) {
  const b = ey.b, c = b.c, cu = eyeCustomer(g), P = g.pause > 0;
  b.hits.length = 0;
  c.fillStyle = '#20262f'; c.fillRect(0, 0, W, H);
  // the chart on the wall, as the customer sees it through the lens in front of the eye
  c.fillStyle = '#111'; c.beginPath(); c.roundRect(10, 10, CHART + 8, CHART + 8, 10); c.fill();
  if (cu) {
    const lens = eyeShown(g);
    blurChart(ey, P ? { rx: 0, ry: 0, rot: 0 } : eyeKernel(cu, lens, cu.squint));
    c.drawImage(ey.blur, 14, 14, CHART, CHART);
  }
  if (g.cmp) {
    c.fillStyle = 'rgba(28,118,224,.92)'; c.beginPath(); c.roundRect(20, 20, 92, 30, 8); c.fill();
    c.fillStyle = '#fff'; c.font = `900 16px ${FONT}`; c.textAlign = 'center';
    c.fillText(`${t('Lens')} ${g.cmp.shown}`, 66, 41);
  }
  // the head of the board: score and clock
  c.textAlign = 'right'; c.fillStyle = '#ffe14f'; c.font = `900 18px ${FONT}`;
  c.fillText(`${g.score} ${t('pts')}`, W - 14, 28);
  c.fillStyle = '#fff'; c.font = `700 13px ${FONT}`;
  c.fillText(`${fmtClock(EYE.length - g.t)}  ·  ${t('Customer')} ${Math.min(g.index + 1, g.customers.length)}/${g.customers.length}`, W - 14, 46);
  if (cu) {
    const fx = 310;
    drawFace(c, fx, 52, 30, cu.hair, cu.squint && !P, g.t);
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `800 15px ${FONT}`; c.fillText(cu.name, fx + 38, 66, 170);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `600 12px ${FONT}`; c.fillText(t(cu.job), fx + 38, 83, 170);
    if (!P) {
      // what the customer says
      const said = ey.said || (g.cmp?.answer ? eyeLine(cu, g.cmp.answer) : g.cmp ? (g.cmp.seen === 2 ? '…' : t('Flip to lens two')) : cu.steps === 0 ? cu.hello : t('Ask away.'));
      c.fillStyle = '#f4f1e6'; c.beginPath(); c.roundRect(278, 96, 268, 62, 10); c.fill();
      c.fillStyle = '#222'; c.font = `700 14px ${FONT}`; c.textAlign = 'left';
      wrap(c, t(said), 288, 118, 250, 18);
      // the phoropter's dials
      const row = (y, dial, name) => {
        const on = g.dial === dial, q = g.cmp?.dial === dial ? g.cmp : null;
        c.fillStyle = on ? 'rgba(255,225,79,.16)' : 'rgba(255,255,255,.06)'; c.beginPath(); c.roundRect(278, y, 268, 46, 8); c.fill();
        c.fillStyle = on ? '#ffe14f' : '#cfd6df'; c.font = `700 13px ${FONT}`; c.fillText(t(name), 288, y + 28);
        c.textAlign = 'right'; c.fillStyle = '#fff';
        if (q) {
          c.font = `800 14px ${FONT}`;
          c.fillText(`${q.shown === 1 ? '▶' : ''}1: ${fmtDioptre(q.one)}   ${q.shown === 2 ? '▶' : ''}2: ${fmtDioptre(q.two)}`, 538, y + 29);
        } else { c.font = `900 20px ${FONT}`; c.fillText(fmtDioptre(cu.lens[dial]), 538, y + 31); }
        c.textAlign = 'left';
      };
      row(164, 'sph', 'Sphere');
      row(214, 'cyl', 'Cylinder');
    }
  }
  if (P && g.last) {
    const L = g.last, Q = L.quality;
    c.fillStyle = '#f4f1e6'; c.beginPath(); c.roundRect(278, 96, 268, 172, 10); c.fill();
    c.fillStyle = '#222'; c.textAlign = 'left'; c.font = `800 14px ${FONT}`;
    wrap(c, t(L.reaction), 288, 118, 250, 18);
    c.font = `700 13px ${FONT}`;
    c.fillText(`${t('Written')}: ${fmtDioptre(L.lens.sph)} / ${fmtDioptre(L.lens.cyl)}`, 288, 162);
    c.fillText(`${t('Actual')}: ${fmtDioptre(L.S)} / ${fmtDioptre(L.C)}`, 288, 182);
    c.fillStyle = '#555'; c.font = `600 12px ${FONT}`;
    c.fillText(`${t('Accuracy')} ${Q.accuracy} · ${t('Questions')} ${Q.steps} · ${t('Speed')} ${Q.quick}${Q.caught ? ` · ${t('Squint')} ${Q.caught}` : ''}`, 288, 204, 250);
    c.fillStyle = Q.total >= 70 ? '#1a8f4a' : '#c0392b'; c.font = `900 28px ${FONT}`;
    c.fillText(`+${Q.total}`, 288, 246);
  }
  // the controls
  const off = P || g.done, x = (i) => 14 + i * 134, w = 126, h = 58, y0 = 278;
  button(b, 'sph', x(0), y0, w, h, t('Sphere'), { on: g.dial === 'sph', off, sub: 'Q' });
  button(b, 'cyl', x(1), y0, w, h, t('Cylinder'), { on: g.dial === 'cyl', off, sub: 'E' });
  button(b, 'big', x(2), y0, w, h, '±1.00', { on: g.step === 1, off, sub: 'X' });
  button(b, 'fine', x(3), y0, w, h, '±0.25', { on: g.step === 0.25, off, sub: 'X' });
  const y1 = y0 + h + 6, q = g.cmp;
  button(b, 'flip', x(0), y1, w, h, q ? t('Flip') : t('One or two?'), { off, colour: '#1c76e0', sub: 'Space' });
  button(b, 'one', x(1), y1, w, h, t('Take lens 1'), { off: off || !q, sub: '1' });
  button(b, 'two', x(2), y1, w, h, t('Take lens 2'), { off: off || !q, sub: '2' });
  button(b, 'keep', x(3), y1, w, h, t('Keep'), { off: off || !q, sub: 'K' });
  const y2 = y1 + h + 6;
  button(b, 'scold', x(0), y2, w + 134, h - 4, t('Eyes open, please!'), { off, colour: '#a8562a', sub: 'O' });
  button(b, 'rx', x(2), y2, w + 134, h - 4, t('Write the prescription'), { off, colour: '#1a8f4a', sub: 'Enter' });
  drawPop(c, b, 262);
}

const EYE_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: at the phoropter; the walk to the shop keeps them)
  ownControls: (run) => !!run.ey?.b.open,
  setup(run) {
    addStyle(run);
    const b = createBoard(run, (id) => EYE_FEATURE.act(run, id));
    run.ey = { b, sharp: null, blur: null, blurC: null, blurKey: '', dpr: b.dpr, said: null, saidT: 0 };
  },
  reset(run) {
    run.state.game = null;
    run.ey.said = null;
    showBoard(run, run.ey.b, false);
  },
  teardown(run) {
    showBoard(run, run.ey.b, false);
    // (Safari keeps a canvas's pixels until it is emptied)
    for (const k of ['sharp', 'blur']) if (run.ey[k]) { run.ey[k].width = run.ey[k].height = 0; run.ey[k] = null; }
  },
  open(run) {
    const ey = run.ey;
    if (!ey.sharp) {
      ey.sharp = buildChart(ey.dpr);
      ey.blur = document.createElement('canvas');
      ey.blur.width = ey.blur.height = ey.sharp.width;
      ey.blurC = ey.blur.getContext('2d');
    }
    ey.blurKey = '';
    run.state.game = createEyeTest((Date.now() & 0xffff) + 1);
    showBoard(run, ey.b, true);
    setInfo(ey.b, 'Flip, listen, take the better lens. The same at ±0.25: that dial is done.');
  },
  act(run, id) {
    const g = run.state.game;
    if (!g || run.phase !== 'running' || g.done) return;
    const ey = run.ey;
    let done = false;
    if (id === 'sph' || id === 'cyl') { eyeSetDial(g, id); done = true; }
    else if (id === 'big') { eyeSetStep(g, 1); done = true; }
    else if (id === 'fine') { eyeSetStep(g, 0.25); done = true; }
    else if (id === 'flip') done = eyeFlip(g);
    else if (id === 'one') done = eyeTake(g, 1);
    else if (id === 'two') done = eyeTake(g, 2);
    else if (id === 'keep') done = eyeKeep(g);
    else if (id === 'rx') done = eyePrescribe(g);
    else if (id === 'scold') {
      if (!eyeScold(g)) popUp(ey.b, 'These eyes are open.', true);
      done = true;
    }
    if (done) { ey.said = null; blip(run, 'pock'); }
  },
  key(run, e) {
    const ey = run.ey;
    if (!ey.b.open || run.phase === 'intro') return;
    const id = { KeyQ: 'sph', KeyE: 'cyl', Space: 'flip', Digit1: 'one', Digit2: 'two', KeyK: 'keep', KeyO: 'scold', Enter: 'rx' }[e.code];
    if (id) { swallow(e); if (!e.repeat) EYE_FEATURE.act(run, id); return; }
    if (e.code === 'KeyX') { swallow(e); if (!e.repeat) EYE_FEATURE.act(run, run.state.game?.step === 1 ? 'fine' : 'big'); }
  },
  update(run, ctx, dt) {
    const ey = run.ey;
    if (!ey.b.open && run.def.objectives[run.index]?.id === 'eyetest' && live(run)) EYE_FEATURE.open(run);
    const g = run.state.game;
    if (!ey.b.open || !g || run.phase !== 'running') return;
    eyeStep(g, Math.min(dt, 0.05));
    for (const e of g.events) {
      if (e.kind === 'answer') { ey.said = null; blip(run, e.answer === 'sharp' ? 'bad' : 'pock'); }
      else if (e.kind === 'caught') { ey.said = EYE_LINES.caught; ey.saidT = 2; popUp(ey.b, 'Caught him squinting!'); blip(run, 'good'); }
      else if (e.kind === 'relapse') { ey.said = null; popUp(ey.b, EYE_LINES.relapse, true); blip(run, 'bad'); }
      else if (e.kind === 'prescribed') blip(run, e.err < 0.01 ? 'good' : e.err > 0.5 ? 'bad' : 'pock');
    }
    g.events.length = 0;
    if (ey.said) { ey.saidT -= dt; if (ey.saidT <= 0) ey.said = null; }
    if (ey.b.pop) { ey.b.pop.t -= dt; if (ey.b.pop.t <= 0) ey.b.pop = null; }
  },
  after(run) {
    const ey = run.ey, g = run.state?.game;
    if (ey.b.open && !live(run)) { showBoard(run, ey.b, false); return; }
    if (ey.b.open && g) drawEye(ey, g);
  }
};

// =====================================================================================================================
// 2. The snow profile
// =====================================================================================================================
// --- The field in the world: posts, the stake, the mast, the pit's dark patch, and the sign at the institute's door -----
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  const count = g.attributes.position.count, co = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { out[i * 3] = co.r; out[i * 3 + 1] = co.g; out[i * 3 + 2] = co.b; }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const boxAt = (w, h, d, x, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paint(g, col); };

function buildField() {
  const parts = [], F = SLF.field, y0 = groundHeight(F.x, F.z);
  const at = (dx, dz) => groundHeight(F.x + dx, F.z + dz) - y0;
  // the fence: orange-topped posts round a 14 m square
  const R = 7;
  for (let i = -R; i <= R; i += 3.5) {
    for (const [dx, dz] of [[i, -R], [i, R], [-R, i], [R, i]]) {
      const y = at(dx, dz);
      parts.push(boxAt(0.08, 1.3, 0.08, dx, y + 0.65, dz, '#5b4632'), boxAt(0.1, 0.22, 0.1, dx, y + 1.36, dz, '#ef6c1e'));
    }
  }
  // the mast with its boxes and arms, the snow stake with its red marks
  const m = at(-4, -3);
  parts.push(boxAt(0.12, 5.5, 0.12, -4, m + 2.75, -3, '#b9bec6'), boxAt(1.5, 0.06, 0.06, -4, m + 5.2, -3, '#b9bec6'), boxAt(0.5, 0.6, 0.25, -4, m + 1.7, -2.84, '#e7e9ec'), boxAt(0.14, 0.14, 0.3, -3.3, m + 5.3, -3, '#30343b'));
  const s = at(4, -3);
  parts.push(boxAt(0.1, 3, 0.05, 4, s + 1.5, -3, '#f4f4f0'));
  for (let i = 0; i < 6; i++) parts.push(boxAt(0.11, 0.2, 0.06, 4, s + 0.3 + i * 0.5, -3, '#d6322a'));
  // the pit: a dark trench with its heap of dug snow beside it
  parts.push(boxAt(1.6, 0.04, 1, 0.6, at(0.6, 1.2) + 0.05, 1.2, '#26303f'), boxAt(2, 0.3, 1.1, 0.6, at(0.6, 2.6) + 0.12, 2.6, '#f2f6fb'));
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  mesh.position.set(F.x, y0, F.z);
  mesh.castShadow = true;
  return mesh;
}

/** The board at the institute's door (the only texture of the mission's world: small, gone with the run) */
function buildSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const c = canvas.getContext('2d');
  c.fillStyle = '#16395f'; c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#fff'; c.font = `800 38px Inter, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('WSL · SLF', 128, 33, 240);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicNodeMaterial({ map: tex, side: THREE.DoubleSide }));
  // (on the footprint's south wall, z = -1876.1, over the door, looking south into the alley)
  mesh.position.set(SLF.door.x, groundHeight(SLF.door.x, SLF.door.z) + 2.4, -1875.9);
  return mesh;
}

// --- The crystals under the loupe ------------------------------------------------------------------------------------
function drawCrystal(c, id, x, y, s, rot = 0) {
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.strokeStyle = '#e8f4ff'; c.fillStyle = '#e8f4ff'; c.lineWidth = Math.max(1, s * 0.09); c.lineCap = 'round';
  if (id === 'PP') {
    // a stellar crystal: six arms with their side branches
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(s, 0);
      for (const k of [0.45, 0.72]) { c.moveTo(s * k, 0); c.lineTo(s * (k + 0.2), s * 0.2); c.moveTo(s * k, 0); c.lineTo(s * (k + 0.2), -s * 0.2); }
      c.stroke();
    }
  } else if (id === 'DF') {
    // the arms broken up into crooked bits
    for (const [a, l, ox, oy] of [[0.4, 0.8, -0.5, -0.3], [1.5, 0.6, 0.3, -0.5], [2.6, 0.7, -0.2, 0.4], [4, 0.5, 0.5, 0.3]]) {
      c.save(); c.translate(ox * s, oy * s); c.rotate(a);
      c.beginPath(); c.moveTo(-l * s * 0.5, 0); c.lineTo(l * s * 0.5, 0); c.moveTo(0, 0); c.lineTo(l * s * 0.2, l * s * 0.3); c.stroke();
      c.restore();
    }
  } else if (id === 'RG') {
    // small rounded grains, sintered together
    for (const [ox, oy, r] of [[0, 0, 0.42], [0.62, 0.2, 0.3], [-0.5, 0.4, 0.28]]) { c.beginPath(); c.arc(ox * s, oy * s, r * s, 0, 6.3); c.fill(); }
  } else if (id === 'FC') {
    // sharp-edged, flat faces
    c.lineJoin = 'miter';
    c.strokeRect(-s * 0.65, -s * 0.65, s * 1.3, s * 1.3);
    c.beginPath(); c.moveTo(-s * 0.65, -s * 0.65); c.lineTo(-s * 0.2, -s * 0.2); c.lineTo(s * 0.65, -s * 0.2); c.moveTo(-s * 0.2, -s * 0.2); c.lineTo(-s * 0.2, s * 0.65); c.stroke();
  } else if (id === 'DH') {
    // a big hollow cup with ribs
    c.beginPath(); c.moveTo(-s * 0.35, -s * 0.9); c.lineTo(s * 0.35, -s * 0.9); c.lineTo(s * 0.8, s * 0.8); c.lineTo(-s * 0.8, s * 0.8); c.closePath(); c.stroke();
    c.lineWidth *= 0.7;
    c.beginPath();
    for (const k of [-0.45, 0, 0.45]) { const hw = 0.35 + (k + 0.9) * 0.265; c.moveTo(-hw * s, k * s); c.lineTo(hw * s, k * s); }
    c.stroke();
  } else {
    // melt-freeze: big round grains in a clear cluster
    for (const [ox, oy] of [[-0.42, -0.2], [0.42, -0.25], [0, 0.45]]) { c.beginPath(); c.arc(ox * s, oy * s, 0.46 * s, 0, 6.3); c.stroke(); }
  }
  c.restore();
}
function drawLoupe(c, id, x, y, r, seed) {
  c.save();
  c.fillStyle = '#16345c'; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
  c.clip();
  const rand = seededRandom(seed), size = { PP: 16, DF: 12, RG: 9, FC: 12, DH: 18, MF: 15 }[id];
  for (let i = 0; i < 12; i++) drawCrystal(c, id, x + (rand() - 0.5) * r * 1.9, y + (rand() - 0.5) * r * 1.9, size * (0.8 + rand() * 0.5), rand() * 6.3);
  c.restore();
  c.strokeStyle = '#30343b'; c.lineWidth = 7; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.stroke();
  c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + r * 0.72, y + r * 0.72); c.lineTo(x + r * 1.08, y + r * 1.08); c.stroke();
  c.lineCap = 'butt';
}

// --- The pit ---------------------------------------------------------------------------------------------------------
const PIT = { x: 8, w: 182, sky: 8, top: 62, bottom: 322 };
const LAYER_TONE = { PP: '#fbfdff', DF: '#eef4fa', RG: '#dfe9f3', FC: '#c5d8ea', DH: '#b3cbe3', MF: '#cfdde0' };
const pitY = (snow, h) => PIT.bottom - (h / snow.H) * (PIT.bottom - PIT.top);

function drawPit(c, g) {
  const s = g.snow, { x, w } = PIT, right = x + w;
  c.fillStyle = '#7fb4e6'; c.fillRect(x, PIT.sky, w, PIT.top - PIT.sky);
  // the Weissfluh's ridge behind the field
  c.fillStyle = '#d7e3ee'; c.beginPath(); c.moveTo(x, PIT.top); c.lineTo(x + 46, PIT.sky + 16); c.lineTo(x + 92, PIT.top - 16); c.lineTo(x + 136, PIT.sky + 24); c.lineTo(right, PIT.top); c.closePath(); c.fill();
  // undisturbed snow, then the wall as far as it has been dug
  c.fillStyle = '#eef3f8'; c.fillRect(x, PIT.top, w, PIT.bottom - PIT.top);
  const dugTo = PIT.top + (PIT.bottom - PIT.top) * g.dug;
  c.save();
  c.beginPath(); c.rect(x, PIT.top, w, dugTo - PIT.top); c.clip();
  s.layers.forEach((l, i) => {
    const y0 = pitY(s, l.top), y1 = pitY(s, l.bottom);
    c.fillStyle = LAYER_TONE[l.grain]; c.fillRect(x, y0, w, y1 - y0);
    c.strokeStyle = 'rgba(40,70,110,.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y1); c.lineTo(right, y1); c.stroke();
    if (g.stage === 'layers' && g.layer === i) { c.strokeStyle = '#f2b400'; c.lineWidth = 3; c.strokeRect(x + 2, y0 + 1.5, w - 4, y1 - y0 - 3); }
  });
  c.restore();
  if (g.stage === 'dig') {
    // the shovel at work
    const sy = dugTo - 8 + Math.sin(g.t * 9) * (g.dug > 0 ? 3 : 0);
    c.fillStyle = '#30343b'; c.fillRect(x + w / 2 - 2, sy - 42, 4, 42);
    c.fillStyle = '#d6322a'; c.beginPath(); c.roundRect(x + w / 2 - 14, sy - 4, 28, 16, 3); c.fill();
  } else {
    c.fillStyle = '#6d5e4f'; c.fillRect(x, PIT.bottom - 3, w, 3); // the ground
  }
  // the depth scale
  c.fillStyle = 'rgba(20,40,70,.85)'; c.font = `700 10px ${FONT}`; c.textAlign = 'left';
  for (let d = 0; d <= s.H; d += 50) { if (pitY(s, s.H - d) <= dugTo + 1) { c.fillRect(x, pitY(s, s.H - d), 7, 1.5); c.fillText(`${d}`, x + 9, pitY(s, s.H - d) + (d === 0 ? 10 : 4)); } }
  // the tool in the wall
  if (g.stage === 'layers' && g.sub === 'hard' && g.selected != null) {
    const l = s.layers[g.layer], my = (pitY(s, l.top) + pitY(s, l.bottom)) / 2, test = g.tests[g.tests.length - 1];
    const k = g.busy > 0 ? 1 - g.busy / SNOW.testTime : 1;
    const going = test?.in !== false, reach = going ? k * 60 : k * 14, thick = [34, 24, 10, 6, 3][g.selected];
    c.fillStyle = g.selected < 3 ? '#efc7a2' : g.selected === 3 ? '#e0b000' : '#9aa3ad';
    c.beginPath(); c.roundRect(right - 70 - reach + 60, my - thick / 2, 70, thick, Math.min(6, thick / 2)); c.fill();
  } else if (g.stage === 'layers' && g.sub === 'grain') {
    drawLoupe(c, s.layers[g.layer].grain, x + w / 2 - 6, 176, 72, s.seed * 31 + g.layer * 7 + 1);
  } else if (g.stage === 'temp') {
    const T = g.temp, y = pitY(s, s.H - g.depths[Math.min(T.i, g.depths.length - 1)]);
    c.fillStyle = '#d6322a'; c.fillRect(right - 74, y - 1.5, 74, 3);
    c.fillStyle = '#30343b'; c.beginPath(); c.roundRect(right - 30, y - 10, 30, 20, 4); c.fill();
    c.fillStyle = 'rgba(10,20,40,.88)'; c.beginPath(); c.roundRect(x + 24, PIT.top + 6, 134, 42, 8); c.fill();
    c.fillStyle = T.holding ? '#7dff7d' : '#9fb0c4'; c.textAlign = 'center'; c.font = `900 26px ${FONT}`;
    c.fillText(T.value == null ? '--.- °C' : `${T.value.toFixed(1)} °C`, x + 91, PIT.top + 36);
  } else if (g.stage === 'ct' || g.stage === 'pick') {
    // the 30 x 30 cm column, cut free in the wall, the shovel blade on top; once broken the block above the fracture slides
    const weak = s.layers[s.weak], cx0 = x + 58, cw = 66, broke = g.ct.broke;
    const yWeak = pitY(s, weak.top), slide = broke ? 11 : 0, bottomY = pitY(s, Math.max(0, weak.bottom - 30));
    c.fillStyle = 'rgba(38,48,63,.8)'; c.fillRect(cx0 - 9, PIT.top, 9, bottomY - PIT.top); c.fillRect(cx0 + cw, PIT.top, 9, bottomY - PIT.top);
    c.fillStyle = '#d6322a'; c.fillRect(cx0 - 6 + slide, PIT.top - 6 + (g.ct.cool > 0 ? 3 : 0), cw + 12, 5);
    if (broke) {
      s.layers.forEach((l) => {
        if (l.top <= weak.top) return;
        c.fillStyle = LAYER_TONE[l.grain]; c.fillRect(cx0 + slide, pitY(s, l.top), cw, pitY(s, l.bottom) - pitY(s, l.top));
      });
      c.strokeStyle = '#d6322a'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx0 - 4, yWeak); c.lineTo(cx0 + cw + slide + 4, yWeak); c.stroke();
    }
  }
}

// --- The sheet, in the manner of an SLF profile: the hardness bars from the right, the temperature on its own axis ---------
const SH = { x: 198, y: 8, w: 354, h: 314 };
function drawSheet(c, g) {
  const s = g.snow, r = g.record, truth = g.stage === 'sheet';
  const px0 = SH.x + 28, px1 = SH.x + 244, py0 = SH.y + 42, py1 = SH.y + SH.h - 24, cols = px1 + 12;
  const hy = (h) => py1 - (h / s.H) * (py1 - py0), hx = (hard) => px1 - ((hard + 1) / 5) * (px1 - px0), tx = (T) => px1 + (clamp(T, -20, 0) / 20) * (px1 - px0);
  c.fillStyle = '#fbfbf4'; c.beginPath(); c.roundRect(SH.x, SH.y, SH.w, SH.h, 8); c.fill();
  c.fillStyle = '#1c2a3a'; c.textAlign = 'left'; c.font = `800 12px ${FONT}`;
  c.fillText(`${t('Snow profile')} · Weissfluhjoch 2536 m`, SH.x + 8, SH.y + 15, SH.w - 14);
  // the grid and the temperature axis along the top
  c.font = `600 9.5px ${FONT}`; c.textAlign = 'center'; c.strokeStyle = 'rgba(30,50,80,.16)'; c.lineWidth = 1;
  for (let T = -20; T <= 0; T += 5) { const x = tx(T); c.beginPath(); c.moveTo(x, py0); c.lineTo(x, py1); c.stroke(); c.fillStyle = '#b3261e'; c.fillText(T === 0 ? '0 °C' : `${T}`.replace('-', '−'), x, py0 - 5); }
  // the hardness axis along the bottom
  c.fillStyle = '#1b4f8a';
  HARDNESS.forEach((v, i) => c.fillText(v.id, hx(i), py1 + 13));
  // the height on the left
  c.textAlign = 'right'; c.fillStyle = '#1c2a3a';
  for (let h = 0; h <= s.H; h += 50) { c.fillText(`${h}`, px0 - 4, hy(h) + 3); c.beginPath(); c.moveTo(px0, hy(h)); c.lineTo(px1, hy(h)); c.stroke(); }
  // the columns' heads
  c.textAlign = 'center'; c.fillStyle = '#1c2a3a'; c.font = `700 9.5px ${FONT}`;
  c.fillText(t('Grain'), cols + 14, py0 - 5); c.fillText(t('Hard'), cols + 50, py0 - 5);
  s.layers.forEach((l, i) => {
    const y0 = hy(l.top), y1 = hy(l.bottom), mid = (y0 + y1) / 2;
    const hasHard = r.hard[i] != null;
    if (truth && l.weak) { c.fillStyle = 'rgba(214,50,42,.16)'; c.fillRect(px0, y0, SH.x + SH.w - px0 - 4, y1 - y0); }
    if (hasHard) {
      c.fillStyle = '#7fb3e6'; c.fillRect(hx(r.hard[i]), y0, px1 - hx(r.hard[i]), y1 - y0);
      c.strokeStyle = '#1b4f8a'; c.lineWidth = 1; c.strokeRect(hx(r.hard[i]), y0, px1 - hx(r.hard[i]), y1 - y0);
    }
    if (truth) {
      c.save(); c.setLineDash([4, 3]); c.strokeStyle = '#111'; c.lineWidth = 2; c.strokeRect(hx(l.hard), y0 + 1, px1 - hx(l.hard), y1 - y0 - 2); c.restore();
    }
    c.strokeStyle = 'rgba(30,50,80,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px0, y1); c.lineTo(SH.x + SH.w - 6, y1); c.stroke();
    // the grain's symbol and the hardness in words, as written; on the returned sheet the truth beside them when they differ
    const G = r.grain[i] ? GRAINS.find((v) => v.id === r.grain[i]) : null;
    c.textAlign = 'center'; c.font = `800 13px ${FONT}`;
    if (G) { c.fillStyle = truth && r.grain[i] !== l.grain ? '#c0392b' : '#1c2a3a'; c.fillText(G.symbol, cols + 6, mid + 4); }
    if (truth && r.grain[i] !== l.grain) { c.fillStyle = '#1a8f4a'; c.fillText(GRAINS.find((v) => v.id === l.grain).symbol, cols + 24, mid + 4); }
    c.font = `800 11px ${FONT}`;
    if (hasHard) { c.fillStyle = truth && r.hard[i] !== l.hard ? '#c0392b' : '#1c2a3a'; c.fillText(HARDNESS[r.hard[i]].id, cols + 44, mid + 4); }
    if (truth && r.hard[i] !== l.hard) { c.fillStyle = '#1a8f4a'; c.fillText(HARDNESS[l.hard].id, cols + 66, mid + 4); }
  });
  // the temperature curve: the truth dashed beneath the readings
  if (truth) {
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = '#333'; c.lineWidth = 1.5; c.beginPath();
    g.depths.forEach((d, i) => { const x = tx(snowTempAt(s, d)), y = hy(s.H - d); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke(); c.restore();
  }
  c.strokeStyle = '#d6322a'; c.fillStyle = '#d6322a'; c.lineWidth = 2; c.beginPath();
  r.temps.forEach((T, i) => { const x = tx(T), y = hy(s.H - g.depths[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.stroke();
  r.temps.forEach((T, i) => { c.beginPath(); c.arc(tx(T), hy(s.H - g.depths[i]), 2.6, 0, 6.3); c.fill(); });
  // the compression test, where it was marked
  if (r.ctTap != null) {
    const layer = r.ctLayer != null ? s.layers[r.ctLayer] : truth ? s.layers[s.weak] : null;
    if (layer) {
      const y = hy(layer.top), right = truth && r.ctLayer !== s.weak;
      c.strokeStyle = right ? '#c0392b' : '#b3261e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(px0, y); c.lineTo(px1, y); c.stroke();
      c.fillStyle = '#b3261e'; c.textAlign = 'left'; c.font = `900 11px ${FONT}`; c.fillText(`CT${r.ctTap}`, px0 + 3, y - 3);
    }
  }
}

const SNOW_INFO = {
  dig: 'Hold to dig: right down to the ground.',
  hard: 'Push into the wall, softest first. Write down the largest that still goes in.',
  grain: 'What does the loupe show? Pick the grain.',
  temp: 'Hold the thermometer in the wall until the reading stops moving, then let go.',
  ct: 'Tap the shovel on the column: ten from the wrist, ten from the elbow, ten from the shoulder.',
  pick: 'It broke! In which layer?',
  danger: 'Which danger level does the profile speak for?',
  sheet: 'Your sheet against the truth: dashed is what was really there.'
};

function drawSnow(sp, g) {
  const b = sp.b, c = b.c, s = g.snow;
  b.hits.length = 0;
  c.fillStyle = '#1b2029'; c.fillRect(0, 0, W, H);
  drawPit(c, g);
  drawSheet(c, g);
  const yP = 330, x0 = 10, bw = W - 20;
  const prompt = (text) => { c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `700 14px ${FONT}`; c.fillText(text, x0, yP + 14, bw - 74); };
  c.fillStyle = '#ffe14f'; c.font = `800 14px ${FONT}`; c.textAlign = 'right';
  c.fillText(fmtClock(g.t), W - 12, yP + 14);
  if (g.stage === 'dig') {
    prompt(`${t('The pit')}: ${Math.round(g.dug * s.H)} / ${s.H} cm`);
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x0, yP + 24, bw, 8);
    c.fillStyle = '#7dff7d'; c.fillRect(x0, yP + 24, bw * g.dug, 8);
    button(b, 'hold', x0, yP + 40, bw, 96, t('Hold to dig'), { colour: '#1c76e0', size: 22, sub: 'Space' });
  } else if (g.stage === 'layers' && g.sub === 'hard') {
    const l = s.layers[g.layer];
    prompt(`${t('Layer')} ${g.layer + 1}/${s.layers.length} · ${s.H - l.top}-${s.H - l.bottom} cm · ${t('hand test')}`);
    const w = (bw - 24) / 5;
    HARDNESS.forEach((h, i) => {
      const tr = g.tests.find((v) => v.tool === i);
      const answered = tr && tr.in != null;
      button(b, `tool${i}`, x0 + i * (w + 6), yP + 24, w, 56, t(h.name), { on: g.selected === i, off: g.busy > 0, size: 13, colour: answered ? (tr.in ? '#1a8f4a' : '#a8352a') : undefined, sub: answered ? t(tr.in ? 'goes in' : 'stopped') : `${i + 1}` });
    });
    const sel = g.selected != null ? HARDNESS[g.selected] : null;
    button(b, 'write', x0, yP + 86, bw, 54, sel ? `${t('Write down')}: ${t(sel.name)} (${sel.id})` : t('Try a tool first'), { off: !sel || g.busy > 0, colour: '#1c76e0', sub: 'Space' });
  } else if (g.stage === 'layers') {
    const l = s.layers[g.layer];
    prompt(`${t('Layer')} ${g.layer + 1}/${s.layers.length} · ${s.H - l.top}-${s.H - l.bottom} cm · ${t('grain under the loupe')}`);
    const w = (bw - 12) / 3;
    GRAINS.forEach((v, i) => {
      const x = x0 + (i % 3) * (w + 6), y = yP + 24 + Math.floor(i / 3) * 58;
      button(b, `grain${i}`, x, y, w, 52, `${v.symbol} ${t(v.name)}`, { size: 13, sub: `${i + 1}` });
      drawCrystal(c, v.id, x + 18, y + 26, 10);
    });
  } else if (g.stage === 'temp') {
    prompt(`${t('Thermometer')}: ${g.depths[g.temp.i] ?? ''} cm · ${g.temp.i + 1}/${g.depths.length}`);
    button(b, 'hold', x0, yP + 24, bw, 112, t(g.temp.holding ? 'Reading … let go when it settles' : 'Hold it in the wall'), { colour: g.temp.holding ? '#1a8f4a' : '#1c76e0', size: 19, sub: 'Space' });
  } else if (g.stage === 'ct') {
    const n = g.ct.taps + 1;
    prompt(`${t('Compression test')}: ${g.ct.taps} · ${t(n <= 10 ? 'from the wrist' : n <= 20 ? 'from the elbow' : 'from the shoulder')}`);
    button(b, 'tap', x0, yP + 24, bw, 112, t('Tap!'), { colour: '#c9571c', size: 28, sub: 'Space' });
  } else if (g.stage === 'pick') {
    prompt(`CT${g.record.ctTap}: ${t('where did it break?')}`);
    const w = (bw - 12) / 3;
    s.layers.forEach((l, i) => {
      button(b, `layer${i}`, x0 + (i % 3) * (w + 6), yP + 24 + Math.floor(i / 3) * 58, w, 52, `${s.H - l.top}-${s.H - l.bottom} cm`, { size: 14, sub: `${i + 1}` });
    });
  } else if (g.stage === 'danger') {
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `600 12px ${FONT}`;
    wrap(c, t('Breaks from the wrist: high. From the elbow: considerable. From the shoulder: moderate. 30 cm of fresh snow: one level more.'), x0, yP + 12, bw, 15);
    const w = (bw - 24) / 5;
    DANGER.forEach((d, i) => button(b, `danger${d.level}`, x0 + i * (w + 6), yP + 46, w, 92, `${d.level}`, { colour: d.colour, fg: d.level <= 3 ? '#111' : '#fff', size: 28, sub: t(d.name) }));
  } else if (g.stage === 'sheet') {
    const r = g.result;
    // the marks over the pit panel
    c.fillStyle = 'rgba(14,20,32,.93)'; c.fillRect(PIT.x, PIT.sky, PIT.w, PIT.bottom - PIT.sky);
    c.textAlign = 'left'; c.fillStyle = '#ffe14f'; c.font = `900 26px ${FONT}`; c.fillText(`${r.total}`, PIT.x + 10, PIT.sky + 32);
    c.fillStyle = '#fff'; c.font = `700 13px ${FONT}`; c.fillText(`/ 1000 ${t('pts')}`, PIT.x + 74, PIT.sky + 32);
    const rows = [['Hardness', r.hardness, SNOW.points.hardness], ['Grain', r.grain, SNOW.points.grain], ['Temperature', r.temp, SNOW.points.temp], ['Weak layer', r.ct, SNOW.points.ct], ['Danger level', r.danger, SNOW.points.danger], ['Time', r.time, SNOW.points.time]];
    rows.forEach(([name, got, max], i) => {
      const y = PIT.sky + 58 + i * 40;
      c.fillStyle = '#cfd6df'; c.font = `700 12px ${FONT}`; c.textAlign = 'left'; c.fillText(t(name), PIT.x + 10, y, 120);
      c.textAlign = 'right'; c.fillStyle = '#fff'; c.fillText(`${got}`, PIT.x + PIT.w - 10, y);
      c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(PIT.x + 10, y + 6, PIT.w - 20, 6);
      c.fillStyle = got >= max * 0.75 ? '#7dff7d' : got >= max * 0.4 ? '#ffc83d' : '#ff6b6b'; c.fillRect(PIT.x + 10, y + 6, (PIT.w - 20) * (got / max), 6);
    });
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `700 13px ${FONT}`;
    c.fillText(`${t('Danger level')}: ${t('yours')} ${g.record.danger} · ${t('profile')} ${s.danger} · CT${s.ct} · ${s.newSnow} cm ${t('fresh snow')}`, x0, yP + 16, bw);
    c.font = `600 12px ${FONT}`; c.fillStyle = '#cfd6df';
    wrap(c, t('One pit is only one clue: the real bulletin weighs many profiles, the weather and the observers.'), x0, yP + 36, bw, 15);
    button(b, 'close', x0, yP + 74, bw, 66, t('Send it to the forecasters'), { colour: '#1a8f4a', size: 18, sub: 'Space' });
  }
  drawPop(c, b, 318);
}

const SNOW_FEATURE = {
  // (js/missions.js hides the game's own controls while this is true: at the profile board and on the ride up; the walks keep them)
  ownControls: (run) => !!run._exHeld,
  setup(run) {
    addStyle(run);
    const b = createBoard(run, (id) => SNOW_FEATURE.act(run, id));
    const cut = el('div', 'ex-cut', '');
    cut.hidden = true;
    document.body.append(cut);
    run.cleanups.push(() => cut.remove());
    run.group.add(buildField(), buildSign());
    run.sp = { b, cut, cutT: -1, jumped: false };
  },
  reset(run) {
    const sp = run.sp;
    run.state.game = null;
    run.state.arrived = false;
    sp.cutT = -1; sp.jumped = false;
    sp.cut.hidden = true; sp.cut.classList.remove('on');
    showBoard(run, sp.b, false);
  },
  teardown(run) { showBoard(run, run.sp.b, false); },
  /** From the institute to the Weissfluhjoch: a cut, the town moves along as it does for a mission's start */
  jump(run) {
    const { x, z, heading } = SLF.arrival, hooks = run.hooks;
    if (hooks.world) setWorldCenter(x, z);
    hooks.teleportXZ(x, z, heading);
    run.lastPos.copy(hooks.controllerManager.getActiveEntity().position); // (the ride is no teleport)
  },
  act(run, id) {
    const g = run.state.game;
    if (!g || run.phase !== 'running') return;
    let hit = false;
    if (id.startsWith('tool')) hit = snowTest(g, Number(id.slice(4)));
    else if (id === 'write') hit = snowWrite(g);
    else if (id.startsWith('grain')) hit = snowGrain(g, GRAINS[Number(id.slice(5))].id);
    else if (id === 'tap') snowTap(g);
    else if (id.startsWith('layer')) hit = snowPick(g, Number(id.slice(5)));
    else if (id.startsWith('danger')) hit = snowDanger(g, Number(id.slice(6)));
    else if (id === 'close') hit = snowClose(g);
    if (hit) blip(run, 'pock');
  },
  key(run, e) {
    const sp = run.sp, g = run.state?.game;
    if (!sp.b.open || !g || run.phase === 'intro') return;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[e.code];
    if (e.code === 'Space' || e.code === 'Enter') {
      swallow(e);
      if (e.code === 'Space' && (g.stage === 'dig' || g.stage === 'temp')) { sp.b.keyHold = true; return; }
      if (e.repeat) return;
      if (g.stage === 'ct') SNOW_FEATURE.act(run, 'tap');
      else if (g.stage === 'layers' && g.sub === 'hard') SNOW_FEATURE.act(run, 'write');
      else if (g.stage === 'sheet') SNOW_FEATURE.act(run, 'close');
      return;
    }
    if (n === undefined) return;
    swallow(e);
    if (e.repeat) return;
    if (g.stage === 'layers') SNOW_FEATURE.act(run, g.sub === 'hard' ? `tool${n}` : `grain${n}`);
    else if (g.stage === 'pick') SNOW_FEATURE.act(run, `layer${n}`);
    else if (g.stage === 'danger') SNOW_FEATURE.act(run, `danger${n + 1}`);
  },
  update(run, ctx, dt) {
    const sp = run.sp, id = run.def.objectives[run.index]?.id;
    // the ride up
    if (id === 'ride' && live(run) && !run.state.arrived) {
      if (sp.cutT < 0) {
        sp.cutT = 0;
        holdPlayer(run, true);
        sp.cut.textContent = 'Up with the Parsennbahn to the Weissfluhjoch, then on skis to the measuring field …';
        sp.cut.hidden = false;
        requestAnimationFrame(() => sp.cut.classList.add('on'));
      }
      sp.cutT += dt;
      if (!sp.jumped && sp.cutT > 0.7) { sp.jumped = true; SNOW_FEATURE.jump(run); }
      if (sp.cutT > 2.9) {
        run.state.arrived = true;
        holdPlayer(run, false);
        sp.cut.classList.remove('on');
        setTimeout(() => { sp.cut.hidden = true; }, 500);
      }
      return;
    }
    if (!sp.b.open && id === 'profile' && live(run)) {
      run.state.game = createSnowGame((Date.now() & 0xffff) + 1);
      showBoard(run, sp.b, true);
    }
    const g = run.state.game;
    if (!sp.b.open || !g || run.phase !== 'running') return;
    const held = sp.b.keyHold || sp.b.down === 'hold';
    snowStep(g, { dig: held, hold: held }, Math.min(dt, 0.05));
    // a held key or finger does not carry over into the next step's job
    for (const e of g.events) {
      if (e.kind === 'stage') { sp.b.keyHold = false; sp.b.down = null; blip(run, 'good'); }
      else if (e.kind === 'in') blip(run, 'pock');
      else if (e.kind === 'stopped') blip(run, 'thud');
      else if (e.kind === 'reading') blip(run, 'pock');
      else if (e.kind === 'tap') blip(run, 'thud');
      else if (e.kind === 'break') { popUp(sp.b, 'Crack!', true, 1.2); blip(run, 'scrape'); }
      else if (e.kind === 'result') blip(run, e.total >= SNOW.medals.silver ? 'good' : 'bad');
    }
    g.events.length = 0;
    if (sp.b.pop) { sp.b.pop.t -= dt; if (sp.b.pop.t <= 0) sp.b.pop = null; }
  },
  after(run) {
    const sp = run.sp, g = run.state?.game;
    if (sp.b.open && !live(run)) { showBoard(run, sp.b, false); return; }
    if (!sp.b.open || !g) return;
    drawSnow(sp, g);
    setInfo(sp.b, SNOW_INFO[g.stage === 'layers' ? g.sub : g.stage]);
  }
};

export const EXPERT_FEATURES = { eyeTest: EYE_FEATURE, snowProfile: SNOW_FEATURE };
