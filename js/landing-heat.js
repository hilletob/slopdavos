import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SDK } from './account-config.js';
import { HEAT_CELL, HEAT_ORIGIN, HEAT_SIZE, HEAT_GROUPS } from './heat-trail.js';
import { LIVE_TOPIC, LIVE_EVENT } from './live-beacon.js';
import { createView, drawGround, drawLabels } from './heatmap-map.js';

// js/landing-heat.js
// The heat map as a panel of the landing page (index.html, "Where Davos is played"): the map of js/heatmap-map.js with
// the heat of heat_view() and the live dots of js/live-beacon.js on it, as on heatmap.html (js/heatmap-page.js) but
// standing still: no dragging and no zooming (the page scrolls over it), all groups shown, the town in the middle. The
// landing page imports this only once the panel comes near the screen (the map's data is some megabytes), and the live
// channel is held only while the panel is in view.

const DOT_GONE = 15000; // ms without a message: the dot goes
const DOT_GLIDE = 2000; // ms: a dot's way from one message's place to the next
const FOCUS = [200, -700]; // (between Davos Platz and Davos Dorf)
const SPAN = [3400, 3800]; // m: at least this much of the valley across and down
const MIN_SCALE = 0.125; // px a metre (the houses are drawn from 0.12 on)
const GROUP_COLOURS = ['#f2efe6', '#ffc21a', '#5fd0ff', '#ff7ad9', '#7be08a']; // (as js/heatmap-page.js)
const RAMP = [[62, 20, 110], [140, 30, 130], [214, 55, 90], [248, 120, 40], [252, 195, 70], [255, 248, 200]];
const ramp = (t) => {
  const f = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), u = f - i;
  return RAMP[i].map((c, j) => Math.round(c + (RAMP[i + 1][j] - c) * u));
};
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
    const image = heatCtx.createImageData(W, H), data = image.data;
    let max = 0;
    heatCells = 0;
    for (let i = 0; i < sum.length; i++) { if (sum[i] > 0) { heatCells++; if (sum[i] > max) max = sum[i]; } }
    const scale = 1 / Math.log1p(Math.max(max, 8));
    for (let i = 0; i < sum.length; i++) {
      if (!(sum[i] > 0)) continue;
      const t = Math.log1p(sum[i]) * scale, [r, g, b] = ramp(t);
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b;
      data[i * 4 + 3] = Math.round(255 * (0.5 + 0.45 * t));
    }
    heatCtx.putImageData(image, 0, 0);
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
      if (!SUPABASE_URL) throw new Error('no backend');
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/heat_view`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(String(response.status));
      setHeat((await response.json())?.cells);
    } catch {
      if (heatState !== 'ready') { heatState = 'failed'; renderInfo(); }
    }
  }

  // ---- the dots ---------------------------------------------------------------------------------------------------
  const dots = new Map(); // id -> { fromX, fromZ, x, z, at, k, dir }
  let liveState = 'connecting'; // 'connecting' | 'on' | 'off'
  const place = (d, now) => {
    const t = Math.min(1, (now - d.at) / DOT_GLIDE);
    return { x: d.fromX + (d.x - d.fromX) * t, z: d.fromZ + (d.z - d.fromZ) * t };
  };

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
      if (d.dir != null) {
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
