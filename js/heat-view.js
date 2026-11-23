// What the heat map page (js/heatmap-page.js) and the landing page's panel (js/landing-heat.js) share: the heat's
// colours and picture, its request, and the live dots (how a message moves one, when it goes, how it is drawn).
import { SUPABASE_URL, SUPABASE_KEY } from './account-config.js';

const DOT_GONE = 15000; // ms without a message: the dot goes
const DOT_GLIDE = 2000; // ms: a dot's way from one message's place to the next
const DOT_LIMIT = 500;

/** The dots' colours by heat group (js/heat-trail.js HEAT_GROUPS) */
export const GROUP_COLOURS = ['#f2efe6', '#ffc21a', '#5fd0ff', '#ff7ad9', '#7be08a'];

const RAMP = [[62, 20, 110], [140, 30, 130], [214, 55, 90], [248, 120, 40], [252, 195, 70], [255, 248, 200]];
const ramp = (t) => {
  const f = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), u = f - i;
  return RAMP[i].map((c, j) => Math.round(c + (RAMP[i + 1][j] - c) * u));
};

/** The counts `sum` (W × H cells) as a picture on `ctx`, on a log scale; gives back { max, cells } */
export function paintHeat(ctx, sum, W, H) {
  const image = ctx.createImageData(W, H), data = image.data;
  let max = 0, cells = 0;
  for (let i = 0; i < sum.length; i++) { if (sum[i] > 0) { cells++; if (sum[i] > max) max = sum[i]; } }
  const scale = 1 / Math.log1p(Math.max(max, 8));
  for (let i = 0; i < sum.length; i++) {
    if (!(sum[i] > 0)) continue;
    const t = Math.log1p(sum[i]) * scale, [r, g, b] = ramp(t);
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b;
    data[i * 4 + 3] = Math.round(255 * (0.5 + 0.45 * t));
  }
  ctx.putImageData(image, 0, 0);
  return { max, cells };
}

/** The heat's cells from heat_view() ([[g, ix, iz, n], …]); throws when there is no answer */
export async function fetchHeat() {
  if (!SUPABASE_URL) throw new Error('no backend');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/heat_view`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json())?.cells;
}

/** Where a dot is drawn now: on its way to the last message's place */
const place = (d, now) => {
  const t = Math.min(1, (now - d.at) / DOT_GLIDE);
  return { x: d.fromX + (d.x - d.fromX) * t, z: d.fromZ + (d.z - d.fromZ) * t };
};

/** A live message (js/live-beacon.js) into `dots` (id -> { fromX, fromZ, x, z, at, k, dir }): 'off' when a dot went,
 *  'set' when one was placed or moved, null when the message was not taken */
export function receiveDot(dots, p, now = performance.now()) {
  if (!p || typeof p.id !== 'string' || p.id.length > 24) return null;
  if (p.off) { dots.delete(p.id); return 'off'; }
  const x = Number(p.x), z = Number(p.z), k = Number(p.k);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !GROUP_COLOURS[k]) return null;
  const old = dots.get(p.id);
  if (!old && dots.size >= DOT_LIMIT) return null;
  const here = old ? place(old, now) : { x, z };
  const far = Math.hypot(x - here.x, z - here.z);
  dots.set(p.id, {
    fromX: far > 400 ? x : here.x, fromZ: far > 400 ? z : here.z, x, z, at: now, k,
    dir: far > 3 && far <= 400 ? Math.atan2(z - here.z, x - here.x) : old?.dir ?? null
  });
  return 'set';
}

/** Takes out the dots not heard of for a while; true when one went */
export function expireDots(dots, now) {
  let gone = false;
  for (const [id, d] of dots) if (now - d.at > DOT_GONE) { dots.delete(id); gone = true; }
  return gone;
}

/** The dots on their own canvas (`view`: js/heatmap-map.js createView), pulsing, with a tip the way they head; only the
 *  groups in `shown` when given */
export function drawDots(ctx, view, dots, now = performance.now(), shown = null) {
  view.screen(ctx);
  ctx.clearRect(0, 0, view.w, view.h);
  const pulse = (now % 2000) / 2000;
  for (const d of dots.values()) {
    if (shown && !shown.has(d.k)) continue;
    const p = place(d, now), x = view.toX(p.x), y = view.toY(p.z);
    if (x < -30 || y < -30 || x > view.w + 30 || y > view.h + 30) continue;
    const colour = GROUP_COLOURS[d.k];
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.7 * (1 - pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 7 + 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (d.dir != null) { // (the way it is heading: a tip ahead of the dot)
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.dir);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(7, -5); ctx.lineTo(7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#0b0e12';
    ctx.beginPath();
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
