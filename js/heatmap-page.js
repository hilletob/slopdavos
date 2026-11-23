import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SDK } from './account-config.js';
import { HEAT_CELL, HEAT_ORIGIN, HEAT_SIZE, HEAT_GROUPS } from './heat-trail.js';
import { LIVE_TOPIC, LIVE_EVENT } from './live-beacon.js';
import { createView, drawGround, drawLabels, scaleBar } from './heatmap-map.js';
import { GROUP_COLOURS, paintHeat as paintCells, fetchHeat, receiveDot, expireDots, drawDots as paintDots } from './heat-view.js';
import { KEYS } from './storage-keys.js';

// js/heatmap-page.js
// The public heat map (heatmap.html): the map of Davos (js/heatmap-map.js), on it where the players have gone (the
// counts per 16 m cell and group of the way of travel, heat_view() of supabase/migrations/*_heatmap.sql, collected by
// js/heat-trail.js) and where players are right now (the dots of js/live-beacon.js, a Realtime broadcast, nothing of it
// stored). Two canvases: the map with the heat, drawn when the view or the data changes, and the dots above it.

const LANG_KEY = KEYS.language;
const REFRESH = 5 * 60000; // ms: the heat anew
const START_BOX = [-3600, -4300, 4200, 4600]; // (the valley from Wolfgang to Frauenkirch)
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
  const sum = new Float64Array(W * H);
  for (const g of shown) { const c = counts[g]; for (let i = 0; i < sum.length; i++) sum[i] += c[i]; }
  ({ max: heatMax, cells: heatCells } = paintCells(heatCtx, sum, W, H));
  renderInfo();
  draw();
}

async function loadHeat() {
  try {
    setHeat(await fetchHeat());
  } catch {
    if (heatState !== 'ready') { heatState = 'failed'; renderInfo(); } // (the heat shown stays, the next round tries again)
  }
}

// ---- the dots -------------------------------------------------------------------------------------------------------
const dots = new Map(); // id -> { fromX, fromZ, x, z, at, k, dir }
let liveState = 'connecting'; // 'connecting' | 'on' | 'off'

function onPos(p) {
  const change = receiveDot(dots, p);
  if (!change) return;
  renderInfo();
  if (change === 'set') animate();
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
    if (expireDots(dots, now)) renderInfo();
    drawDots(now);
    if (dots.size) requestAnimationFrame(frame);
    else animating = false;
  });
}

function drawDots(now = performance.now()) {
  paintDots(dotCtx, view, dots, now, shown);
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
