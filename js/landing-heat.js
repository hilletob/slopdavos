import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SDK } from './account-config.js';
import { HEAT_CELL, HEAT_ORIGIN, HEAT_SIZE, HEAT_GROUPS } from './heat-trail.js';
import { LIVE_TOPIC, LIVE_EVENT } from './live-beacon.js';
import { createView, drawGround, drawLabels } from './heatmap-map.js';
import { paintHeat, fetchHeat, receiveDot, expireDots, drawDots as paintDots } from './heat-view.js';

// js/landing-heat.js
// The heat map as a panel of the landing page (index.html, "Where Davos is played"): the map of js/heatmap-map.js with
// the heat of heat_view() and the live dots of js/live-beacon.js on it, as on heatmap.html (js/heatmap-page.js) but
// standing still: no dragging and no zooming (the page scrolls over it), all groups shown, the town in the middle. The
// landing page imports this only once the panel comes near the screen (the map's data is some megabytes), and the live
// channel is held only while the panel is in view.

const FOCUS = [200, -700]; // (between Davos Platz and Davos Dorf)
const SPAN = [3400, 3800]; // m: at least this much of the valley across and down
const MIN_SCALE = 0.125; // px a metre (the houses are drawn from 0.12 on)
const TEXT = {
  de: {
    live: (n) => (n === 0 ? 'Gerade niemand unterwegs' : n === 1 ? '1 Spieler unterwegs' : `${n} Spieler unterwegs`),
    connecting: 'Live-Karte', offline: 'Live-Verbindung getrennt', none: 'Noch keine Spuren aufgezeichnet',
    failed: 'Die Spuren sind gerade nicht erreichbar', cells: (n) => `${n} Zellen mit Spuren`
  },
  en: {
    live: (n) => (n === 0 ? 'Nobody out there right now' : n === 1 ? '1 player out there' : `${n} players out there`),
    connecting: 'Live map', offline: 'Live connection lost', none: 'No trails recorded yet',
    failed: 'The trails cannot be reached right now', cells: (n) => `${n} cells with trails`
  }
};

/**
 * The panel: `root` holds canvas[data-heat="map"], canvas[data-heat="dots"], and for the words [data-heat="live"]
 * (with a span), [data-heat="note"] and [data-heat="legend"]. Gives back { setLang, setHeat, onPos, view, dots }.
 */
export function mountHeat(root, language = 'de') {
  const base = root.querySelector('[data-heat="map"]'), top = root.querySelector('[data-heat="dots"]');
  const ctx = base.getContext('2d'), dotCtx = top.getContext('2d');
  const view = createView();
  let lang = language;

  // ---- the heat ---------------------------------------------------------------------------------------------------
  const [W, H] = HEAT_SIZE;
  const sum = new Float64Array(W * H);
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = W;
  heatCanvas.height = H;
  const heatCtx = heatCanvas.getContext('2d');
  // (the glow under the heat: the same picture at a quarter of its size, so a trail two pixels wide shows from afar)
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = Math.ceil(W / 4);
  glowCanvas.height = Math.ceil(H / 4);
  const glowCtx = glowCanvas.getContext('2d');
  let heatCells = 0, heatState = 'loading'; // 'loading' | 'ready' | 'failed'

  /** The cells of heat_view() ([[g, ix, iz, n], …]), all groups together */
  function setHeat(cells) {
    sum.fill(0);
    for (const [g, ix, iz, n] of cells || []) {
      if (g >= 0 && g < HEAT_GROUPS.length && ix >= 0 && ix < W && iz >= 0 && iz < H && n > 0) sum[iz * W + ix] += n;
    }
    heatCells = paintHeat(heatCtx, sum, W, H).cells;
    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.imageSmoothingEnabled = true;
    glowCtx.imageSmoothingQuality = 'high';
    glowCtx.drawImage(heatCanvas, 0, 0, glowCanvas.width, glowCanvas.height);
    heatState = 'ready';
    renderInfo();
    draw();
  }

  async function loadHeat() {
    try {
      setHeat(await fetchHeat());
    } catch {
      if (heatState !== 'ready') { heatState = 'failed'; renderInfo(); }
    }
  }

  // ---- the dots ---------------------------------------------------------------------------------------------------
  const dots = new Map(); // id -> { fromX, fromZ, x, z, at, k, dir }
  let liveState = 'connecting'; // 'connecting' | 'on' | 'off'
  function onPos(p) {
    const change = receiveDot(dots, p);
    if (!change) return;
    renderInfo();
    if (change === 'set') animate();
  }

  // (the channel only while the panel is on the screen: a visitor who scrolls past holds no socket)
  let supabase = null, channel = null, wanted = false;
  async function setLive(on) {
    wanted = on;
    try {
      if (!on) {
        if (channel) { const old = channel; channel = null; liveState = 'connecting'; renderInfo(); await supabase.removeChannel(old); }
        return;
      }
      if (channel || !SUPABASE_URL) return;
      if (!supabase) {
        const { createClient } = await import(SUPABASE_SDK);
        supabase ||= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      }
      if (!wanted || channel) return;
      const mine = supabase.channel(LIVE_TOPIC, { config: { broadcast: { self: false, ack: false } } });
      channel = mine;
      mine.on('broadcast', { event: LIVE_EVENT }, ({ payload }) => onPos(payload))
        .subscribe((status) => {
          if (channel !== mine) return;
          liveState = status === 'SUBSCRIBED' ? 'on' : 'off';
          renderInfo();
        });
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
    paintDots(dotCtx, view, dots, now);
  }

  // ---- the panel --------------------------------------------------------------------------------------------------
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
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) ctx.drawImage(glowCanvas, HEAT_ORIGIN[0], HEAT_ORIGIN[1], glowCanvas.width * 4 * HEAT_CELL, glowCanvas.height * 4 * HEAT_CELL);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(heatCanvas, HEAT_ORIGIN[0], HEAT_ORIGIN[1], W * HEAT_CELL, H * HEAT_CELL);
      drawLabels(ctx, view, lang);
      drawDots();
    });
  }

  function resize() {
    const w = base.clientWidth, h = base.clientHeight;
    if (!w || !h || (w === view.w && h === view.h)) return;
    view.w = w;
    view.h = h;
    view.dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [base, top]) { c.width = Math.round(w * view.dpr); c.height = Math.round(h * view.dpr); }
    view.cx = FOCUS[0];
    view.cz = FOCUS[1];
    view.s = Math.max(MIN_SCALE, Math.min(w / SPAN[0], h / SPAN[1]));
    draw();
  }

  function renderInfo() {
    const T = TEXT[lang], live = root.querySelector('[data-heat="live"]'), note = root.querySelector('[data-heat="note"]');
    if (live) {
      live.dataset.state = liveState;
      live.querySelector('span').textContent = liveState === 'off' ? T.offline : liveState === 'on' ? T.live(dots.size) : T.connecting;
    }
    if (note) {
      note.textContent = heatState === 'failed' ? T.failed : heatState === 'loading' ? '' : !heatCells ? T.none
        : T.cells(heatCells.toLocaleString(lang === 'de' ? 'de-CH' : 'en-GB'));
    }
    const legend = root.querySelector('[data-heat="legend"]');
    if (legend) legend.hidden = !heatCells;
  }

  new ResizeObserver(resize).observe(base);
  resize();
  renderInfo();
  document.fonts?.ready.then(draw);
  loadHeat();
  const watching = () => setLive(inView && !document.hidden);
  let inView = false;
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; watching(); }).observe(root);
  document.addEventListener('visibilitychange', watching);

  return {
    setLang(next) { lang = next; renderInfo(); draw(); },
    setHeat, onPos, view, dots
  };
}
