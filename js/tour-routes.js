import * as THREE from 'three/webgpu';
import { abs, attribute, color, mix, smoothstep } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { isWinter } from './season.js';
import { getLanguage } from './i18n.js';

// The marked and the published routes of the Landschaft Davos (js/tour-routes-data.js, tools/fetch-tour-routes.mjs:
// swisstopo's hiking network, SchweizMobil's routes, the SAC's ski touring and snowshoe routes):
// - on the full map, by season: in summer the signposted hiking network (yellow the Wanderwege, red the
//   Bergwanderwege, blue the Alpinwanderwege) under SchweizMobil's hiking (green) and mountain bike (ochre) routes
//   with their numbers; in winter the ski tours (light blue, dashed) and the snowshoe routes (violet, dashed). The
//   routes under the pointer are named below the map (the summit, its height, the SAC grade, the ascent time);
// - in the world: the yellow signposts (Wegweiser) at the hiking network's junctions and ends, their blades tipped
//   white-red-white on the mountain trails and white-blue-white on the alpine ones.
// The data (0.8 MB) is fetched after the start, apart from the game's own modules.

// (the map's own lines are solid and amber to yellow: the trails are dashed, the routes green and teal)
const STYLE = {
  w: { colour: '#f2c230', width: 1.3, dash: [5, 3.5] },
  b: { colour: '#ef5a48', width: 1.3, dash: [5, 3.5] },
  a: { colour: '#5a9cf0', width: 1.3, dash: [5, 3.5] },
  hike: { colour: '#3ecf7a', width: 2.4 },
  mtb: { colour: '#4fc3c8', width: 2, dash: [11, 4] },
  ski: { colour: '#8fd6ff', width: 1.7, dash: [7, 5] },
  snowshoe: { colour: '#c58cf2', width: 1.7, dash: [3, 4] }
};
const TEXT = {
  en: { w: 'Hiking trail', b: 'Mountain trail', a: 'Alpine trail', hike: 'Hiking route', mtb: 'Mountain bike route', ski: 'Ski tour', snowshoe: 'Snowshoe tour', up: 'ascent' },
  de: { w: 'Wanderweg', b: 'Bergwanderweg', a: 'Alpinwanderweg', hike: 'Wanderroute', mtb: 'Mountainbike-Route', ski: 'Skitour', snowshoe: 'Schneeschuhtour', up: 'Aufstieg' }
};
const text = () => TEXT[getLanguage() === 'de' ? 'de' : 'en'];

// --- The full map ---------------------------------------------------------------------------------------------------
const pathOf = (lines) => {
  const path = new Path2D();
  for (const l of lines) {
    path.moveTo(l[0], l[1]);
    for (let i = 2; i < l.length; i += 2) path.lineTo(l[i], l[i + 1]);
  }
  return path;
};
const boundsOf = (lines) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of lines) for (let i = 0; i < l.length; i += 2) { b[0] = Math.min(b[0], l[i]); b[1] = Math.min(b[1], l[i + 1]); b[2] = Math.max(b[2], l[i]); b[3] = Math.max(b[3], l[i + 1]); }
  return b;
};
// Metres from (x, z) to the nearest of the lines, Infinity beyond `reach`
function distanceTo(route, x, z, reach) {
  const b = route.bounds;
  if (x < b[0] - reach || x > b[2] + reach || z < b[1] - reach || z > b[3] + reach) return Infinity;
  let best = Infinity;
  for (const l of route.lines) {
    for (let i = 0; i + 3 < l.length; i += 2) {
      const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9)));
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
  }
  return best <= reach ? best : Infinity;
}

/** The map layer: { draw(ctx, view, isMinimap), hover(mx, my, view) } (js/nyc-map.js overlays) */
export function tourRoutesOverlay(data) {
  const hiking = ['w', 'b', 'a'].map((c) => ({ c, path: pathOf(data.hiking.filter((h) => h.c === c).map((h) => h.pts)) }));
  const prepared = (list, kindOf) => list.map((r) => ({ ...r, kind: kindOf(r), path: pathOf(r.lines), bounds: boundsOf(r.lines) }));
  const mobil = prepared(data.mobil, (r) => r.kind);
  const ski = prepared(data.ski, () => 'ski'), snowshoe = prepared(data.snowshoe, () => 'snowshoe');
  // One badge per SchweizMobil route number: at the middle of its longest stretch in the map
  const badges = [];
  for (const nr of new Set(mobil.map((r) => r.nr))) {
    const r = mobil.filter((m) => m.nr === nr).sort((a, b) => b.len - a.len)[0];
    const l = [...r.lines].sort((a, b) => b.length - a.length)[0], i = (l.length >> 2) * 2;
    badges.push({ nr, kind: r.kind, x: l[i], z: l[i + 1] });
  }
  const stroke = (ctx, v, path, style, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = style.colour;
    ctx.lineWidth = style.width / v.s; // (the path is in world metres)
    ctx.setLineDash(style.dash ? style.dash.map((d) => d / v.s) : []);
    ctx.stroke(path);
  };
  const visible = () => (isWinter() ? [...snowshoe, ...ski] : mobil);
  const hasAlpine = data.hiking.some((h) => h.c === 'a');
  let networkAlpha = 0;
  return {
    draw(ctx, v, isMinimap) {
      if (isMinimap) return;
      ctx.save();
      v.world(ctx);
      ctx.lineJoin = ctx.lineCap = 'round';
      if (isWinter()) {
        for (const r of snowshoe) stroke(ctx, v, r.path, STYLE.snowshoe, 0.8);
        for (const r of ski) stroke(ctx, v, r.path, STYLE.ski, 0.85);
      } else {
        // (the network fades in from the overview: 600 km of it would be a mesh over the whole valley)
        networkAlpha = Math.max(0, Math.min(0.85, (v.s - 0.02) / 0.03 * 0.85));
        if (networkAlpha > 0.02) for (const h of hiking) stroke(ctx, v, h.path, STYLE[h.c], networkAlpha);
        for (const r of mobil) stroke(ctx, v, r.path, STYLE[r.kind], 0.8);
      }
      ctx.restore();
      // The legend: a row over the map's own, for what the season shows
      ctx.save();
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineCap = 'butt';
      const T = text();
      const keys = isWinter() ? ['ski', 'snowshoe'] : [...(networkAlpha > 0.02 ? ['w', 'b', ...(hasAlpine ? ['a'] : [])] : []), 'hike', 'mtb'];
      let lx = -v.w / 2 + 24;
      const ly = v.h / 2 - 64;
      for (const k of keys) {
        const st = STYLE[k];
        ctx.strokeStyle = st.colour;
        ctx.lineWidth = Math.max(2, st.width);
        ctx.setLineDash(st.dash || []);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(8, 11, 15, 0.85)';
        ctx.strokeText(T[k], lx + 28, ly);
        ctx.fillStyle = 'rgba(214, 220, 228, 0.92)';
        ctx.fillText(T[k], lx + 28, ly);
        lx += 28 + ctx.measureText(T[k]).width + 18;
      }
      ctx.restore();
      if (isWinter()) return;
      // SchweizMobil's route numbers
      ctx.save();
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of badges) {
        const x = v.toX(b.x), y = v.toY(b.z);
        if (Math.abs(x) > v.w * 0.5 - 12 || Math.abs(y) > v.h * 0.5 - 12) continue;
        const w = ctx.measureText(String(b.nr)).width + 8;
        ctx.fillStyle = STYLE[b.kind].colour;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 7, w, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#0d1116';
        ctx.fillText(String(b.nr), x, y + 0.5);
      }
      ctx.restore();
    },
    hover(mx, my, v) {
      const x = (mx - v.w / 2) / v.s + v.cx, z = (my - v.h / 2) / v.s + v.cz;
      const reach = 7 / v.s;
      let best = null, bd = Infinity;
      for (const r of visible()) {
        const d = distanceTo(r, x, z, reach);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best) return null;
      const T = text();
      if (best.kind === 'hike' || best.kind === 'mtb') return `${T[best.kind]} ${best.nr ?? ''} · ${best.name}`.replace(/\s+·/, ' ·');
      const parts = [`${T[best.kind]}${best.name ? ` ${best.name}` : ''}${best.alt ? ` ${best.alt} m` : ''}`];
      if (best.route) parts.push(best.route);
      if (best.grade) parts.push(`SAC ${best.grade}`);
      if (best.time) parts.push(`${T.up} ${best.time}`);
      return parts.join(' · ');
    }
  };
}

// --- The signposts ---------------------------------------------------------------------------------------------------
const tagged = (geo, part) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.setAttribute('part', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(part), 1));
  return g;
};

// A galvanised post (2.6 m, 0.3 m of it in the ground) with three yellow blades pointing three ways and the white
// location plate under them. part 0: the post, 1: the blades (their tips by x: the last 12 cm), 2: the plate
function signpostGeometry() {
  const parts = [];
  const post = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8, 1);
  post.translate(0, 1.3, 0);
  parts.push(tagged(post, 0));
  [[2.48, 0.3], [2.3, 2.5], [2.12, 4.6]].forEach(([y, yaw]) => {
    const shape = new THREE.Shape();
    const L = 0.6, H = 0.14, tip = 0.09;
    shape.moveTo(0, -H / 2); shape.lineTo(L - tip, -H / 2); shape.lineTo(L, 0); shape.lineTo(L - tip, H / 2); shape.lineTo(0, H / 2); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: false });
    g.translate(0.035, 0, -0.008);
    // (the distance along the blade, kept for the tip's colours before the blade is turned)
    const along = Float32Array.from({ length: g.attributes.position.count }, (_, i) => g.attributes.position.getX(i));
    g.rotateY(yaw);
    g.translate(0, y, 0);
    const t = tagged(g, 1);
    t.setAttribute('along', new THREE.Float32BufferAttribute(g.index ? Array.from(g.index.array, (i) => along[i]) : along, 1));
    parts.push(t);
  });
  const plate = new THREE.BoxGeometry(0.2, 0.12, 0.012);
  plate.translate(0, 1.92, 0.036);
  parts.push(tagged(plate, 2));
  for (const p of parts) if (!p.attributes.along) p.setAttribute('along', new THREE.Float32BufferAttribute(new Array(p.attributes.position.count).fill(0), 1));
  return mergeGeometries(parts, false);
}

// `tip`: null (a Wanderweg: all yellow) or the colour between the two white bands (red: mountain, blue: alpine)
function signpostMaterial(tip) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
  const part = attribute('part', 'float'), along = attribute('along', 'float');
  const isPart = (id) => smoothstep(0.3, 0.2, abs(part.sub(id)));
  let blade = color(0xf5c400);
  if (tip !== null) {
    const white = smoothstep(0.495, 0.5, along), middle = smoothstep(0.545, 0.55, along).mul(smoothstep(0.6, 0.595, along));
    blade = mix(blade, mix(color(0xf2f2ee), color(tip), middle), white);
  }
  m.colorNode = mix(mix(color(0x8d9094), blade, isPart(1)), color(0xeeeeea), isPart(2));
  m.metalnessNode = isPart(0).mul(0.6);
  return m;
}

export function buildSignposts(scene, nodes) {
  const group = new THREE.Group();
  group.name = 'HikingSignposts';
  group.userData.terrain = 'absolute';
  const geometry = signpostGeometry();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (const [c, tip] of [['w', null], ['b', 0xd4202a], ['a', 0x1f5fc4]]) {
    const sites = nodes.filter((n) => n.c === c);
    if (!sites.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, signpostMaterial(tip), sites.length);
    sites.forEach((s, i) => {
      const x = s.x + Math.sin(s.a) * 1.6, z = s.z + Math.cos(s.a) * 1.6;
      mesh.setMatrixAt(i, m.compose(p.set(x, groundHeight(x, z) - 0.3, z), q.setFromAxisAngle(up, s.a), one));
    });
    mesh.name = `Hiking signposts (${c})`;
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData.stats = { signposts: nodes.length };
  scene.add(group);
  return group;
}

/** Fetches the routes, stands the signposts into the scene and lays the routes over the map. Resolves with the data. */
export async function buildTourRoutes(scene, mapSystem) {
  const { TOUR_ROUTES } = await import('./tour-routes-data.js');
  buildSignposts(scene, TOUR_ROUTES.nodes);
  // (under the map's other layers: the names, the vehicles, the mission pins)
  if (mapSystem && typeof Path2D !== 'undefined') (mapSystem.overlays ||= []).unshift(tourRoutesOverlay(TOUR_ROUTES));
  return TOUR_ROUTES;
}
