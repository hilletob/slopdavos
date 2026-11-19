import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SDK } from './account-config.js';
import { HEAT_CELL, HEAT_ORIGIN, HEAT_SIZE, HEAT_GROUPS } from './heat-trail.js';
import { LIVE_TOPIC, LIVE_EVENT } from './live-beacon.js';
import { createView, drawGround, drawLabels, scaleBar } from './heatmap-map.js';

// js/heatmap-page.js
// The public heat map (heatmap.html): the map of Davos (js/heatmap-map.js), on it where the players have gone (the
// counts per 16 m cell and group of the way of travel, heat_view() of supabase/migrations/*_heatmap.sql, collected by
// js/heat-trail.js) and where players are right now (the dots of js/live-beacon.js, a Realtime broadcast, nothing of it
// stored). Two canvases: the map with the heat, drawn when the view or the data changes, and the dots above it.

const LANG_KEY = 'slopdavos-language';
const REFRESH = 5 * 60000; // ms: the heat anew
const DOT_GONE = 15000; // ms without a message: the dot goes
const DOT_GLIDE = 2000; // ms: a dot's way from one message's place to the next
const START_BOX = [-3600, -4300, 4200, 4600]; // (the valley from Wolfgang to Frauenkirch)
export const GROUP_COLOURS = ['#f2efe6', '#ffc21a', '#5fd0ff', '#ff7ad9', '#7be08a'];
const TEXT = {
  de: {
    live: (n) => (n === 1 ? '1 Spieler unterwegs' : `${n} Spieler unterwegs`), offline: 'Live-Verbindung getrennt',
    none: 'Noch keine Spuren aufgezeichnet', failed: 'Die Spuren sind gerade nicht erreichbar',
    asOf: (cells, when) => `${cells} Zellen mit Spuren, Stand ${when}`, few: 'selten', many: 'oft'
  },
  en: {
    live: (n) => (n === 1 ? '1 player out there' : `${n} players out there`), offline: 'Live connection lost',
    none: 'No trails recorded yet', failed: 'The trails cannot be reached right now',
    asOf: (cells, when) => `${cells} cells with trails, as of ${when}`, few: 'rarely', many: 'often'
  }
};
// The heat's colours from a few to many passes (dark violet to pale yellow, on the map's graphite)
const RAMP = [[62, 20, 110], [140, 30, 130], [214, 55, 90], [248, 120, 40], [252, 195, 70], [255, 248, 200]];
const ramp = (t) => {
  const f = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), u = f - i;
  return RAMP[i].map((c, j) => Math.round(c + (RAMP[i + 1][j] - c) * u));
};

const base = document.getElementById('map'), top = document.getElementById('dots');
const ctx = base.getContext('2d'), dotCtx = top.getContext('2d');
const view = createView();
let lang = 'de';
try { lang = (localStorage.getItem(LANG_KEY) || navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en'; } catch { /* */ }

// ---- the heat -------------------------------------------------------------------------------------------------------
const [W, H] = HEAT_SIZE;
const counts = HEAT_GROUPS.map(() => new Float64Array(W * H));
const shown = new Set(HEAT_GROUPS.map((_, g) => g)); // (the groups switched on)
const heatCanvas = document.createElement('canvas');
heatCanvas.width = W;
heatCanvas.height = H;
const heatCtx = heatCanvas.getContext('2d');
let heatMax = 0, heatCells = 0, heatAt = 0, heatState = 'loading'; // 'loading' | 'ready' | 'failed'

/** The cells of heat_view() ([[g, ix, iz, n], …]) in place of what was there */
function setHeat(cells) {
  for (const c of counts) c.fill(0);
  for (const [g, ix, iz, n] of cells || []) {
    if (counts[g] && ix >= 0 && ix < W && iz >= 0 && iz < H && n > 0) counts[g][iz * W + ix] += n;
  }
  heatAt = Date.now();
  heatState = 'ready';
  paintHeat();
}

function paintHeat() {
  const image = heatCtx.createImageData(W, H), data = image.data;
  const sum = new Float64Array(W * H);
  for (const g of shown) { const c = counts[g]; for (let i = 0; i < sum.length; i++) sum[i] += c[i]; }
  heatMax = 0;
  heatCells = 0;
  for (let i = 0; i < sum.length; i++) { if (sum[i] > 0) { heatCells++; if (sum[i] > heatMax) heatMax = sum[i]; } }
  const scale = 1 / Math.log1p(Math.max(heatMax, 8));
  for (let i = 0; i < sum.length; i++) {
    if (!(sum[i] > 0)) continue;
    const t = Math.log1p(sum[i]) * scale, [r, g, b] = ramp(t);
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b;
    data[i * 4 + 3] = Math.round(255 * (0.5 + 0.45 * t));
  }
  heatCtx.putImageData(image, 0, 0);
  renderInfo();
  draw();
}

async function loadHeat() {
  try {
    if (!SUPABASE_URL) throw new Error('no backend');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/heat_view`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(String(response.status));
    setHeat((await response.json())?.cells);
  } catch {
    if (heatState !== 'ready') { heatState = 'failed'; renderInfo(); } // (the heat shown stays, the next round tries again)
  }
}

// ---- the dots -------------------------------------------------------------------------------------------------------
const dots = new Map(); // id -> { fromX, fromZ, x, z, at, k, dir }
let liveState = 'connecting'; // 'connecting' | 'on' | 'off'

function onPos(p) {
  if (!p || typeof p.id !== 'string' || p.id.length > 24) return;
  if (p.off) { dots.delete(p.id); renderInfo(); return; }
  const x = Number(p.x), z = Number(p.z), k = Number(p.k);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !GROUP_COLOURS[k]) return;
  const now = performance.now(), old = dots.get(p.id);
  if (!old && dots.size >= 500) return;
  const here = old ? place(old, now) : { x, z };
  const far = Math.hypot(x - here.x, z - here.z);
  dots.set(p.id, {
    fromX: far > 400 ? x : here.x, fromZ: far > 400 ? z : here.z, x, z, at: now, k,
    dir: far > 3 && far <= 400 ? Math.atan2(z - here.z, x - here.x) : old?.dir ?? null
  });
  renderInfo();
  animate();
}
/** Where a dot is drawn now: on its way to the last message's place */
function place(d, now) {
  const t = Math.min(1, (now - d.at) / DOT_GLIDE);
  return { x: d.fromX + (d.x - d.fromX) * t, z: d.fromZ + (d.z - d.fromZ) * t };
}

async function goLive() {
  try {
    const { createClient } = await import(SUPABASE_SDK);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    supabase.channel(LIVE_TOPIC, { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: LIVE_EVENT }, ({ payload }) => onPos(payload))
      .subscribe((status) => { liveState = status === 'SUBSCRIBED' ? 'on' : 'off'; renderInfo(); });
  } catch {
    liveState = 'off';
    renderInfo();
  }
}

let animating = false;
function animate() {
  if (animating) return;
  animating = true;
  requestAnimationFrame(function frame(now) {
    for (const [id, d] of dots) if (now - d.at > DOT_GONE) { dots.delete(id); renderInfo(); }
    drawDots(now);
    if (dots.size) requestAnimationFrame(frame);
    else animating = false;
  });
}

function drawDots(now = performance.now()) {
  view.screen(dotCtx);
  dotCtx.clearRect(0, 0, view.w, view.h);
  const pulse = (now % 2000) / 2000;
  for (const d of dots.values()) {
    if (!shown.has(d.k)) continue;
    const p = place(d, now), x = view.toX(p.x), y = view.toY(p.z);
    if (x < -30 || y < -30 || x > view.w + 30 || y > view.h + 30) continue;
    const colour = GROUP_COLOURS[d.k];
    dotCtx.strokeStyle = colour;
    dotCtx.globalAlpha = 0.7 * (1 - pulse);
    dotCtx.lineWidth = 2;
    dotCtx.beginPath();
    dotCtx.arc(x, y, 7 + 14 * pulse, 0, Math.PI * 2);
    dotCtx.stroke();
    dotCtx.globalAlpha = 1;
    if (d.dir != null) { // (the way it is heading: a tip ahead of the dot)
      dotCtx.save();
      dotCtx.translate(x, y);
      dotCtx.rotate(d.dir);
      dotCtx.fillStyle = colour;
      dotCtx.beginPath();
      dotCtx.moveTo(15, 0); dotCtx.lineTo(7, -5); dotCtx.lineTo(7, 5);
      dotCtx.closePath();
      dotCtx.fill();
      dotCtx.restore();
    }
    dotCtx.fillStyle = '#0b0e12';
    dotCtx.beginPath();
    dotCtx.arc(x, y, 7.5, 0, Math.PI * 2);
    dotCtx.fill();
    dotCtx.fillStyle = colour;
    dotCtx.beginPath();
    dotCtx.arc(x, y, 5.5, 0, Math.PI * 2);
    dotCtx.fill();
  }
}

// ---- the page -------------------------------------------------------------------------------------------------------
let queued = false;
function draw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    drawGround(ctx, view);
    view.world(ctx);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(heatCanvas, HEAT_ORIGIN[0], HEAT_ORIGIN[1], W * HEAT_CELL, H * HEAT_CELL);
    drawLabels(ctx, view, lang);
    drawDots();
    const bar = scaleBar(view);
    document.getElementById('scale').style.width = `${bar.px}px`;
    document.getElementById('scale-label').textContent = bar.label;
  });
}

function resize() {
  const first = view.w === 1;
  view.w = base.clientWidth;
  view.h = base.clientHeight;
  view.dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [base, top]) { c.width = Math.round(view.w * view.dpr); c.height = Math.round(view.h * view.dpr); }
  if (first) view.fit(START_BOX);
  draw();
}

function renderInfo() {
  const T = TEXT[lang], shownDots = [...dots.values()].filter((d) => shown.has(d.k)).length;
  const live = document.getElementById('live');
  live.dataset.state = liveState;
  live.querySelector('span').textContent = liveState === 'off' ? T.offline : T.live(shownDots);
  const locale = lang === 'de' ? 'de-CH' : 'en-GB';
  document.getElementById('heat-note').textContent = heatState === 'failed' ? T.failed : heatState === 'loading' ? '' : !heatCells ? T.none
    : T.asOf(heatCells.toLocaleString(locale), new Date(heatAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
  document.getElementById('legend').hidden = !heatCells;
  document.getElementById('legend-max').textContent = `${T.many} (${Math.round(heatMax).toLocaleString(locale)}×)`;
  document.getElementById('legend-min').textContent = T.few;
}

function applyLanguage(next, keep = false) {
  lang = next;
  document.documentElement.lang = lang;
  document.title = lang === 'de' ? 'Heatmap – GTA Davos' : 'Heat map – GTA Davos';
  for (const el of document.querySelectorAll('[data-label-de]')) el.setAttribute('aria-label', el.dataset[lang === 'de' ? 'labelDe' : 'labelEn']);
  for (const b of document.querySelectorAll('[data-set-lang]')) b.setAttribute('aria-pressed', String(b.dataset.setLang === lang));
  if (keep) { try { localStorage.setItem(LANG_KEY, lang); } catch { /* */ } }
  renderInfo();
  draw();
}
for (const b of document.querySelectorAll('[data-set-lang]')) b.addEventListener('click', () => applyLanguage(b.dataset.setLang, true));

// (the groups: each a switch, in its dots' colour)
for (const b of document.querySelectorAll('[data-group]')) {
  const g = Number(b.dataset.group);
  b.style.setProperty('--dot', GROUP_COLOURS[g]);
  b.addEventListener('click', () => {
    if (shown.has(g)) shown.delete(g); else shown.add(g);
    b.setAttribute('aria-pressed', String(shown.has(g)));
    paintHeat();
  });
}

// Dragging, pinching, the wheel, the buttons and the keys
const pointers = new Map();
let pinch = 0;
top.addEventListener('pointerdown', (e) => { top.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.offsetX, e.offsetY]); pinch = 0; });
top.addEventListener('pointermove', (e) => {
  const was = pointers.get(e.pointerId);
  if (!was) return;
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pointers.size === 1) view.pan(e.offsetX - was[0], e.offsetY - was[1]);
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch && d > 0) view.zoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    pinch = d;
  }
  draw();
});
for (const type of ['pointerup', 'pointercancel']) top.addEventListener(type, (e) => { pointers.delete(e.pointerId); pinch = 0; });
top.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.offsetX, e.offsetY); draw(); }, { passive: false });
top.addEventListener('dblclick', (e) => { view.zoom(2, e.offsetX, e.offsetY); draw(); });
document.getElementById('zoom-in').addEventListener('click', () => { view.zoom(1.6); draw(); });
document.getElementById('zoom-out').addEventListener('click', () => { view.zoom(1 / 1.6); draw(); });
top.addEventListener('keydown', (e) => {
  const step = 80;
  const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
  if (move) view.pan(...move);
  else if (e.key === '+' || e.key === '=') view.zoom(1.6);
  else if (e.key === '-') view.zoom(1 / 1.6);
  else return;
  e.preventDefault();
  draw();
});

addEventListener('resize', resize);
resize();
applyLanguage(lang);
document.fonts?.ready.then(draw);
loadHeat();
setInterval(() => { if (!document.hidden) loadHeat(); }, REFRESH);
goLive();
// (for the checks in a browser: data without the backend)
globalThis.__heatmap = { setHeat, onPos, view, draw, dots };
