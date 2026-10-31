import * as THREE from 'three/webgpu';
import { attribute, float, frontFacing, mix, select, texture, uv, vec2, vec3 } from 'three/tsl';
import { TRAFFIC_SIGNS } from './traffic-signs-data.js';
import { surfaceHeight, sidewalkRise, SIDEWALK_TOP } from './terrain.js';
import { QUALITY } from './quality.js';

// js/traffic-signs.js
// Swiss road signs after the Signalisationsverordnung (SSV) (js/traffic-signs-data.js, tools/fetch-traffic-signs.mjs:
// OSM and rules on the mapped streets): Stop (3.01), Kein Vortritt (3.02), Einfahrt verboten (2.02) with the plate
// "ausgenommen" + bus, Einbahnstrasse (4.08), Fussgängerstreifen (4.11), Parkieren gestattet (4.17), Zone 30 (2.59.1,
// "Ende" 2.59.2 on its back), 50 generell (2.30.1) with the place's name (4.27), and the VBD's yellow stop plates.
// Every sign graphic is drawn once into one canvas atlas; all the plates are one instanced quad (each instance picks
// its front and back rectangle in the atlas: the back is plain grey unless the sign is double sided), all the posts
// one instanced cylinder: two draws, and two more for the posts' shadow cascades. The plates' lower edge stands 2.1 m over the sidewalk; the posts are galvanised
// grey. Every 0.25 s only the signs within VIEW_DISTANCE of the camera are packed into the instance buffers (the
// meshes never hold zero instances: WebGPU rejects empty buffers, they are hidden instead). At night the faces glow
// faintly, as retroreflective sheeting does in the headlights. The posts are player colliders.

const VIEW_DISTANCE = 320;   // m: a 60 cm plate is ~2 px beyond this
const PLATE_BOTTOM = 2.1;    // m over the sidewalk
const PLATE_GAP = 0.05;
const POST_RADIUS = 0.03;
const CROSSWALK_DEPTH = 2.5; // js/road-network.js CROSSWALK: the stripes' depth along the road
const TILE = 256, COLS = 8, PAD = 5;

// Plate sizes in metres (SSV, inside built-up areas)
const SIZES = {
  stop: [0.6, 0.6], giveway: [0.9, 0.78], noentry: [0.6, 0.6], oneway: [0.6, 0.6], crosswalk: [0.6, 0.6],
  parking: [0.6, 0.6], exceptbus: [0.6, 0.32], zone30: [0.6, 0.9], zone30end: [0.6, 0.9], gen50: [0.6, 0.8],
  city: [1.3, 0.45], busstop: [0.6, 0.86]
};

// --- The sign graphics (canvas) -------------------------------------------------------------------------------------------
const RED = '#d0101a', BLUE = '#0b5cad', WHITE = '#f4f4f0', BLACK = '#141414', YELLOW = '#ffd200', GREEN = '#00854a';
const FONT = 'Frutiger, "Helvetica Neue", Helvetica, Arial, sans-serif';

function fitText(ctx, text, maxWidth, size, weight = 700) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 1; } while (ctx.measureText(text).width > maxWidth && s > 8);
  return s + 1;
}

function roundel(ctx, cx, cy, r, value, grey = false) {
  ctx.fillStyle = WHITE;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = grey ? '#8c8c8c' : RED;
  ctx.lineWidth = r * 0.2;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = grey ? '#8c8c8c' : BLACK;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(r * 1.05)}px ${FONT}`;
  ctx.fillText(value, cx, cy + r * 0.06);
}

function pedestrian(ctx, cx, cy, s) {
  // a walking figure, s = its height
  ctx.fillStyle = BLACK; ctx.strokeStyle = BLACK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(cx + s * 0.04, cy - s * 0.42, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = s * 0.11;
  ctx.beginPath(); ctx.moveTo(cx + s * 0.02, cy - s * 0.28); ctx.lineTo(cx - s * 0.03, cy + s * 0.04); ctx.stroke();
  ctx.lineWidth = s * 0.08;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.03, cy + s * 0.02); ctx.lineTo(cx - s * 0.2, cy + s * 0.22); ctx.lineTo(cx - s * 0.24, cy + s * 0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s * 0.03, cy + s * 0.02); ctx.lineTo(cx + s * 0.12, cy + s * 0.2); ctx.lineTo(cx + s * 0.22, cy + s * 0.42); ctx.stroke();
  ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy - s * 0.05); ctx.lineTo(cx - s * 0.06, cy - s * 0.24); ctx.lineTo(cx + s * 0.12, cy - s * 0.18); ctx.lineTo(cx + s * 0.22, cy - s * 0.04); ctx.stroke();
}

function bus(ctx, x, y, w, h) {
  // side view of a bus, facing left
  ctx.fillStyle = BLACK;
  const r = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h * 0.82); ctx.lineTo(x, y + h * 0.82); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
  ctx.fillStyle = WHITE;
  const n = 4, ww = (w * 0.78) / n;
  for (let i = 0; i < n; i++) ctx.fillRect(x + w * 0.16 + i * ww + ww * 0.12, y + h * 0.14, ww * 0.76, h * 0.3);
  ctx.fillRect(x + w * 0.03, y + h * 0.14, w * 0.09, h * 0.52); // the windscreen and door
  ctx.fillStyle = BLACK;
  for (const fx of [0.22, 0.78]) { ctx.beginPath(); ctx.arc(x + w * fx, y + h * 0.84, h * 0.16, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = WHITE;
  for (const fx of [0.22, 0.78]) { ctx.beginPath(); ctx.arc(x + w * fx, y + h * 0.84, h * 0.06, 0, Math.PI * 2); ctx.fill(); }
}

// Draws sign `kind` into the box (x, y, w, h) of the atlas
function drawSign(ctx, kind, x, y, w, h, text = '') {
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  switch (kind) {
    case 'stop': {
      const r = w / 2 / Math.cos(Math.PI / 8);
      const oct = (rr) => { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); };
      ctx.fillStyle = WHITE; oct(r); ctx.fill();
      ctx.fillStyle = RED; oct(r * 0.93); ctx.fill();
      ctx.fillStyle = WHITE;
      fitText(ctx, 'STOP', w * 0.8, Math.round(h * 0.34));
      ctx.fillText('STOP', cx, cy + h * 0.02);
      break;
    }
    case 'giveway': {
      const tri = (inset) => {
        const k = inset;
        ctx.beginPath();
        ctx.moveTo(x + k * 1.73, y + k); ctx.lineTo(x + w - k * 1.73, y + k); ctx.lineTo(cx, y + h - k * 2); ctx.closePath();
      };
      ctx.lineJoin = 'round';
      ctx.fillStyle = WHITE; tri(0); ctx.fill();
      ctx.fillStyle = RED; tri(w * 0.012); ctx.fill();
      ctx.fillStyle = WHITE; tri(w * 0.11); ctx.fill();
      break;
    }
    case 'noentry': {
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(cx, cy, w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(cx, cy, w / 2 * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WHITE; ctx.fillRect(x + w * 0.2, cy - h * 0.1, w * 0.6, h * 0.2);
      break;
    }
    case 'oneway': case 'parking': case 'crosswalk': {
      const rr = w * 0.06;
      const box = (k, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + k, y + k, w - 2 * k, h - 2 * k, Math.max(1, rr - k)); ctx.fill(); };
      box(0, WHITE); box(w * 0.025, BLUE);
      ctx.fillStyle = WHITE;
      if (kind === 'oneway') {
        // white arrow pointing up
        ctx.beginPath();
        ctx.moveTo(cx, y + h * 0.13); ctx.lineTo(cx + w * 0.25, y + h * 0.43); ctx.lineTo(cx + w * 0.09, y + h * 0.43);
        ctx.lineTo(cx + w * 0.09, y + h * 0.87); ctx.lineTo(cx - w * 0.09, y + h * 0.87); ctx.lineTo(cx - w * 0.09, y + h * 0.43);
        ctx.lineTo(cx - w * 0.25, y + h * 0.43); ctx.closePath(); ctx.fill();
      } else if (kind === 'parking') {
        ctx.font = `700 ${Math.round(h * 0.78)}px ${FONT}`;
        ctx.fillText('P', cx + w * 0.01, cy + h * 0.05);
      } else {
        // white triangle, the pedestrian on the stripes
        ctx.beginPath(); ctx.moveTo(cx, y + h * 0.1); ctx.lineTo(x + w * 0.92, y + h * 0.86); ctx.lineTo(x + w * 0.08, y + h * 0.86); ctx.closePath(); ctx.fill();
        ctx.fillStyle = BLACK;
        for (let i = 0; i < 5; i++) {
          const sx = x + w * (0.25 + i * 0.105);
          ctx.beginPath(); ctx.moveTo(sx, y + h * 0.8); ctx.lineTo(sx + w * 0.07, y + h * 0.8); ctx.lineTo(sx + w * 0.045, y + h * 0.74); ctx.lineTo(sx + w * 0.015, y + h * 0.74); ctx.closePath(); ctx.fill();
        }
        pedestrian(ctx, cx, y + h * 0.52, h * 0.38);
      }
      break;
    }
    case 'exceptbus': {
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.03); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.02); ctx.fill();
      ctx.fillStyle = BLACK;
      fitText(ctx, 'ausgenommen', w * 0.86, Math.round(h * 0.3), 600);
      ctx.fillText('ausgenommen', cx, y + h * 0.27);
      bus(ctx, cx - w * 0.2, y + h * 0.48, w * 0.4, h * 0.36);
      break;
    }
    case 'zone30': case 'zone30end': {
      const end = kind === 'zone30end';
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.04); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.03); ctx.fill();
      ctx.fillStyle = end ? '#8c8c8c' : BLACK;
      ctx.font = `700 ${Math.round(h * 0.17)}px ${FONT}`;
      ctx.fillText('ZONE', cx, y + h * 0.17);
      roundel(ctx, cx, y + h * 0.6, w * 0.36, '30', end);
      if (end) {
        ctx.strokeStyle = BLACK; ctx.lineWidth = w * 0.022;
        ctx.save(); ctx.beginPath(); ctx.rect(x + w * 0.04, y + w * 0.04, w - w * 0.08, h - w * 0.08); ctx.clip();
        for (let i = -3; i <= 3; i++) { const o = i * w * 0.07; ctx.beginPath(); ctx.moveTo(x + o, y + h); ctx.lineTo(x + w + o, y); ctx.stroke(); }
        ctx.restore();
      }
      break;
    }
    case 'gen50': {
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.04); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.03); ctx.fill();
      roundel(ctx, cx, y + h * 0.4, w * 0.34, '50');
      ctx.fillStyle = BLACK;
      fitText(ctx, 'generell', w * 0.8, Math.round(h * 0.15), 700);
      ctx.fillText('generell', cx, y + h * 0.85);
      break;
    }
    case 'city': {
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x, y, w, h, h * 0.08); ctx.fill();
      ctx.fillStyle = BLUE; ctx.beginPath(); ctx.roundRect(x + h * 0.05, y + h * 0.05, w - h * 0.1, h - h * 0.1, h * 0.05); ctx.fill();
      ctx.fillStyle = WHITE;
      fitText(ctx, text, w * 0.86, Math.round(h * 0.5));
      ctx.fillText(text, cx, cy + h * 0.03);
      break;
    }
    case 'busstop': {
      // yellow plate, the green ring with the "H"; the stop's name on a white band below
      const top = h * 0.7;
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.04); ctx.fill();
      ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, top - w * 0.03, w * 0.03); ctx.fill();
      const r = Math.min(w, top) * 0.38, hy = y + top / 2 + w * 0.005;
      ctx.strokeStyle = GREEN; ctx.lineWidth = r * 0.16;
      ctx.beginPath(); ctx.arc(cx, hy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = GREEN;
      ctx.font = `700 ${Math.round(r * 1.45)}px ${FONT}`;
      ctx.fillText('H', cx, hy + r * 0.07);
      ctx.fillStyle = WHITE; ctx.fillRect(x + w * 0.02, y + top + w * 0.005, w - w * 0.04, h - top - w * 0.025);
      ctx.fillStyle = BLACK;
      // (two lines where the name has a comma: "Davos Platz," / "Spital")
      const parts = text.split(/,\s*/);
      const lines = parts.length > 1 ? [parts[0] + ',', parts.slice(1).join(', ')] : [text];
      const lh = (h - top) / (lines.length + 0.6);
      let size = Math.round(lh * 0.95);
      for (const l of lines) size = Math.min(size, fitText(ctx, l, w * 0.9, size, 700));
      ctx.font = `700 ${size}px ${FONT}`;
      lines.forEach((l, i) => ctx.fillText(l, cx, y + top + lh * (i + 0.8)));
      break;
    }
  }
  ctx.restore();
}

function buildAtlas(keys) {
  const rows = Math.ceil(keys.length / COLS);
  const canvas = document.createElement('canvas');
  // (laid out in TILE px whatever the canvas' size: the mobile profile, js/quality.js, draws it at half the size)
  const W = TILE * COLS, H = TILE * rows;
  canvas.width = Math.round(W * QUALITY.atlasScale);
  canvas.height = Math.round(H * QUALITY.atlasScale);
  const ctx = canvas.getContext('2d');
  ctx.scale(QUALITY.atlasScale, QUALITY.atlasScale);
  const rects = new Map();
  keys.forEach((key, i) => {
    const [kind, text = ''] = key.split('|');
    const [sw, sh] = SIZES[kind];
    const max = TILE - 2 * PAD;
    const w = sw >= sh ? max : max * sw / sh, h = sw >= sh ? max * sh / sw : max;
    const x = (i % COLS) * TILE + (TILE - w) / 2, y = Math.floor(i / COLS) * TILE + (TILE - h) / 2;
    drawSign(ctx, kind, x, y, w, h, text);
    // uv rectangle (flipY: v up from the canvas' bottom), a hair inside the drawn box
    rects.set(key, [(x + 0.5) / W, 1 - (y + h - 0.5) / H, (x + w - 0.5) / W, 1 - (y + 0.5) / H]);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, rects };
}

// --- Placement ------------------------------------------------------------------------------------------------------------
/** The painted crosswalks of the traffic network (js/road-paint.js): centre, direction along the road, half width */
function crosswalksOf(network) {
  const out = [];
  for (const e of network?.paintEdges || network?.edges || []) {
    if (!(e.half > 0) || !Number.isFinite(e.sx)) continue;
    for (const [node, s] of [[e.from, -CROSSWALK_DEPTH / 2], [e.to, e.len + CROSSWALK_DEPTH / 2]]) {
      if (!node || node.shape) continue;
      out.push({ x: e.sx + e.dx * s, z: e.sz + e.dz * s, dx: e.dx, dz: e.dz, half: e.half });
    }
  }
  return out;
}

/** Moves (x, z) along the road out of any painted crosswalk (and the curb ramps at its ends) */
function clearOfCrosswalks(p, crosswalks, cells) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of cells.get(Math.floor(p.x / 32) * 65536 + Math.floor(p.z / 32)) || []) {
      const ox = p.x - c.x, oz = p.z - c.z;
      const along = ox * c.dx + oz * c.dz, across = Math.abs(-ox * c.dz + oz * c.dx);
      const reach = CROSSWALK_DEPTH / 2 + 0.6;
      if (Math.abs(along) >= reach || across > c.half + 3.5) continue;
      const push = (along >= 0 ? 1 : -1) * (reach + 0.05) - along;
      p.x += c.dx * push; p.z += c.dz * push;
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

/**
 * Builds the signs. `network`: the traffic network (trafficSystem.network) for the painted crosswalks; `night`: the
 * lighting's night factor uniform (0 day … 1 night). Returns { group, update(cameraPosition), colliders, stats }.
 */
export function buildTrafficSigns(scene, { network = null, night = null } = {}) {
  const group = new THREE.Group();
  group.name = 'TrafficSigns';
  group.userData.terrain = 'absolute'; // placed on the relief here
  scene.add(group);
  const list = TRAFFIC_SIGNS?.signs || [];
  if (!list.length) return { group, update() {}, colliders: [], stats: { posts: 0, plates: 0 } };

  // Atlas keys: one per graphic (the stop plates and town signs per name)
  const keyOf = (kind, s) => (kind === 'busstop' || kind === 'city' ? `${kind}|${s.text || ''}` : kind);
  const keys = [];
  for (const s of list) for (const k of [...s.plates.map((p) => keyOf(p, s)), ...(s.back ? [s.back] : [])]) if (!keys.includes(k)) keys.push(k);
  const { tex, rects } = buildAtlas(keys);

  // Crosswalk lookup (32 m cells, each crosswalk in the cells around it)
  const crosswalks = crosswalksOf(network);
  const cells = new Map();
  for (const c of crosswalks) {
    const r = c.half + 4;
    for (let ix = Math.floor((c.x - r) / 32); ix <= Math.floor((c.x + r) / 32); ix++) for (let iz = Math.floor((c.z - r) / 32); iz <= Math.floor((c.z + r) / 32); iz++) {
      const k = ix * 65536 + iz;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(c);
    }
  }

  // Per post: its matrix and its plates' (matrix, front rect, back rect)
  const posts = [];
  const plates = [];
  const colliders = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let moved = 0;
  for (const s of list) {
    // (the plates face along (sin yaw, cos yaw): the crosswalk test moves the post along the road, i.e. across that)
    const p = clearOfCrosswalks({ x: s.x, z: s.z }, crosswalks, cells);
    if (p.x !== s.x || p.z !== s.z) moved++;
    const y = surfaceHeight(p.x, p.z) + Math.max(SIDEWALK_TOP, sidewalkRise(p.x, p.z));
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    q.setFromAxisAngle(up, s.yaw);
    // Plates from the bottom up (listed top down)
    let top = y + PLATE_BOTTOM;
    const first = plates.length;
    for (let i = s.plates.length - 1; i >= 0; i--) {
      const kind = s.plates[i], [w, h] = SIZES[kind];
      pos.set(p.x + fx * (POST_RADIUS + 0.012), top + h / 2, p.z + fz * (POST_RADIUS + 0.012));
      m.compose(pos, q, scl.set(w, h, 1));
      const back = i === 0 && s.back ? rects.get(s.back) : null;
      plates.push({ matrix: m.toArray(), front: rects.get(keyOf(kind, s)), back: back || [-1, -1, -1, -1] });
      top += h + PLATE_GAP;
    }
    const height = top - PLATE_GAP - y + 0.3; // (from 0.3 m below the surface)
    m.compose(pos.set(p.x, y - 0.3, p.z), q, scl.set(1, height, 1));
    posts.push({ x: p.x, y, z: p.z, yaw: s.yaw, kind: s.t, road: s.road, text: s.text, matrix: m.toArray(), plates: [first, plates.length] });
    const r = POST_RADIUS + 0.05;
    colliders.push({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, baseY: y, minY: y - 0.3, maxY: y + height - 0.3 });
  }

  // Meshes (capacity: all of them; drawn: the ones near the camera)
  const postMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x9a9ea2, roughness: 0.45, metalness: 0.55 });
  const postGeometry = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, 1, 8, 1, false).translate(0, 0.5, 0);
  const postMesh = new THREE.InstancedMesh(postGeometry, postMaterial, posts.length);
  postMesh.name = 'Traffic sign posts';
  postMesh.castShadow = true;
  postMesh.receiveShadow = true;

  const plateGeometry = new THREE.PlaneGeometry(1, 1);
  const aFront = new THREE.InstancedBufferAttribute(new Float32Array(plates.length * 4), 4);
  const aBack = new THREE.InstancedBufferAttribute(new Float32Array(plates.length * 4), 4);
  plateGeometry.setAttribute('aFront', aFront);
  plateGeometry.setAttribute('aBack', aBack);
  const plateMaterial = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.42, metalness: 0 });
  {
    const front = attribute('aFront', 'vec4'), back = attribute('aBack', 'vec4');
    const hasBack = back.x.greaterThanEqual(0);
    // the back face mirrors u; a plain back samples the front's shape (for its outline) and is grey
    const rect = select(frontFacing, front, select(hasBack, back, front));
    const u = select(frontFacing, uv().x, uv().x.oneMinus());
    const t = texture(tex, vec2(mix(rect.x, rect.z, u), mix(rect.y, rect.w, uv().y)));
    const face = frontFacing.or(hasBack);
    plateMaterial.colorNode = select(face, t.rgb, vec3(0.42, 0.43, 0.44));
    plateMaterial.opacityNode = t.a;
    plateMaterial.alphaTest = 0.5;
    // Retroreflective sheeting: the faces stay readable at night
    if (night) plateMaterial.emissiveNode = select(face, t.rgb.mul(night).mul(float(0.12)), vec3(0));
  }
  const plateMesh = new THREE.InstancedMesh(plateGeometry, plateMaterial, plates.length);
  plateMesh.name = 'Traffic sign plates';
  // (the posts' shadows are enough: the plates casting too would add two draws per frame, one per shadow cascade)
  plateMesh.castShadow = false;
  plateMesh.receiveShadow = true;
  group.add(postMesh, plateMesh);

  // Packs the posts within VIEW_DISTANCE (all of them before the first update: the shaders compile with every one in)
  function fill(test) {
    const pm = postMesh.instanceMatrix.array, lm = plateMesh.instanceMatrix.array;
    let n = 0, k = 0;
    for (const post of posts) {
      if (test && !test(post)) continue;
      pm.set(post.matrix, n * 16);
      n++;
      for (let i = post.plates[0]; i < post.plates[1]; i++) {
        const pl = plates[i];
        lm.set(pl.matrix, k * 16);
        aFront.array.set(pl.front, k * 4);
        aBack.array.set(pl.back, k * 4);
        k++;
      }
    }
    postMesh.count = Math.max(1, n);
    plateMesh.count = Math.max(1, k);
    postMesh.visible = plateMesh.visible = n > 0;
    postMesh.instanceMatrix.needsUpdate = plateMesh.instanceMatrix.needsUpdate = true;
    aFront.needsUpdate = aBack.needsUpdate = true;
    if (n) { postMesh.computeBoundingSphere(); plateMesh.computeBoundingSphere(); }
    return n;
  }
  fill(null);

  let last = -1e9, lastX = Infinity, lastZ = Infinity, shown = posts.length;
  const R2 = VIEW_DISTANCE * VIEW_DISTANCE;
  function update(camera) {
    const now = performance.now();
    if (now - last < 250 || Math.hypot(camera.x - lastX, camera.z - lastZ) < 4) return;
    last = now; lastX = camera.x; lastZ = camera.z;
    shown = fill((p) => {
      const dx = p.x - camera.x, dy = p.y - camera.y, dz = p.z - camera.z;
      return dx * dx + dy * dy + dz * dz < R2;
    });
  }

  const counts = {};
  for (const s of list) for (const p of s.plates) counts[p] = (counts[p] || 0) + 1;
  const stats = { posts: posts.length, plates: plates.length, tiles: keys.length, movedOffCrosswalks: moved, counts, get shown() { return shown; } };
  group.userData.stats = stats;
  console.info(`[traffic-signs] ${posts.length} posts, ${plates.length} plates (${keys.length} graphics), ${moved} moved off crosswalks`);
  return { group, update, colliders, stats, posts };
}
