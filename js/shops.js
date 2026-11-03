import * as THREE from 'three/webgpu';
import { smoothstep, texture, uv } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOPS_DATA } from './shops-data.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { groundHeight } from './terrain.js';
import { cityUniforms } from './tsl-materials.js';
import { logoIndex, logoFor, logoImage, drawLogo } from './logos.js';
import { QUALITY } from './quality.js';
import { releaseRenderState } from './gpu-memory.js';

// The shop signs of Davos (js/shops-data.js, tools/fetch-shops.mjs): each business's name in its brand colours, drawn
// into canvas atlases (lettering, colours and a simple symbol; the brands' real logos, assets/logos, replace the
// lettering as they load), on a fascia board mounted on the wall of
// the nearest building facing the business, above the awnings (~4.5 m); restaurants, cafés, bars and hotels also get a hanging sign
// standing out from the wall. Several businesses on one wall line up side by side. The boards glow at dusk and night.

const ROW = 64, PAD = 14, ATLAS = 2048; // atlas row height (px), padding, size
const BOARD_Y = 4.5, OFFSET = 0.14; // the boards' lower edge above the ground, off the wall (metres)
const MAX_DIST = 22; // a business farther than this from any building gets no sign

function fontFor(b, px) {
  const family = b.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Inter, "Helvetica Neue", Arial, sans-serif';
  return `${b.weight || 700} ${px}px ${family}`;
}

// Symbols drawn beside the lettering
function drawMark(ctx, mark, x, y, s, b) {
  ctx.save();
  if (mark === 'cross') { // pharmacy: a green cross on white
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#2e9d47'; ctx.fillRect(x + s * 0.36, y + s * 0.12, s * 0.28, s * 0.76); ctx.fillRect(x + s * 0.12, y + s * 0.36, s * 0.76, s * 0.28);
  } else if (mark === 'k') { // kiosk: a bold k
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = b.background; ctx.font = `900 ${s * 0.95}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('k', x + s / 2, y + s * 0.54);
  } else if (mark === 'keys') { // three crossed keys, in outline
    ctx.strokeStyle = b.border || '#e60000'; ctx.lineWidth = s * 0.08;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(x + s * (0.5 + k * 0.22), y + s * 0.12); ctx.lineTo(x + s * (0.5 - k * 0.22), y + s * 0.88); ctx.stroke();
    }
  }
  ctx.restore();
}

// Draws every sign into atlas pages; returns [{ page, u0, v0, u1, v1, aspect }] and the page canvases
function buildAtlas(signs) {
  const pages = [], out = [];
  let canvas, ctx, x = 0, y = 0;
  const newPage = () => {
    // (laid out in ATLAS px whatever the canvas' size: the mobile profile, js/quality.js, draws it at half the size)
    canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.round(ATLAS * QUALITY.atlasScale);
    ctx = canvas.getContext('2d'); ctx.scale(QUALITY.atlasScale, QUALITY.atlasScale); pages.push(canvas); x = 0; y = 0;
  };
  newPage();
  for (const s of signs) {
    const b = s.brand, rowH = ROW, fontPx = Math.round(rowH * (b.sub ? 0.5 : 0.62));
    ctx.font = fontFor(b, fontPx);
    const markW = b.mark ? rowH - 2 * 8 + 10 : 0;
    let textW = ctx.measureText(b.text).width;
    if (b.sub) { ctx.font = fontFor({ ...b, weight: 500 }, Math.round(rowH * 0.24)); textW = Math.max(textW, ctx.measureText(b.sub).width); }
    const w = Math.min(ATLAS, Math.ceil(textW + markW + PAD * 2));
    if (x + w > ATLAS) { x = 0; y += rowH; }
    if (y + rowH > ATLAS) newPage();
    // Board, border, mark, lettering
    ctx.fillStyle = b.background; ctx.fillRect(x, y, w, rowH);
    if (b.border) { ctx.strokeStyle = b.border; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, w - 6, rowH - 6); }
    if (b.mark) drawMark(ctx, b.mark, x + PAD, y + 8, rowH - 16, b);
    ctx.fillStyle = b.colour; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = fontFor(b, fontPx);
    const tx = x + PAD + markW + (w - PAD * 2 - markW - textW) / 2;
    ctx.fillText(b.text, tx, y + rowH * (b.sub ? 0.38 : 0.53));
    if (b.sub) { ctx.font = fontFor({ ...b, weight: 500 }, Math.round(rowH * 0.24)); ctx.fillText(b.sub, tx, y + rowH * 0.78); }
    out.push({ page: pages.length - 1, u0: x / ATLAS, u1: (x + w) / ATLAS, v0: 1 - (y + rowH) / ATLAS, v1: 1 - y / ATLAS, aspect: w / rowH, px: { x, y, w, h: rowH } });
    x += w;
  }
  return { pages, cells: out };
}

// Repaints a sign's atlas cell with the brand's logo (js/logos.js) on its background: a wide logo fills the board; a
// compact one (an emblem) stands at the left with the lettering beside it, fitted to the rest of the board
function paintLogo(ctx, cell, b, e, img) {
  const { x, y, w, h } = cell.px;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = e.background || b.background; ctx.fillRect(x, y, w, h);
  if (b.border && !e.background) { ctx.strokeStyle = b.border; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6); }
  if (e.aspect >= 1.6 || w / h < 2.2) {
    drawLogo(ctx, img, e.aspect, x, y, w, h, { pad: 7 });
  } else {
    const s = h - 10;
    drawLogo(ctx, img, e.aspect, x + PAD, y + 5, s * Math.min(1.6, e.aspect), s);
    const tx = x + PAD + s * Math.min(1.6, e.aspect) + 10, room = x + w - PAD - tx;
    let px = Math.round(h * 0.62);
    ctx.font = fontFor(b, px);
    while (px > 12 && ctx.measureText(b.text).width > room) ctx.font = fontFor(b, --px);
    ctx.fillStyle = e.textColour || b.colour; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(b.text, tx, y + h * 0.53);
  }
  ctx.restore();
}

// The nearest wall of an OSM building to (x, z): { ax, az, bx, bz, px, pz, nx, nz, d } with (nx, nz) pointing out
function nearestWall(index, x, z) {
  let best = null;
  for (const b of index.near(x, z)) {
    const r = b.ring;
    for (let i = 0; i < r.length; i += 2) {
      const ax = r[i], az = r[i + 1], bx = r[(i + 2) % r.length], bz = r[(i + 3) % r.length];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      if (L2 < 4) continue; // walls under 2 m
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(px - x, pz - z);
      if (best && d >= best.d) continue;
      const L = Math.sqrt(L2);
      let nx = -dz / L, nz = dx / L;
      if ((px + nx - b.cx) ** 2 + (pz + nz - b.cz) ** 2 < (px - nx - b.cx) ** 2 + (pz - nz - b.cz) ** 2) { nx = -nx; nz = -nz; }
      best = { ax, az, bx, bz, px, pz, nx, nz, d, t, L, key: `${b.id}:${i}` };
    }
  }
  return best;
}

function buildingIndex() {
  const CELL = 50, cells = new Map();
  for (const b of DAVOS_DATA.buildings || []) {
    let cx = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < b.ring.length; i += 2) {
      cx += b.ring[i]; cz += b.ring[i + 1];
      x0 = Math.min(x0, b.ring[i]); x1 = Math.max(x1, b.ring[i]); z0 = Math.min(z0, b.ring[i + 1]); z1 = Math.max(z1, b.ring[i + 1]);
    }
    const e = { id: b.id, ring: b.ring, cx: cx / (b.ring.length / 2), cz: cz / (b.ring.length / 2) };
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = `${i},${j}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(e);
    }
  }
  return {
    near(x, z) {
      const out = new Set();
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const e of cells.get(`${Math.floor(x / CELL) + i},${Math.floor(z / CELL) + j}`) || []) out.add(e);
      return out;
    }
  };
}

// A quad facing (nx, nz) (horizontal), centred at (cx, cy, cz), `w` × `h` metres, with the atlas cell's uv: seen from
// the front, the image's left edge is on the viewer's left (right = (nz, 0, -nx)), wound counter-clockwise
function quad(cx, cy, cz, nx, nz, w, h, c) {
  const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;
  const p = (s, t) => [cx + rx * hw * s, cy + hh * t, cz + rz * hw * s];
  const pos = [...p(-1, -1), ...p(1, -1), ...p(1, 1), ...p(-1, -1), ...p(1, 1), ...p(-1, 1)];
  const uvs = [c.u0, c.v0, c.u1, c.v0, c.u1, c.v1, c.u0, c.v0, c.u1, c.v1, c.u0, c.v1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [nx, 0, nz]).flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

export function buildShops(scene) {
  const group = new THREE.Group();
  group.name = 'Shops';
  group.userData.terrain = 'absolute'; // placed at world heights
  scene.add(group);
  // (?noshops in the URL leaves them out, for comparisons)
  if (typeof document === 'undefined' || !SHOPS_DATA.length || /[?&]noshops\b/.test(location.search)) return { group, signs: [], refine: async () => null };

  // Place each business on its wall; businesses sharing a wall line up along it
  const index = buildingIndex(), walls = new Map(), placed = [];
  for (const s of SHOPS_DATA) {
    const w = nearestWall(index, s.x, s.z);
    if (!w || w.d > MAX_DIST) continue;
    const h = 0.62 * (s.brand.scale || 1);
    placed.push({ s, w, h });
    if (!walls.has(w.key)) walls.set(w.key, []);
    walls.get(w.key).push(placed[placed.length - 1]);
  }
  const { pages, cells } = buildAtlas(placed.map((p) => p.s));
  placed.forEach((p, i) => { p.cell = cells[i]; });
  // Each sign's frame on its OSM footprint wall: centre (x, z), outward normal (nx, nz), lower edge height
  for (const list of walls.values()) {
    list.sort((a, b) => a.w.t - b.w.t);
    const { ax, az, L, nx, nz } = list[0].w, ux = (list[0].w.bx - ax) / L, uz = (list[0].w.bz - az) / L;
    // Widths (capped to the wall), then centred around the businesses' mean position along the wall
    for (const p of list) p.width = Math.min(p.h * p.cell.aspect, 9, L * 0.92 / list.length);
    for (const p of list) p.h = Math.min(p.h, p.width / p.cell.aspect * 1.0001) || p.h;
    const total = list.reduce((a, p) => a + p.width, 0) + 0.4 * (list.length - 1);
    const mean = list.reduce((a, p) => a + p.w.t, 0) / list.length * L;
    let along = Math.max(total / 2 + 0.3, Math.min(L - total / 2 - 0.3, mean)) - total / 2;
    for (const p of list) {
      const t = along + p.width / 2;
      along += p.width + 0.4;
      p.frame = { x: ax + ux * t, z: az + uz * t, nx, nz, bottom: groundHeight(ax + ux * t + nx * 2, az + uz * t + nz * 2) + BOARD_Y, facade: false };
    }
  }

  // The geometry from the frames: one mesh per atlas page (the lettering glows at dusk and night) and one for the
  // boards' bodies and brackets; rebuilt when the frames move onto the facades (refine)
  const glow = smoothstep(0.35, 1.3, cityUniforms.uInteriorGlow);
  const materials = pages.map((canvas) => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const m = new THREE.MeshStandardNodeMaterial({ map, roughness: 0.55, metalness: 0 });
    m.emissiveNode = texture(map, uv()).rgb.mul(glow.mul(1.6).add(0.06));
    return m;
  });
  const backMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x1c1d1f, roughness: 0.6, metalness: 0.4 });
  // The real logos replace the lettering as they load (assets/logos; the lettering stays where there is none)
  logoIndex().then((logos) => {
    for (const p of placed) {
      const e = logoFor(logos, p.s.brand.text, p.s.name);
      if (!e) continue;
      logoImage(e).then((img) => {
        paintLogo(pages[p.cell.page].getContext('2d'), p.cell, p.s.brand, e, img);
        materials[p.cell.page].map.needsUpdate = true;
      }).catch((error) => console.warn('[shops] logo', e.file, error));
    }
  }).catch(() => {});
  function build() {
    for (const child of [...group.children]) { child.geometry.dispose(); releaseRenderState(child); group.remove(child); }
    const boards = pages.map(() => []), backs = [];
    for (const p of placed) {
      const { nx, nz } = p.frame, ux = -nz, uz = nx; // along the wall
      const cx = p.frame.x + nx * OFFSET, cz = p.frame.z + nz * OFFSET, y = p.frame.bottom + p.h / 2;
      boards[p.cell.page].push(quad(cx, y, cz, nx, nz, p.width, p.h, p.cell));
      // The board's body: a slim dark box behind the lettering
      const back = new THREE.BoxGeometry(p.width + 0.08, p.h + 0.08, 0.1);
      back.rotateY(Math.atan2(nx, nz));
      back.translate(cx - nx * 0.06, y, cz - nz * 0.06);
      backs.push(back.toNonIndexed());
      // Hanging signs (gastronomy, hotels): a double-sided board standing out from the wall on a bracket
      if (p.s.brand.hanging) {
        const hw = Math.min(1.4, 0.42 * p.cell.aspect), hh = hw / p.cell.aspect;
        const out = 0.3 + hw / 2, side = p.width / 2 + 0.6;
        const sx = cx + nx * out + ux * side, sz = cz + nz * out + uz * side, sy = y - p.h / 2 - 0.25 - hh / 2;
        boards[p.cell.page].push(quad(sx + ux * 0.025, sy, sz + uz * 0.025, ux, uz, hw, hh, p.cell));
        boards[p.cell.page].push(quad(sx - ux * 0.025, sy, sz - uz * 0.025, -ux, -uz, hw, hh, p.cell));
        const arm = new THREE.BoxGeometry(0.05, 0.05, hw + 0.35);
        arm.rotateY(Math.atan2(nx, nz));
        arm.translate(cx + nx * (out - 0.05) + ux * side, sy + hh / 2 + 0.05, cz + nz * (out - 0.05) + uz * side);
        backs.push(arm.toNonIndexed());
      }
      p.position = { x: cx, y, z: cz };
    }
    pages.forEach((_, k) => {
      if (!boards[k].length) return;
      const mesh = new THREE.Mesh(mergeGeometries(boards[k], false), materials[k]);
      mesh.name = `Shop signs ${k}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    if (backs.length) {
      const mesh = new THREE.Mesh(mergeGeometries(backs, false), backMaterial);
      mesh.name = 'Shop sign boards';
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  build();

  /**
   * Moves the signs onto the facades of the rendered buildings (swissBUILDINGS3D, `buildings`: their group, all tiles
   * in), which often stand in front of or behind the OSM footprints the signs were laid out on: from the street side
   * (12 m out along the sign's normal) a horizontal ray at board height runs back towards the wall; the first facade
   * facing the street within 40 m takes the board, 6 cm off it and turned along it. The board's lower edge stays 4.5 m
   * above the ground at the facade, lowered (to 2.6 m at the least) where the building is lower than the board. Signs
   * whose ray finds no facade keep their place. Runs in slices so as not to stall the frame; resolves with the counts.
   */
  async function refine(buildings) {
    const tiles = buildings.children.filter((m) => m.isMesh && m.geometry.boundingBox);
    const raycaster = new THREE.Raycaster(), origin = new THREE.Vector3(), dir = new THREE.Vector3();
    const hitAt = (x, y, z, nx, nz) => {
      origin.set(x + nx * 12, y, z + nz * 12); dir.set(-nx, 0, -nz);
      raycaster.set(origin, dir); raycaster.far = 40;
      // Only the tiles whose bounds the ray crosses
      const x0 = Math.min(origin.x, origin.x - nx * 40), x1 = Math.max(origin.x, origin.x - nx * 40);
      const z0 = Math.min(origin.z, origin.z - nz * 40), z1 = Math.max(origin.z, origin.z - nz * 40);
      const near = tiles.filter((m) => { const b = m.geometry.boundingBox; return b.max.x >= x0 && b.min.x <= x1 && b.max.z >= z0 && b.min.z <= z1 && b.min.y <= y && b.max.y >= y; });
      for (const hit of raycaster.intersectObjects(near, false)) {
        const n = hit.face?.normal;
        if (!n) continue;
        const hn = Math.hypot(n.x, n.z);
        if (hn < 0.7 || (n.x * nx + n.z * nz) / hn < 0.5) continue; // not a wall facing the street
        return { x: hit.point.x, z: hit.point.z, nx: n.x / hn, nz: n.z / hn, d: hit.distance };
      }
      return null;
    };
    let hits = 0, lowered = 0;
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i], f = p.frame;
      const hit = hitAt(f.x, f.bottom + p.h / 2, f.z, f.nx, f.nz);
      if (hit) {
        let bottom = groundHeight(hit.x + hit.nx * 2, hit.z + hit.nz * 2) + BOARD_Y;
        // A low building: bring the board down until its top edge is on the facade
        while (bottom > groundHeight(hit.x + hit.nx * 2, hit.z + hit.nz * 2) + 2.6 && !hitAt(hit.x, bottom + p.h + 0.1, hit.z, hit.nx, hit.nz)) { bottom -= 0.4; lowered++; }
        p.frame = { x: hit.x + hit.nx * (0.06 - OFFSET), z: hit.z + hit.nz * (0.06 - OFFSET), nx: hit.nx, nz: hit.nz, bottom, facade: true };
        hits++;
      }
      if (i % 12 === 11) await new Promise((r) => setTimeout(r, 0));
    }
    build();
    group.userData.stats = { ...group.userData.stats, onFacades: hits, fallback: placed.length - hits };
    console.info(`[shops] ${hits} of ${placed.length} signs moved onto the swissBUILDINGS3D facades, ${placed.length - hits} kept on the footprints`);
    return { hits, fallback: placed.length - hits, lowered };
  }

  group.userData.stats = { businesses: SHOPS_DATA.length, signs: placed.length, atlases: pages.length };
  return { group, signs: placed.map((p) => ({ name: p.s.name, kind: p.s.kind, ...p.position })), refine };
}
