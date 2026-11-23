import * as THREE from 'three/webgpu';
import { NAMES } from './names-data.js';
import { FRAME } from './davos-frame.js';
import { groundHeight } from './terrain.js';
import { cachedMapLayer } from './map-layer-cache.js';

// The geographic names of the Landschaft Davos (js/names-data.js, tools/fetch-names.mjs: swisstopo's swissNAMES3D):
// - on the full map: the summits (a small triangle, the name, the height) and passes, the valleys, alps, ridges and
//   ravines, the lakes, glaciers and streams (blue, italic), the hamlets, huts and mountain restaurants, and at the
//   closest zooms the field names; more of them the closer the map is zoomed, none over another;
// - in the view: the names and heights of the summits and road passes round about, standing over them (like a
//   panorama board), for the few that are in sight and not behind a ridge.

const KIND = Object.fromEntries(NAMES.kinds.map((k, i) => [k, i]));
const all = NAMES.names.map(([name, x, z, h, kind, rank]) => ({ name, x, z, h, kind, rank }));

// --- The full map ---------------------------------------------------------------------------------------------------
// From which zoom (px per metre) a rank is labelled
const RANK_FROM = [0.016, 0.045, 0.11, 0.38];
const WATER = new Set([KIND.lake, KIND.glacier, KIND.stream]);
const HEIGHTS = new Set([KIND.peak, KIND.pass]);
const FONT = 'Inter, system-ui, sans-serif';

/** The map layer: { draw(ctx, view, isMinimap) } (js/town-map.js overlays) */
export function namesOverlay() {
  const widths = new Map();
  const layer = cachedMapLayer((ctx, v) => {
      const s = v.s, hw = v.w * 0.5, hh = v.h * 0.5;
      const placed = [];
      const free = (box) => !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const n of all) { // (sorted by rank, then by height: the important ones take their place first)
        if (s < RANK_FROM[n.rank]) break;
        const x = v.toX(n.x), y = v.toY(n.z);
        // (clear of the search bar above and of the legends and the scale below)
        if (Math.abs(x) > hw - 8 || y < -hh + 78 || y > hh - 84) continue;
        const peak = n.kind === KIND.peak, water = WATER.has(n.kind), field = n.kind === KIND.field;
        const label = HEIGHTS.has(n.kind) && n.h ? `${n.name} ${n.h}` : n.name;
        const size = n.rank === 0 ? 11.5 : field ? 9.5 : 10.5;
        const font = `${water || field ? 'italic ' : ''}${n.rank === 0 ? 700 : 500} ${size}px ${FONT}`;
        ctx.font = font;
        const key = `${font}|${label}`;
        let w = widths.get(key);
        if (w === undefined) { w = ctx.measureText(label).width; widths.set(key, w); }
        // (a summit's name beside its triangle, the others centred on their place)
        const box = peak ? [x - 5, y - 7, x + 8 + w, y + 7] : [x - w / 2 - 2, y - 7, x + w / 2 + 2, y + 7];
        if (box[2] > hw || box[0] < -hw || !free(box)) continue;
        placed.push(box);
        if (peak) {
          ctx.fillStyle = 'rgba(235, 238, 242, 0.9)';
          ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3.6, y + 2.6); ctx.lineTo(x - 3.6, y + 2.6); ctx.closePath(); ctx.fill();
        }
        ctx.textAlign = peak ? 'left' : 'center';
        const tx = peak ? x + 7 : x;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(8, 11, 15, 0.8)';
        ctx.strokeText(label, tx, y);
        ctx.fillStyle = water ? 'rgba(130, 190, 235, 0.92)' : field ? 'rgba(176, 184, 196, 0.7)' : n.rank === 0 ? 'rgba(240, 242, 245, 0.95)' : 'rgba(205, 212, 222, 0.88)';
        ctx.fillText(label, tx, y);
      }
      ctx.restore();
  });
  return {
    draw(ctx, v, isMinimap) {
      if (!isMinimap) layer(ctx, v);
    }
  };
}

// --- The summits in the view ---------------------------------------------------------------------------------------
const MAX_LABELS = 7;
const REACH = 9000; // m from the camera
const NEAR = 350; // m: a summit one stands on is not labelled

/** The summits and road passes that are named in the view: [{ name, h, x, y (frame height), z }] */
export const summits = () => all.filter((n) => (n.kind === KIND.peak && n.rank <= 1) || (n.kind === KIND.pass && n.rank === 0))
  .map((n) => ({ name: n.name, h: n.h, rank: n.kind === KIND.pass ? 1 : n.rank, x: n.x, z: n.z, y: n.h - FRAME.H0 }));

// Whether the terrain stands between the eye and the point (sampled along the sight line, the ends left out)
function hidden(ex, ey, ez, px, py, pz) {
  const d = Math.hypot(px - ex, pz - ez);
  // (close steps near the eye, where a slope right in front hides everything; wider ones farther out)
  for (let run = 25; run < d * 0.94; run *= 1.22) {
    const t = run / d;
    if (groundHeight(ex + (px - ex) * t, ez + (pz - ez) * t) > ey + (py - ey) * t + 4) return true;
  }
  return false;
}

/**
 * The summit names over the view. `update(camera, dt, show)` every frame: places the labels of the chosen summits and
 * picks them anew a few times a second (those in sight, the main summits and the near ones first, none over another).
 */
export function createSummitLabels(parent = document.body) {
  const root = document.createElement('div');
  root.className = 'summit-labels';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2;contain:strict';
  const pool = Array.from({ length: MAX_LABELS }, () => {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform,opacity;opacity:0;transition:opacity .35s;' +
      'font:600 11px Inter,system-ui,sans-serif;letter-spacing:.02em;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85),0 0 8px rgba(0,0,0,.5);' +
      'padding-bottom:13px;background:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,0)) no-repeat 50% 100% / 1px 11px';
    const name = document.createElement('span'), height = document.createElement('span');
    height.style.cssText = 'opacity:.75;font-weight:500;margin-left:.45em';
    el.append(name, height);
    root.appendChild(el);
    return { el, name, height, summit: null };
  });
  parent.appendChild(root);
  const list = summits();
  const v = new THREE.Vector3();
  let since = 1, chosen = [];
  const project = (s, camera, w, h) => {
    // (in front of the camera: by the view space, the depth range differs between WebGPU and WebGL)
    v.set(s.x, s.y + 14, s.z).applyMatrix4(camera.matrixWorldInverse);
    if (v.z > -5) return null;
    v.applyMatrix4(camera.projectionMatrix);
    return { x: (v.x * 0.5 + 0.5) * w, y: (0.5 - v.y * 0.5) * h };
  };
  const pick = (camera, w, h) => {
    const e = camera.position;
    const cands = [];
    for (const s of list) {
      const d = Math.hypot(s.x - e.x, s.y - e.y, s.z - e.z);
      if (d > REACH || d < NEAR) continue;
      const p = project(s, camera, w, h);
      if (!p || p.x < 60 || p.x > w - 60 || p.y < 70 || p.y > h * 0.72) continue;
      cands.push({ s, p, score: s.rank * 2500 + d });
    }
    cands.sort((a, b) => a.score - b.score);
    const out = [];
    for (const c of cands) {
      if (out.length >= MAX_LABELS) break;
      if (out.some((o) => Math.abs(o.p.x - c.p.x) < 130 && Math.abs(o.p.y - c.p.y) < 26)) continue;
      if (hidden(e.x, e.y, e.z, c.s.x, c.s.y + 14, c.s.z)) continue;
      out.push(c);
    }
    return out.map((c) => c.s);
  };
  return {
    root,
    update(camera, dt, show = true) {
      const w = window.innerWidth, h = window.innerHeight;
      since += dt;
      if (since > 0.35) {
        since = 0;
        chosen = show ? pick(camera, w, h) : [];
        // (a summit keeps its element while it stays chosen: no flicker)
        for (const slot of pool) if (slot.summit && !chosen.includes(slot.summit)) { slot.summit = null; slot.el.style.opacity = '0'; }
        for (const s of chosen) {
          if (pool.some((slot) => slot.summit === s)) continue;
          const slot = pool.find((p) => !p.summit);
          if (!slot) break;
          slot.summit = s;
          slot.name.textContent = s.name;
          slot.height.textContent = `${s.h} m`;
        }
      }
      for (const slot of pool) {
        if (!slot.summit) continue;
        const p = project(slot.summit, camera, w, h);
        if (!p) { slot.el.style.opacity = '0'; continue; }
        slot.el.style.opacity = '0.92';
        slot.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  };
}
