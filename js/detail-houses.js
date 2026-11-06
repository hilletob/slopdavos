import * as THREE from 'three/webgpu';
import { abs, dot, float, floor, fract, hash, mix, mx_noise_float, normalWorld, positionWorld, smoothstep, step, texture, time, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { snowyRoof } from './season.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { DETAIL_HOUSES, facadeLayout, facadeUV, frame, scanRoofY, toWorld } from './detail-houses-data.js';

// Hand-built houses standing in for their swissBUILDINGS3D volumes (which are left out of the streamed tiles:
// js/swissbuildings3d.js excludeBuildings). The first: Dischmastrasse 19 in Davos Dorf, a larch chalet in Strickbau on
// a white plastered basement, built to the measures of the owner's 3D scan and wearing photographs of its own walls
// baked out of it — a low Davos roof on wide eaves with a chimney, a lean-to (Schopf) on the south front, a porch with
// the front door, a closed Laube and the outdoor stair on the east gable, a balcony on the west gable, windows set back
// in the logs, lit at night, gutters, and a picket fence along the street. Built in the house's
// local frame (frame(): x along the ridge, z to the front, y up from the ground).

excludeBuildings(DETAIL_HOUSES.map((h) => h.exclude));

// --- Materials (colours in linear space) -----------------------------------------------------------------------------------
// The larch of the procedural facades round about (js/swissbuildings3d.js createMaterial: its `wood`), so that the house
// sits among its neighbours in the same colours: the tone between the same two browns by the same grain noise, the
// seams of the logs (every 16.5 cm, as measured on the house) and of the boards darkened like their board joints
function larch(seamNode, seamDepth = 0.35) {
  const grain = mx_noise_float(positionWorld.mul(vec3(0.6, 4, 0.6))).mul(0.5).add(0.5);
  const tone = mix(vec3(0.2, 0.11, 0.05), vec3(0.33, 0.2, 0.1), grain);
  const seam = smoothstep(0.42, 0.5, abs(fract(seamNode).sub(0.5)));
  return { tone, seamed: tone.mul(float(1).sub(seam.mul(seamDepth))) };
}
function materials() {
  const weather = mx_noise_float(positionWorld.mul(0.35)).mul(0.5).add(0.5);
  const along = positionWorld.x.mul(normalWorld.z.abs()).add(positionWorld.z.mul(normalWorld.x.abs()));
  // Strickbau: squared logs ~16.5 cm high, seams between them — the walls until (or without) their photographs
  const facade = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  facade.colorNode = larch(positionWorld.y.div(0.165)).seamed;
  // Boards (the balcony, the stair, the fascias, the porch's north side)
  const boards = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  boards.colorNode = larch(along.div(0.14)).seamed;
  const plaster = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  plaster.colorNode = mix(vec3(0.66, 0.65, 0.62), vec3(0.76, 0.75, 0.72), weather);
  // Roof: eternit slates in courses, the slate grey of the neighbours' roofs (js/swissbuildings3d.js roofColor), snow on
  // them in winter
  const roof = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0.05 });
  const course = smoothstep(0.42, 0.5, abs(fract(positionWorld.y.div(0.11)).sub(0.5)));
  roof.colorNode = snowyRoof(mix(vec3(0.05, 0.053, 0.06), vec3(0.075, 0.079, 0.088), weather).mul(float(1).sub(course.mul(0.3))), float(1));
  // The frames, the reveals and the sills: the white of the neighbours' window frames
  const frameMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
  frameMat.colorNode = vec3(0.8, 0.79, 0.76);
  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x5a3018, roughness: 0.45, metalness: 0.6 });
  const chimney = new THREE.MeshStandardNodeMaterial({ color: 0x3a2418, roughness: 0.9, metalness: 0 });
  // The fence and the garage door: the same larch, the fence greyed by the weather
  const fence = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  fence.colorNode = mix(larch(along.div(0.115)).tone, vec3(0.16, 0.14, 0.11), weather.mul(0.5));
  const door = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  door.colorNode = larch(along.div(0.12), 0.25).seamed;
  return { facade, boards, plaster, roof, frame: frameMat, glass: glassMaterial(), metal, chimney, fence, door };
}

// --- Geometry builder: parts collected per material, merged into one mesh each ---------------------------------------------
class Builder {
  constructor() { this.parts = new Map(); }
  add(mat, g) {
    g = g.index ? g.toNonIndexed() : g;
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'uv1'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  // A box: size (sx, sy, sz), centre (x, y, z), turned by ry about y and rx about x
  box(mat, sx, sy, sz, x, y, z, { ry = 0, rx = 0, rz = 0 } = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  meshes(M) {
    return [...this.parts].map(([key, list]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), M[key]);
      mesh.castShadow = key !== 'glass';
      mesh.receiveShadow = true;
      mesh.name = `detail ${key}`;
      return mesh;
    });
  }
}

// --- Dischmastrasse 19 ---------------------------------------------------------------------------------------------------------
// Built to the numbers measured on the owner's 3D scan (js/detail-houses-data.js model), in the house's local frame
// (x along the ridge to the east gable, z to the south front, y up from the ground). The walls are flat pieces wearing
// the photographs baked out of the scan (assets/models/dischmastrasse-19-facades.jpg, tools/build-detail-house-scan.mjs:
// their uv from facadeUV()); the windows are cut into them, with reveals, sills and glass set back (the sky in the
// panes by day, lit at night, as in the neighbours' windows).

// The faces: the outward axis and its sign, and how the shape's x runs along the wall (so that ShapeGeometry's +z
// turns outward)
const FACES = {
  S: { axis: 'z', out: 1, flip: 1 }, N: { axis: 'z', out: -1, flip: -1 },
  E: { axis: 'x', out: 1, flip: -1 }, W: { axis: 'x', out: -1, flip: 1 }
};

// A flat piece of wall: the polygon `pts` ([a, y]: a along the face, x on S/N, z on E/W) on the plane at `plane` of
// face `face`, with rectangular holes ([a0, a1, y0, y1]); uv from the bake `bake` (none: zeros)
function wallPiece(face, plane, pts, holes, bake = null, ctx = null) {
  const F = FACES[face];
  const shape = new THREE.Shape(pts.map(([a, y]) => new THREE.Vector2(F.flip * a, y)));
  for (const [a0, a1, y0, y1] of holes) {
    shape.holes.push(new THREE.Path([[a0, y0], [a1, y0], [a1, y1], [a0, y1]].map(([a, y]) => new THREE.Vector2(F.flip * a, y))));
  }
  const g = new THREE.ShapeGeometry(shape).toNonIndexed();
  const p = g.attributes.position, n = p.count;
  const nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = F.flip * p.getX(i), y = p.getY(i);
    if (F.axis === 'z') p.setXYZ(i, a, y, plane); else p.setXYZ(i, plane, y, a);
    nor[i * 3 + (F.axis === 'z' ? 2 : 0)] = F.out;
    if (bake) [uvs[i * 2], uvs[i * 2 + 1]] = facadeUV(ctx.layout, ctx.bakes[bake], bake, a, y);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

// A quad from four corners (counter-clockwise seen from where it faces), flat-shaded
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}

// A point of face `face` at (a, y), `d` out from its plane
function onFace(face, plane, a, y, d = 0) {
  const F = FACES[face], o = plane + F.out * d;
  return F.axis === 'z' ? [a, y, o] : [o, y, a];
}

// A window in a wall piece: the reveal round the hole back to the glass `depth` behind the plane, the sill, the glass
// (uv: 0–1 over the pane; uv1.x: the window's number for the night light, uv1.y: 1 for a cellar window in the plinth)
function windowIn(B, glassParts, face, plane, [a0, a1, y0, y1], depth, id, bake, ctx) {
  const P = (a, y, d) => onFace(face, plane, a, y, d);
  const F = FACES[face];
  const ring = [[a0, y0], [a1, y0], [a1, y1], [a0, y1]], mid = P((a0 + a1) / 2, (y0 + y1) / 2, -depth / 2);
  for (let k = 0; k < 4; k++) {
    const [pa, py] = ring[k], [qa, qy] = ring[(k + 1) % 4];
    const c = [P(pa, py, 0), P(qa, qy, 0), P(qa, qy, -depth), P(pa, py, -depth)];
    // (facing into the opening)
    const e1 = c[1].map((v, j) => v - c[0][j]), e2 = c[3].map((v, j) => v - c[0][j]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const toMid = mid.map((v, j) => v - (c[0][j] + c[2][j]) / 2);
    B.add('frame', n[0] * toMid[0] + n[1] * toMid[1] + n[2] * toMid[2] > 0 ? quad(...c) : quad(c[0], c[3], c[2], c[1]));
  }
  // the sill, standing out under it
  const [sx, sy, sz] = P((a0 + a1) / 2, y0 - 0.025, 0.05);
  const w = a1 - a0 + 0.12;
  B.box('frame', F.axis === 'z' ? w : 0.14, 0.05, F.axis === 'z' ? 0.14 : w, sx, sy, sz);
  const g = wallPiece(face, plane - F.out * depth, [[a0, y0], [a1, y0], [a1, y1], [a0, y1]], []);
  const n = g.attributes.position.count, uv1 = new Float32Array(n * 2);
  const p = g.attributes.position, uvs = g.attributes.uv;
  for (let i = 0; i < n; i++) {
    uv1[i * 2] = id; uv1[i * 2 + 1] = bake ? 0 : 1;
    const a = F.axis === 'z' ? p.getX(i) : p.getZ(i);
    uvs.setXY(i, (a - a0) / (a1 - a0), (p.getY(i) - y0) / (y1 - y0));
  }
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  glassParts.push(g);
}

// The walls as pieces: face, plane, outline, the bake its photograph comes from (null: the material alone), how deep
// its windows sit, whether windows may sit in it
function wallPieces(m) {
  const { walls, roof, plinthTop: pT, leanTo, porch, laube } = m;
  const t = roof.thickness, under = (z) => scanRoofY(roof, z) - t - 0.02;
  const [x0, x1] = walls.x, [z0, z1] = walls.z, rz = roof.ridgeZ;
  const gable = (extra) => [[z0, pT], ...extra, [z1, under(z1)], [rz, under(rz)], [z0, under(z0)]];
  const leanTop = (z) => { const r = m.leanRoofs[0]; return r.y0 + (r.y1 - r.y0) * (z - r.z[0]) / (r.z[1] - r.z[0]) - 0.14; };
  const porchTop = (x) => { const r = m.leanRoofs[1]; return r.y0 + (r.y1 - r.y0) * (x - r.x[0]) / (r.x[1] - r.x[0]) - 0.14; };
  const P = (face, plane, pts, bake, depth) => ({ face, plane, pts, bake, depth });
  return [
    // the log walls above the plinth (the west one runs on along the lean-to's side, flush with it)
    P('S', z1, [[x0, pT], [x1, pT], [x1, under(z1)], [x0, under(z1)]], 'S', 0.18),
    P('N', z0, [[x0, pT], [x1, pT], [x1, under(z0)], [x0, under(z0)]], 'N', 0.18),
    P('W', x0, gable([[leanTo.z[1], pT], [leanTo.z[1], leanTop(leanTo.z[1])], [z1, leanTop(z1)]]), 'W', 0.18),
    P('E', x1, gable([[z1, pT]]), 'E', 0.18),
    // the plinth, plastered, 3 cm proud, 1.5 m into the ground
    P('S', z1 + 0.03, [[leanTo.x[1], -1.5], [x1 + 0.03, -1.5], [x1 + 0.03, pT], [leanTo.x[1], pT]], null, 0.12),
    P('N', z0 - 0.03, [[x0 - 0.03, -1.5], [x1 + 0.03, -1.5], [x1 + 0.03, pT], [x0 - 0.03, pT]], null, 0.12),
    P('W', x0 - 0.03, [[z0 - 0.03, -1.5], [leanTo.z[1], -1.5], [leanTo.z[1], pT], [z0 - 0.03, pT]], null, 0.12),
    P('E', x1 + 0.03, [[z0 - 0.03, -1.5], [z1 + 0.03, -1.5], [z1 + 0.03, pT], [z0 - 0.03, pT]], null, 0.12),
    // the lean-to: its front and its east side photographed down to the ground
    P('S', leanTo.z[1], [[leanTo.x[0], -1.5], [leanTo.x[1], -1.5], [leanTo.x[1], leanTop(leanTo.z[1])], [leanTo.x[0], leanTop(leanTo.z[1])]], 'S', 0.12),
    P('E', leanTo.x[1], [[leanTo.z[0], -1.5], [leanTo.z[1], -1.5], [leanTo.z[1], leanTop(leanTo.z[1])], [leanTo.z[0], leanTop(leanTo.z[0])]], 'leanToE', 0.1),
    // the porch with the front door (its south side), its north side boarded
    P('E', porch.x[1], [[porch.z[0], -1.5], [porch.z[1], -1.5], [porch.z[1], porchTop(porch.x[1])], [porch.z[0], porchTop(porch.x[1])]], 'porchE', 0.1),
    P('S', porch.z[1], [[porch.x[0], -1.5], [porch.x[1], -1.5], [porch.x[1], porchTop(porch.x[1])], [porch.x[0], porch.top]], 'porchS', 0.08),
    P('N', porch.z[0], [[porch.x[0], -1.5], [porch.x[1], -1.5], [porch.x[1], porchTop(porch.x[1])], [porch.x[0], porch.top]], null, 0.08),
    // the Laube: its east and south sides photographed, its north side above the porch boarded
    P('E', laube.x[1], [[laube.z[0], laube.floor], [laube.z[1], laube.floor], [laube.z[1], under(laube.z[1])], [laube.z[0], under(laube.z[0])]], 'E', 0.1),
    P('S', laube.z[1], [[laube.x[0], laube.floor], [laube.x[1], laube.floor], [laube.x[1], under(laube.z[1])], [laube.x[0], under(laube.z[1])]], 'S', 0.1),
    P('N', laube.z[0], [[laube.x[0], porch.top], [laube.x[1], porch.top], [laube.x[1], under(laube.z[0])], [laube.x[0], under(laube.z[0])]], null, 0.1)
  ];
}

function buildDischmastrasse19(B, glassParts, m, ctx) {
  const { walls, roof } = m;
  const pieces = wallPieces(m);
  const inside = (pts, a0, a1, y0, y1) => {
    const as = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return a0 >= Math.min(...as) - 1e-6 && a1 <= Math.max(...as) + 1e-6 && y0 >= Math.min(...ys) - 1e-6 && y1 <= Math.max(...ys) + 1e-6;
  };
  // each window in the outermost piece of its face that holds it
  const holes = new Map(pieces.map((p) => [p, []]));
  m.windows.forEach(([face, a0, a1, y0, y1], i) => {
    const F = FACES[face];
    const host = pieces.filter((p) => p.face === face && inside(p.pts, a0, a1, y0, y1)).sort((p, q) => F.out * (q.plane - p.plane))[0];
    if (!host) throw new Error(`window ${i}: no wall holds it`);
    holes.get(host).push({ rect: [a0, a1, y0, y1], id: i + 1 });
  });
  for (const p of pieces) {
    const hs = holes.get(p);
    B.add(p.bake ? 'facade' : (p.depth === 0.12 ? 'plaster' : 'boards'), wallPiece(p.face, p.plane, p.pts, hs.map((h) => h.rect), p.bake, ctx));
    for (const h of hs) windowIn(B, glassParts, p.face, p.plane, h.rect, p.depth, h.id, p.bake || null, ctx);
  }
  // the garage door in the plinth
  for (const [face, a0, a1, y0, y1] of m.doors) {
    const F = FACES[face], plane = (F.axis === 'z' ? walls.z : walls.x)[F.out > 0 ? 1 : 0] + F.out * 0.05;
    const [cx, cy, cz] = onFace(face, plane, (a0 + a1) / 2, (y0 + y1) / 2, 0);
    B.box('door', F.axis === 'z' ? a1 - a0 : 0.06, y1 - y0, F.axis === 'z' ? 0.06 : a1 - a0, cx, cy, cz);
  }

  // The roof: two slopes from the ridge out to the eaves, fascias, gutters, barge boards, the ridge cap
  const t = roof.thickness, angle = Math.atan(roof.slope);
  const rx0 = roof.x[0], rx1 = roof.x[1], len = rx1 - rx0, xm = (rx0 + rx1) / 2;
  for (const [zEdge, side] of [[roof.z[0], -1], [roof.z[1], 1]]) {
    const run = Math.abs(zEdge - roof.ridgeZ), slope = run / Math.cos(angle);
    const g = new THREE.BoxGeometry(len, t, slope + 0.1);
    g.rotateX(side * angle);
    const zm = (zEdge + roof.ridgeZ) / 2;
    g.translate(xm, scanRoofY(roof, zm) - t / 2 / Math.cos(angle), zm);
    B.add('roof', g);
    const yEdge = scanRoofY(roof, zEdge);
    B.box('boards', len, 0.24, 0.05, xm, yEdge - 0.12, zEdge + side * 0.02);
    const gutter = new THREE.CylinderGeometry(0.07, 0.07, len, 8, 1, true, 0, Math.PI);
    gutter.rotateZ(Math.PI / 2); gutter.rotateX(Math.PI);
    gutter.translate(xm, yEdge - 0.15, zEdge + side * 0.1);
    B.add('metal', gutter);
    for (const x of [rx0, rx1]) {
      const b = new THREE.BoxGeometry(0.05, 0.28, slope);
      b.rotateX(side * angle);
      b.translate(x, scanRoofY(roof, zm) - 0.1, zm);
      B.add('boards', b);
    }
    // the rafters' ends under the eaves, every 0.9 m
    const zIn = side < 0 ? walls.z[0] : walls.z[1], zr = (zIn + zEdge) / 2;
    for (let x = rx0 + 0.3; x < rx1; x += 0.9) {
      const r = new THREE.BoxGeometry(0.1, 0.14, Math.abs(zEdge - zIn) / Math.cos(angle));
      r.rotateX(side * angle);
      r.translate(x, scanRoofY(roof, zr) - t / Math.cos(angle) - 0.07, zr);
      B.add('boards', r);
    }
  }
  B.box('roof', len, 0.06, 0.3, xm, roof.ridgeY + 0.01, roof.ridgeZ);
  // the chimney, just north of the ridge
  const cx = -1.6, cz = roof.ridgeZ - 0.7, foot = scanRoofY(roof, cz) - 0.3;
  B.box('chimney', 0.6, 1.5, 0.6, cx, foot + 0.75, cz);
  B.box('metal', 0.85, 0.05, 0.85, cx, foot + 1.72, cz);
  for (const [dx, dz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) B.box('metal', 0.04, 0.2, 0.04, cx + dx, foot + 1.6, cz + dz);
  // the mono-pitch roofs over the lean-to and the porch, their fascias at the low edge
  for (const r of m.leanRoofs) {
    const alongZ = r.fall === 'z', [a0, a1] = alongZ ? r.z : r.x, [b0, b1] = alongZ ? r.x : r.z;
    const run = a1 - a0, drop = r.y0 - r.y1, slope = Math.hypot(run, drop), tilt = Math.atan2(drop, run);
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2, ym = (r.y0 + r.y1) / 2 - 0.06 / Math.cos(tilt);
    if (alongZ) {
      const g = new THREE.BoxGeometry(b1 - b0, 0.12, slope);
      g.rotateX(tilt); // (falling towards +z)
      g.translate(bm, ym, am);
      B.add('roof', g);
      B.box('boards', b1 - b0, 0.18, 0.04, bm, r.y1 - 0.1, a1 + 0.02);
    } else {
      const g = new THREE.BoxGeometry(slope, 0.12, b1 - b0);
      g.rotateZ(-tilt); // (falling towards +x)
      g.translate(am, ym, bm);
      B.add('roof', g);
      B.box('boards', 0.04, 0.18, b1 - b0, a1 + 0.02, r.y1 - 0.1, bm);
    }
  }
  // the porch's top under the gable's overhang (west of its own roof)
  const { porch, laube, landing, stair, balcony, leanTo } = m;
  B.box('boards', m.leanRoofs[1].x[0] - porch.x[0], 0.1, porch.z[1] - porch.z[0], (porch.x[0] + m.leanRoofs[1].x[0]) / 2, porch.top, (porch.z[0] + porch.z[1]) / 2);
  // the lean-to's top under its roof
  B.box('boards', leanTo.x[1] - leanTo.x[0], 0.08, leanTo.z[1] - leanTo.z[0], (leanTo.x[0] + leanTo.x[1]) / 2, leanTo.top - 0.25, (leanTo.z[0] + leanTo.z[1]) / 2);

  // The Laube's floor and its two posts
  B.box('boards', laube.x[1] - laube.x[0], 0.14, laube.z[1] - laube.z[0], (laube.x[0] + laube.x[1]) / 2, laube.floor - 0.07, (laube.z[0] + laube.z[1]) / 2);
  for (const z of [laube.z[0] + 1.1, laube.z[1] - 0.1]) B.box('boards', 0.14, laube.floor, 0.14, laube.x[1] - 0.08, laube.floor / 2, z);
  // The landing before the door, on posts, and the stair down to the south: treads, stringers, the hand rail
  const ly = landing.y;
  B.box('boards', landing.x[1] - landing.x[0], 0.1, landing.z[1] - landing.z[0], (landing.x[0] + landing.x[1]) / 2, ly - 0.05, (landing.z[0] + landing.z[1]) / 2);
  for (const [x, z] of [[landing.x[1] - 0.07, landing.z[1] - 0.07], [landing.x[0] + 0.07, landing.z[1] - 0.07]]) B.box('boards', 0.12, ly, 0.12, x, ly / 2, z);
  const run = stair.z[1] - stair.z[0], steps = Math.round(ly / 0.18), rise = ly / steps, tread = run / steps;
  const sw = stair.x[1] - stair.x[0], sxm = (stair.x[0] + stair.x[1]) / 2;
  for (let i = 0; i < steps - 1; i++) B.box('boards', sw - 0.1, 0.05, tread + 0.04, sxm, ly - rise * (i + 1) - 0.025, stair.z[0] + tread * (i + 0.5));
  const len2 = Math.hypot(run, ly), tilt2 = Math.atan2(ly, run);
  for (const x of stair.x) {
    const g = new THREE.BoxGeometry(0.06, 0.24, len2);
    g.rotateX(tilt2); // (high at the landing, low to the south)
    g.translate(x, ly / 2 - 0.05, (stair.z[0] + stair.z[1]) / 2);
    B.add('boards', g);
    const rail = new THREE.BoxGeometry(0.05, 0.05, len2);
    rail.rotateX(tilt2);
    rail.translate(x, ly / 2 + 0.9, (stair.z[0] + stair.z[1]) / 2);
    B.add('boards', rail);
    for (const [z, y] of [[stair.z[0], ly], [stair.z[1], 0]]) B.box('boards', 0.05, 0.95, 0.05, x, y + 0.45, z);
  }
  // The landing's rail along its east side
  B.box('boards', 0.05, 0.05, landing.z[1] - landing.z[0], landing.x[1] - 0.03, ly + 0.92, (landing.z[0] + landing.z[1]) / 2);
  B.box('boards', 0.05, 0.92, 0.05, landing.x[1] - 0.03, ly + 0.46, landing.z[0] + 0.03);

  // The balcony on the west gable: floor on two beams, a balustrade of boards, its top rail
  const bx0 = balcony.x[0], bxm = (balcony.x[0] + balcony.x[1]) / 2, bzm = (balcony.z[0] + balcony.z[1]) / 2;
  const bw = balcony.z[1] - balcony.z[0], out = balcony.x[1] - balcony.x[0], fy = balcony.floor, rh = balcony.rail - fy;
  B.box('boards', out, 0.12, bw, bxm, fy - 0.06, bzm);
  for (const z of [balcony.z[0] + 0.25, balcony.z[1] - 0.25]) B.box('boards', out + 0.3, 0.18, 0.14, bxm + 0.15, fy - 0.2, z);
  B.box('boards', 0.05, rh, bw, bx0 + 0.03, fy + rh / 2, bzm);
  for (const z of balcony.z) B.box('boards', out, rh, 0.05, bxm, fy + rh / 2, z);
  B.box('boards', 0.12, 0.06, bw + 0.1, bx0 + 0.03, balcony.rail + 0.03, bzm);
}

// --- The facade atlas ----------------------------------------------------------------------------------------------------
// Small devices (a few cores or a touch screen) decode it at half its size; once on the GPU (with its mipmaps) the
// decoded bitmap is let go
const smallDevice = typeof navigator !== 'undefined' && typeof matchMedia === 'function' &&
  (navigator.hardwareConcurrency <= 4 || matchMedia('(pointer: coarse)').matches);

async function loadAtlas(url) {
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function') throw new Error('no fetch');
  const res = await fetch(new URL(`../${url}`, import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // (the mobile profile, js/quality.js: 512 px, a sixteenth of the full atlas)
  const side = Math.min(QUALITY.facadeAtlas, smallDevice ? 1024 : Infinity);
  const bitmap = await createImageBitmap(await res.blob(), Number.isFinite(side) && side < 2048 ? { resizeWidth: side, resizeHeight: side, resizeQuality: 'high' } : undefined);
  const map = new THREE.Texture(bitmap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false; // (the atlas' uv: v down)
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 8;
  map.needsUpdate = true;
  map.onUpdate = () => {
    map.onUpdate = null;
    map.image = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
  };
  return map;
}

// The walls with their photographs, in the neighbours' colours: the photograph gives the structure (the logs and their
// seams, the shutters, the shadows under the sills, the house number) as a relief over the larch of the procedural
// facades (larch(): the same browns), damped so that the sunlight and the blotches baked into the scan don't come
// through; where the scan left no larch (grey residue at the gable's top, the sky in a pane's corner) the plain logs
// show, and the white parts (the lean-to's and the porch's plastered feet, the frames) stay white
function facadeMaterial(map) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const photo = texture(map).rgb;
  const lum = dot(photo, vec3(0.3, 0.59, 0.11));
  const woody = smoothstep(0.012, 0.045, photo.r.sub(photo.b)); // larch: red well over blue
  const white = smoothstep(0.32, 0.6, lum).mul(float(1).sub(woody)); // (the plaster and the frames, not the grey smears round the panes)
  const relief = lum.div(0.095).clamp(0.4, 1.7).sub(1).mul(0.7).add(1);
  const { tone, seamed } = larch(positionWorld.y.div(0.165));
  m.colorNode = mix(mix(seamed, tone.mul(relief), woody), photo.mul(0.8), white);
  return m;
}

// The glass, as the neighbours' panes (js/swissbuildings3d.js createMaterial, windowLights): by day the sky's gradient
// in a dark, glossy pane (the neighbours' pane runs over 0.3–0.84 of its storey: the same stretch of the gradient
// here); lit at dusk and night like theirs: each window (its number in uv1.x) on or off by its own hash, re-rolled
// every 5-15 min, lit half the time (a chalet, someone home), mostly warm 2700 K, some halogen and neutral LED, now and
// then a bluish flickering TV, curtains drawn on a third (dimmer and warmer, in folds), brighter towards the ceiling
// lamp. The cellar windows in the plinth (uv1.y = 1) are dark glass, and at night at most a dim bulb's light in the
// middle of the pane, lit less often
function glassMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.5 });
  const pane = uv(), id = floor(uv(1).x.add(0.5)), cellar = step(0.5, uv(1).y);
  const v = mix(float(0.3), float(0.84), pane.y);
  const sky = mix(vec3(0.05, 0.065, 0.085), vec3(0.22, 0.27, 0.33), v);
  m.colorNode = mix(sky, vec3(0.05, 0.05, 0.055), cellar);
  const iGlow = cityUniforms.uInteriorGlow;
  const night = smoothstep(0.7, 1.45, iGlow), late = smoothstep(1.3, 1.55, iGlow);
  const h = hash(id.add(9173)), hn = (i) => hash(h.mul(1.6e7).floor().add(i));
  const slot = time.div(mix(float(300), float(900), hn(3))).add(hn(4)).floor();
  const on = step(hash(h.mul(1.6e7).floor().add(slot.mul(7)).add(11)), mix(0.5, 0.4, late));
  const c = hn(5), tv = step(0.92, c);
  const flicker = mx_noise_float(vec3(time.mul(3.1), h.mul(97), 0)).mul(0.45).add(0.75);
  let col = mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.68, 0.38), step(0.55, c));
  col = mix(col, vec3(0.92, 0.84, 0.7), step(0.8, c));
  col = mix(col, vec3(0.36, 0.52, 1.0).mul(flicker), tv);
  const curtain = step(hn(6), 0.33);
  col = mix(col, col.mul(vec3(1.0, 0.82, 0.62)).mul(0.5).mul(pane.x.mul(40).sin().mul(0.12).add(0.88)), curtain);
  const strength = hn(7).mul(0.5).add(0.75).mul(pane.y.mul(0.35).add(0.8));
  const room = col.mul(strength).mul(on).mul(night.mul(1.15));
  // the cellar: a soft patch over the middle two thirds of the pane, a sixth as bright, on half as often
  const patch = smoothstep(0.1, 0.3, pane.x).mul(smoothstep(0.9, 0.7, pane.x)).mul(smoothstep(0.1, 0.35, pane.y)).mul(smoothstep(0.95, 0.7, pane.y));
  const bulb = vec3(1.0, 0.7, 0.4).mul(patch).mul(on).mul(step(hn(8), 0.5)).mul(night.mul(0.22));
  m.emissiveNode = mix(room, bulb, cellar);
  return m;
}

// --- Picket fence (Staketenzaun): pickets every 11.5 cm and two rails along each segment, following the ground ---------
function buildFence(group, M, house, fr, baseY) {
  const pickets = [], rails = [];
  for (const [[ax, az], [bx, bz]] of house.fence) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const yaw = Math.atan2(ux, uz); // the segment's direction, about y (a box's depth (z) along it)
    for (let t = 0; t <= len; t += 0.115) pickets.push({ x: ax + ux * t, z: az + uz * t, yaw });
    for (let t = 0; t < len; t += 2.4) {
      const te = Math.min(len, t + 2.4), x0 = ax + ux * t, z0 = az + uz * t, x1 = ax + ux * te, z1 = az + uz * te;
      const ya = groundHeight(...toWorld(fr, x0, z0)) - baseY, yb = groundHeight(...toWorld(fr, x1, z1)) - baseY;
      for (const hy of [0.25, 0.8]) {
        const g = new THREE.BoxGeometry(0.04, 0.07, te - t);
        g.rotateX(-Math.atan2(yb - ya, te - t));
        g.rotateY(yaw);
        g.translate((x0 + x1) / 2, (ya + yb) / 2 + hy, (z0 + z1) / 2);
        rails.push(g);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 1.05, 0.07), M.fence, pickets.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  pickets.forEach((p, i) => {
    const h = 0.9 + 0.09 * ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1); // slightly uneven tops
    s.set(1, h / 1.05, 1);
    q.setFromAxisAngle(up, p.yaw);
    m.compose(new THREE.Vector3(p.x, groundHeight(...toWorld(fr, p.x, p.z)) - baseY + h / 2 - 0.05, p.z), q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'detail fence pickets';
  group.add(mesh);
  const railMesh = new THREE.Mesh(mergeGeometries(rails.map((g) => g.toNonIndexed()), false), M.fence);
  railMesh.castShadow = railMesh.receiveShadow = true;
  group.add(railMesh);
}


/**
 * Builds the hand-made houses into `scene`. Returns { group, colliders } (colliders in the flat-world form main.js
 * lifts onto the terrain: heights above the ground, oriented boxes).
 */
export function buildDetailHouses(scene) {
  const root = new THREE.Group();
  root.name = 'DetailHouses';
  root.userData.terrain = 'absolute';
  const M = materials(), colliders = [];
  for (const house of DETAIL_HOUSES) {
    const m = house.model;
    if (!m) continue;
    const fr = frame(house);
    // The ground: the lowest under the footprint for the group (the fence follows the ground from there); the house
    // stands on the mean of the ground round its walls (its plinth reaching down)
    const baseY = Math.min(...house.footprint.map(([x, z]) => groundHeight(x, z)));
    const ring = [];
    for (const f of [0, 0.5, 1]) {
      const x = m.walls.x[0] + (m.walls.x[1] - m.walls.x[0]) * f, z = m.walls.z[0] + (m.walls.z[1] - m.walls.z[0]) * f;
      ring.push([x, m.walls.z[0]], [x, m.walls.z[1]], [m.walls.x[0], z], [m.walls.x[1], z]);
    }
    const foot = ring.reduce((s, [x, z]) => s + groundHeight(...toWorld(fr, x, z)), 0) / ring.length - baseY;
    const group = new THREE.Group();
    group.name = house.id;
    group.position.set(fr.cx, baseY, fr.cz);
    group.rotation.y = fr.theta;
    const body = new THREE.Group();
    body.name = `${house.id} house`;
    body.position.y = foot;
    const B = new Builder(), glassParts = [];
    const ctx = { bakes: m.bakes, layout: facadeLayout(m.bakes) };
    buildDischmastrasse19(B, glassParts, m, ctx);
    const meshes = B.meshes(M);
    const glass = new THREE.Mesh(mergeGeometries(glassParts, false), M.glass);
    glass.name = 'detail glass';
    glass.receiveShadow = true;
    body.add(...meshes, glass);
    group.add(body);
    buildFence(group, M, house, fr, baseY);
    root.add(group);
    // The photographs: until they are in (or if they can't be loaded) the walls show plain logs
    const walls = meshes.find((x) => x.name === 'detail facade');
    loadAtlas(m.atlas)
      .then((map) => { walls.material = facadeMaterial(map); })
      .catch((error) => console.warn(`[detail-houses] ${house.id}: the facade photographs were not loaded, plain walls`, error));
    // Colliders: the walls up to the ridge, the lean-to, the porch, the Laube, the landing and the stair, the fence
    const cs = Math.cos(fr.theta), sn = Math.sin(fr.theta);
    const box = ({ x, z }, maxY) => {
      const [cx, cz] = toWorld(fr, (x[0] + x[1]) / 2, (z[0] + z[1]) / 2), hx = (x[1] - x[0]) / 2, hz = (z[1] - z[0]) / 2;
      const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
      colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: 0, maxY, obb: { cx, cz, hx, hz, cs, sn } });
    };
    box(m.walls, m.roof.ridgeY);
    box(m.leanTo, m.leanTo.top);
    box(m.porch, m.porch.top);
    box(m.laube, m.roof.ridgeY - 1.5);
    box(m.landing, m.landing.y + 1);
    box(m.stair, m.landing.y);
    // (a slanting segment in pieces of ~0.5 m: one axis-aligned box over the whole of it would fill the garden)
    for (const [[ax, az], [bx, bz]] of house.fence) {
      const n = Math.max(1, Math.ceil(Math.min(Math.abs(bx - ax), Math.abs(bz - az)) / 0.5));
      for (let i = 0; i < n; i++) {
        const x0 = ax + ((bx - ax) * i) / n, x1 = ax + ((bx - ax) * (i + 1)) / n, z0 = az + ((bz - az) * i) / n, z1 = az + ((bz - az) * (i + 1)) / n;
        box({ x: [Math.min(x0, x1) - 0.05, Math.max(x0, x1) + 0.05], z: [Math.min(z0, z1) - 0.05, Math.max(z0, z1) + 0.05] }, 1.1);
      }
    }
  }
  scene.add(root);
  return { group: root, colliders };
}
