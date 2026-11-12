import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, materialColor, materialEmissive, mix, mx_noise_float, normalWorld, positionView, positionWorld, smoothstep, step, texture, time, uniform, uv, vec3 } from 'three/tsl';
import { groundHeight, addRaisedSidewalk, TERRAIN } from './terrain.js';
import { snowyRoof, winter } from './season.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import {
  EISSTADION, KONGRESS, EISBAHN, PARSENN, DORF, PLATZ, ARKADEN, PLATFORMS, PLATFORM_RISE, LANDMARK_EXCLUSIONS, stadiumVerge, stadiumFacets, stadiumRoofHeight, trackOutline,
  ringPoints, pointInRing
} from './landmark-buildings-data.js';

// Landmarks of Davos Platz rebuilt by hand from the survey (js/landmark-buildings-data.js), standing in for their
// swissBUILDINGS3D volumes (left out of the streamed tiles: js/swissbuildings3d.js excludeBuildings):
//  - the Eisstadion: the surveyed timber roof (two crossed gables, the apex 33 m over the ground) on the concrete
//    stands' octagon with their flat roof 10.4 m up, dark fascias and soffits, the four glazed gables over the stands
//    in near-black frames, the north stand's glazed annex and its glass front over the recessed ground floor, the
//    copper chimneys
//  - the stations of Davos Dorf (the tiled block over the station, the canopy on its posts) and Davos Platz (Gaberel's
//    cream-yellow station of 1949: the base storey with its pilasters, the blocks on it, the hall's window grid), and the
//    Arkadenplatz (the arcaded wings, the Kulturplatz's brick front, the red square on the ground with its parasols)
//  - the Kongresszentrum with the Kongress Hotel and the eau-là-là: every part at its surveyed outline and height, in
//    its own skin (Gisel's board-marked concrete with ribbon windows, Degelo's larch hall with the glazed entrance
//    under the overhang, the hotel's white plaster, the pool's dark timber and its glazing towards the park), the roofs
//    under their solar panels; the outdoor pool and the slide's helix
//  - the Natureisbahn: ice over the track, the pitch and the court in winter (the summer's sports ground is the
//    vector ground's, js/vector-ground.js, traced from the same photograph as the ice's outline)
//  - the Parsennbahn's valley station in Davos Dorf: white walls with red window frames and red-white bands, the glazed
//    shop on the ground floor, its lettering, banner, entrance sign and roof flags from one small canvas atlas
// All of it merged into one mesh per material (24 draw calls in all); the facades' detail (boards, mullions, windows,
// panels) is drawn by the materials from the walls' uv (metres along the wall, metres over the ground), not modelled,
// and fades to its mean colour with distance. Windows glow at dusk and night like the other buildings'
// (cityUniforms.uInteriorGlow).

excludeBuildings(LANDMARK_EXCLUSIONS);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------------
// The mobile profile (js/quality.js simpleMaterials): every skin in its mean colour, the windowed ones with a plain lit
// band per floor at night, the roofs white in winter; no boards, mullions, noise or per-window hashes (a third of the
// WGSL: ~8-9 KB each instead of ~22-26 KB, after an iPhone's GPU process died while compiling them).
// Skins of one kind share one shader: a colour written into the node graph as a literal makes a program of its own
// (two shader modules and a pipeline in Safari's GPU process, docs/gpu-memory.md), so the colours, the glow's strength
// and the window bands' measures are the material's own uniforms (material.color, material.emissive, uniform()) and
// the graphs are the same: SIMPLE_SKINS, also for js/pfadiheim.js.
const linear = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]);
const nightGlow = () => smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow);
export const SIMPLE_SKINS = {
  /** A plain colour ([r, g, b] linear): the stock standard shader, one program for all of them */
  plain(rgb, roughness, metalness = 0, extra = {}) {
    return new THREE.MeshStandardNodeMaterial({ color: linear(rgb), roughness, metalness, ...extra });
  },
  /** A roof: white on what faces up in winter */
  snowRoof(rgb, roughness, metalness = 0) {
    const m = SIMPLE_SKINS.plain(rgb, roughness, metalness);
    m.colorNode = mix(materialColor, vec3(0.84, 0.86, 0.9), smoothstep(0.35, 0.6, normalWorld.y).mul(winter));
    return m;
  },
  /** Glass or a lamp: glowing (`emissive` [r, g, b], times `strength`) from dusk on */
  glow(rgb, roughness, metalness, emissive, strength) {
    const m = SIMPLE_SKINS.plain(rgb, roughness, metalness);
    m.emissive = linear(emissive).multiplyScalar(strength);
    m.emissiveNode = materialEmissive.mul(nightGlow());
    return m;
  },
  /** A wall with a lit band per floor (`h` m high, the band from `lo` to `hi` of it), windows only where v >= 0 */
  windowed(rgb, h, lo, hi, roughness, strength) {
    const V = uv().y, f = fract(V.div(uniform(h)));
    const b = step(0, V).mul(step(uniform(lo), f)).mul(step(f, uniform(hi)));
    const m = SIMPLE_SKINS.plain(rgb, roughness);
    m.colorNode = mix(materialColor, vec3(0.03, 0.035, 0.04), b);
    m.emissive = linear([1.0, 0.66, 0.36]).multiplyScalar(strength);
    m.emissiveNode = materialEmissive.mul(b).mul(nightGlow());
    return m;
  }
};
function simpleMaterials() {
  const V = uv().y;
  const iGlow = cityUniforms.uInteriorGlow;
  const glow = smoothstep(0.7, 1.45, iGlow);
  const warm = vec3(1.0, 0.66, 0.36);
  const snowRoof = (c) => mix(c, vec3(0.84, 0.86, 0.9), smoothstep(0.35, 0.6, normalWorld.y).mul(winter));
  const make = (c, roughness, metalness = 0, extra = {}) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness, ...extra });
    m.colorNode = c;
    return m;
  };
  const { plain, snowRoof: roof, glow: lit, windowed } = SIMPLE_SKINS;
  const M = {};
  M.larch = windowed([0.3, 0.16, 0.07], 3.8, 0.35, 0.75, 0.82, 0.6);
  M.concrete = windowed([0.23, 0.225, 0.21], 3.8, 0.38, 0.79, 0.9, 0.5);
  M.darkwood = windowed([0.06, 0.034, 0.02], 3.6, 0.31, 0.71, 0.8, 0.5);
  M.plaster = windowed([0.65, 0.65, 0.63], 2.9, 0.29, 0.81, 0.9, 0.4);
  M.glass = lit([0.24, 0.28, 0.31], 0.08, 0.85, [1.0, 0.8, 0.58], 0.45);
  M.roofSolar = roof([0.1, 0.1, 0.11], 0.6, 0.2);
  M.roofGravel = roof([0.27, 0.26, 0.25], 0.92);
  M.stadiumRoof = roof([0.12, 0.105, 0.097], 0.75, 0.05);
  M.copper = plain([0.42, 0.17, 0.08], 0.5, 0.6);
  M.arenaTrim = plain([0.025, 0.024, 0.023], 0.6, 0.3);
  M.metal = new THREE.MeshStandardNodeMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.7 });
  M.parsenn = windowed([0.71, 0.71, 0.69], 3.2, 0.24, 0.72, 0.85, 0.4);
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    const map = parsennAtlas();
    m.colorNode = texture(map, uv()).rgb;
    M.parsennSigns = m;
  }
  M.slide = plain([0.4, 0.42, 0.43], 0.3, 0.05);
  M.water = make(vec3(0.04, 0.26, 0.32), 0.04, 0.3);
  M.water.emissiveNode = vec3(0.05, 0.4, 0.55).mul(smoothstep(0.6, 1.3, iGlow).mul(0.8));
  M.ice = make(vec3(0.3, 0.37, 0.42), 0.2, 0.3, { transparent: true });
  M.ice.opacityNode = winter;
  M.ice.depthWrite = true;
  M.arenaGlass = lit([0.15, 0.17, 0.19], 0.08, 0.85, [1.0, 0.8, 0.58], 0.45);
  // (the stations' and the arcades' walls carry their kind in v's offset, see materials(): a lit band per row of windows
  // in each, none on the plain walls, v < −500)
  const lane = (v, lo, hi) => step(lo, v).mul(step(v, hi));
  const banded = (c, b, roughness, strength) => {
    const m = make(mix(c, vec3(0.03, 0.035, 0.04), b), roughness);
    m.emissiveNode = warm.mul(b).mul(glow.mul(strength));
    return m;
  };
  {
    const st = step(1500, V), v = V.sub(st.mul(2000)), open = step(-500, v);
    const fv = fract(v.sub(3.9).div(2.875));
    const block = lane(v, 0.5, 3.1).add(step(3.9, v).mul(step(v, 15.2)).mul(lane(fv, 0.3, 0.76)));
    M.dorf = banded(vec3(0.7, 0.69, 0.67), mix(block, lane(v, 0.9, 2.9), st).mul(open), 0.6, 0.45);
  }
  {
    const hb = step(3500, V), bs = step(1500, V).mul(float(1).sub(hb)), v = V.sub(bs.mul(2000)).sub(hb.mul(4000)), open = step(-500, v);
    const b = mix(mix(lane(v, 0.85, 2.05).add(lane(v, 2.45, 3.65)), lane(v, 1.2, 3.4), bs), lane(v, 1.0, 7.0), hb).mul(open);
    M.platz = banded(vec3(0.64, 0.54, 0.32), b, 0.85, 0.4);
  }
  {
    const sh = step(1500, V), v = V.sub(sh.mul(2000)), open = step(-500, v);
    M.arcade = banded(vec3(0.74, 0.72, 0.69), lane(v, 0.15, 3.35).add(lane(v, 4.0, 6.3)).mul(sh).mul(open), 0.88, 0.35);
  }
  M.brick = plain([0.36, 0.11, 0.065], 0.9);
  M.redSquare = plain([0.46, 0.15, 0.1], 0.8);
  M.canopy = plain([0.46, 0.47, 0.48], 0.55, 0.3);
  M.platform = make(snowRoof(mix(mix(vec3(0.1, 0.1, 0.102), vec3(0.42, 0.41, 0.39), step(4000, V)), vec3(0.8, 0.8, 0.78), step(5500, V))), 0.9);
  return M;
}

function materials() {
  if (QUALITY.simpleMaterials) return simpleMaterials();
  const U = uv().x, V = uv().y;
  // pattern detail fades out with distance (no shimmer far off)
  const dist = positionView.z.negate();
  const near = float(1).sub(smoothstep(120, 380, dist));
  // (boards and seams: a few centimetres, gone sooner)
  const fine = float(1).sub(smoothstep(18, 60, dist));
  const noise = (s) => mx_noise_float(positionWorld.mul(s)).mul(0.5).add(0.5);
  const weather = noise(0.3);
  // Windows only on walls whose v is ≥ 0 (plinths and closed walls carry v − 1000)
  const windowed = step(0, V);
  const iGlow = cityUniforms.uInteriorGlow;
  const glow = smoothstep(0.7, 1.45, iGlow), late = smoothstep(1.3, 1.55, iGlow);
  // A window cell lit or dark, re-rolled every 5–15 min; mostly warm, now and then cooler (offices, screens)
  const lit = (cx, cy, seed, share = 0.6) => {
    const h = hash(cx.mul(157.1).add(cy.mul(311.7)).add(seed));
    const slot = time.div(mix(float(300), float(900), hash(h.mul(977)))).add(hash(h.mul(531))).floor();
    const on = step(hash(h.mul(1.3e4).floor().add(slot.mul(7)).add(seed)), mix(float(share), float(share * 0.7), late));
    const c = hash(h.mul(733));
    const tone = mix(mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.72, 0.42), step(0.55, c)), vec3(0.75, 0.82, 1.0), step(0.88, c));
    return tone.mul(on).mul(hash(h.mul(41)).mul(0.5).add(0.75));
  };
  const M = {};
  // Larch boards, vertical, 11 cm, honey to silver-brown; ribbon windows where windowed (the north wing)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
    const board = floor(U.div(0.11));
    const gap = smoothstep(0.8, 0.92, fract(U.div(0.11))).mul(fine);
    const tone = hash(board.add(17)).sub(0.5).mul(0.3).mul(fine).add(0.5).add(weather.sub(0.5).mul(0.1));
    const wood = mix(vec3(0.24, 0.12, 0.05), vec3(0.36, 0.2, 0.09), tone).mul(float(1).sub(gap.mul(0.5)));
    const floorV = fract(V.div(3.8)), band = smoothstep(0.34, 0.36, floorV).mul(smoothstep(0.76, 0.74, floorV)).mul(windowed);
    const mull = smoothstep(0.455, 0.475, abs(fract(U.div(1.6)).sub(0.5))).mul(near);
    m.colorNode = mix(wood, mix(vec3(0.02, 0.025, 0.03), vec3(0.08, 0.06, 0.05), mull), band);
    m.roughnessNode = mix(float(0.82), float(0.15), band);
    m.emissiveNode = lit(floor(U.div(3.2)), floor(V.div(3.8)), 3, 0.55).mul(band).mul(float(1).sub(mull)).mul(glow.mul(1.2));
    M.larch = m;
  }
  // Board-marked concrete (Gisel), ribbon windows on every floor (3.8 m) with mullions every 1.25 m
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const boards = smoothstep(0.42, 0.5, abs(fract(V.div(0.24)).sub(0.5))).mul(fine);
    const conc = mix(vec3(0.19, 0.185, 0.175), vec3(0.27, 0.265, 0.25), weather.mul(0.7).add(noise(2.1).mul(0.3))).mul(float(1).sub(boards.mul(0.12)));
    const floorV = fract(V.div(3.8)), band = smoothstep(0.37, 0.39, floorV).mul(smoothstep(0.8, 0.78, floorV)).mul(windowed);
    const mull = smoothstep(0.45, 0.475, abs(fract(U.div(1.25)).sub(0.5))).mul(near);
    const glassC = mix(vec3(0.015, 0.02, 0.026), vec3(0.06, 0.065, 0.07), noise(0.05));
    m.colorNode = mix(conc, mix(glassC, vec3(0.06, 0.06, 0.06), mull), band);
    m.roughnessNode = mix(float(0.9), float(0.12), band.mul(float(1).sub(mull)));
    m.metalnessNode = band.mul(float(1).sub(mull)).mul(0.6);
    m.emissiveNode = lit(floor(U.div(5)), floor(V.div(3.8)), 7, 0.5).mul(band).mul(float(1).sub(mull)).mul(glow.mul(1.1));
    M.concrete = m;
  }
  // Dark-stained timber (eau-là-là): horizontal boards, punched windows
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
    const seam = smoothstep(0.42, 0.5, abs(fract(V.div(0.19)).sub(0.5))).mul(fine);
    const wood = mix(vec3(0.045, 0.026, 0.016), vec3(0.075, 0.042, 0.024), noise(1.3).mul(0.5).add(weather.mul(0.5))).mul(float(1).sub(seam.mul(0.4)));
    const wu = fract(U.div(3.0)), wv = fract(V.div(3.6));
    const win = smoothstep(0.2, 0.22, wu).mul(smoothstep(0.8, 0.78, wu)).mul(smoothstep(0.3, 0.32, wv)).mul(smoothstep(0.72, 0.7, wv)).mul(windowed);
    const frame = win.mul(float(1).sub(smoothstep(0.23, 0.25, wu).mul(smoothstep(0.77, 0.75, wu)).mul(smoothstep(0.33, 0.35, wv)).mul(smoothstep(0.69, 0.67, wv))));
    m.colorNode = mix(wood, mix(vec3(0.02, 0.025, 0.03), vec3(0.3, 0.17, 0.08), frame), win);
    m.roughnessNode = mix(float(0.8), float(0.15), win);
    m.emissiveNode = lit(floor(U.div(3)), floor(V.div(3.6)), 11, 0.65).mul(win.sub(frame)).mul(glow.mul(1.2));
    M.darkwood = m;
  }
  // White plaster (the Kongress Hotel): rows of windows with timber panels beside them; the podium (the ground floor)
  // with its dark shop windows
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const plaster = mix(vec3(0.6, 0.6, 0.58), vec3(0.7, 0.7, 0.68), weather);
    const wu = fract(U.div(3.1)), wv = fract(V.sub(4.2).div(2.9));
    const upper = step(4.2, V).mul(windowed), podium = step(V, 4.2).mul(windowed);
    const win = smoothstep(0.1, 0.12, wu).mul(smoothstep(0.58, 0.56, wu)).mul(smoothstep(0.28, 0.3, wv)).mul(smoothstep(0.82, 0.8, wv)).mul(upper);
    const panel = smoothstep(0.6, 0.62, wu).mul(smoothstep(0.88, 0.86, wu)).mul(smoothstep(0.28, 0.3, wv)).mul(smoothstep(0.82, 0.8, wv)).mul(upper);
    const shop = smoothstep(0.08, 0.1, fract(U.div(4.5))).mul(smoothstep(0.92, 0.9, fract(U.div(4.5)))).mul(smoothstep(0.6, 0.7, V)).mul(smoothstep(3.3, 3.2, V)).mul(podium);
    const bar = smoothstep(0.03, 0.015, abs(wu.sub(0.34))).mul(win).mul(near);
    const glassC = vec3(0.02, 0.025, 0.03);
    let c = mix(plaster, vec3(0.32, 0.31, 0.3), podium.mul(0.6));
    c = mix(c, vec3(0.3, 0.16, 0.07), panel);
    c = mix(c, mix(glassC, vec3(0.65, 0.65, 0.63), bar), win.max(shop));
    m.colorNode = c;
    m.roughnessNode = mix(float(0.9), float(0.12), win.max(shop));
    m.emissiveNode = lit(floor(U.div(3.1)), floor(V.sub(4.2).div(2.9)), 13, 0.55).mul(win.mul(float(1).sub(bar)).add(shop.mul(0.8))).mul(glow.mul(1.2));
    M.plaster = m;
  }
  // Curtain-wall glass: mullions every 1.6 m, transoms every 1.9 m (timber-brown on the arena's gables, which share it),
  // reflecting the sky; lit from inside at night (the panes by bay and floor)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
    const mu = abs(fract(U.div(1.6)).sub(0.5)), mv = abs(fract(V.div(1.9)).sub(0.5));
    const frame = smoothstep(0.455, 0.47, mu).max(smoothstep(0.45, 0.47, mv)).mul(near.mul(0.85).add(0.15));
    const pane = hash(floor(U.div(1.6)).mul(13.1).add(floor(V.div(1.9)).mul(7.3)));
    const tint = mix(vec3(0.2, 0.25, 0.28), vec3(0.28, 0.32, 0.34), pane.mul(near));
    m.colorNode = mix(tint, vec3(0.16, 0.085, 0.04), frame);
    m.metalnessNode = mix(float(0.9), float(0.05), frame);
    m.roughnessNode = mix(float(0.06).add(pane.mul(0.05)), float(0.7), frame);
    const inside = lit(floor(U.div(6.4)), floor(V.div(3.8)), 19, 0.8).mul(0.6).add(vec3(1.0, 0.82, 0.6).mul(0.35));
    m.emissiveNode = inside.mul(float(1).sub(frame)).mul(glow.mul(0.7));
    M.glass = m;
  }
  // Roofs: rows of solar panels along Gisel's grid; gravel; the arena's standing-seam roof (brown-grey); all snowed on
  {
    const g = KONGRESS.gridAngle, cs = Math.cos(g), sn = Math.sin(g);
    const rx = positionWorld.x.mul(cs).add(positionWorld.z.mul(sn)), rz = positionWorld.z.mul(cs).sub(positionWorld.x.mul(sn));
    const row = fract(rz.div(2.2)), cell = fract(rx.div(1.05));
    const panel = smoothstep(0.02, 0.05, row).mul(smoothstep(0.78, 0.75, row)).mul(smoothstep(0.02, 0.04, cell)).mul(smoothstep(0.98, 0.96, cell));
    const gravel = mix(vec3(0.22, 0.21, 0.2), vec3(0.32, 0.31, 0.29), noise(1.7).mul(0.6).add(weather.mul(0.4)));
    const pv = mix(vec3(0.02, 0.028, 0.05), vec3(0.04, 0.05, 0.08), smoothstep(0.4, 0.5, row));
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.2 });
    const p = panel.mul(near.mul(0.6).add(0.4));
    m.colorNode = snowyRoof(mix(gravel, pv, p), float(1));
    m.roughnessNode = mix(float(0.9), float(0.22), p.mul(float(1).sub(winter)));
    M.roofSolar = m;
    const r2 = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    r2.colorNode = snowyRoof(gravel, float(1));
    M.roofGravel = r2;
    const r3 = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.1 });
    const seam = smoothstep(0.44, 0.5, abs(fract(U.div(0.55)).sub(0.5))).mul(fine);
    // (grey-brown shingles, the photograph of 2022; a course every 0.3 m, the shingles 0.55 m wide, staggered)
    const course = floor(V.div(0.3)), shingle = hash(floor(U.div(0.55).add(course.mul(0.5))).add(course.mul(13.7)));
    const lap = smoothstep(0.85, 1.0, fract(V.div(0.3))).mul(fine);
    const metal = mix(vec3(0.085, 0.075, 0.07), vec3(0.15, 0.135, 0.125), weather.mul(0.6).add(shingle.mul(fine).mul(0.4))).mul(float(1).sub(lap.mul(0.3)).add(seam.mul(0.1)));
    r3.colorNode = snowyRoof(metal, float(1));
    M.stadiumRoof = r3;
  }
  M.metal = new THREE.MeshStandardNodeMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.7 });
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.6 });
    m.colorNode = mix(vec3(0.36, 0.13, 0.06), vec3(0.5, 0.22, 0.1), weather);
    M.copper = m;
  }
  // The arena's trims (the verges, the fascia over the glass band): near-black metal
  M.arenaTrim = new THREE.MeshStandardNodeMaterial({ color: 0x1c1b1a, roughness: 0.55, metalness: 0.4 });
  // The Parsennbahn's valley station: white render; on every upper floor (3.2 m) a band of narrow portrait windows
  // (0.85 × 1.5 m in bays of 1.45 m, a red frame and a red centre mullion each, now and then a closed pier so that the
  // band runs in groups of two to six) over red-white-red stripes at the floor line; the street fronts (uv.y + 2000)
  // glazed on the ground floor (the shop, lit at night) under a light fascia. At night the render is floodlit from the
  // street (the photograph: a warm white wall, not the sky's blue) and the windows glow warm
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const front = step(1500, V), v0 = V.sub(front.mul(2000)), plain = step(v0, -500), v = v0.add(plain.mul(1000));
    const ground = step(v, 4.2), shop = front.mul(ground).mul(step(0.25, v));
    const fascia = front.mul(step(4.2, v)).mul(step(v, 4.9));
    const fl = v.sub(5.15).div(3.2), fv = fract(fl).mul(3.2);
    // the stripes: red 0–0.2, white, red 0.3–0.42 over every floor line (and the band under the first floor)
    const stripes = step(fv, 0.42).mul(float(1).sub(step(0.2, fv).mul(step(fv, 0.3))));
    const band = step(4.9, v).mul(stripes).max(step(4.9, v).mul(step(v, 5.15)));
    const bay = floor(U.div(1.45)), bu = fract(U.div(1.45)).mul(1.45);
    const pier = step(hash(bay.mul(13.7).add(5.1)), 0.22);
    const box = (pad) => step(0.3 - pad, bu).mul(step(bu, 1.15 + pad)).mul(step(0.78 - pad, fv)).mul(step(fv, 2.3 + pad));
    const upper = float(1).sub(plain).mul(float(1).sub(shop)).mul(float(1).sub(fascia)).mul(step(1.0, v)).mul(float(1).sub(pier));
    const centre = smoothstep(0.045, 0.03, abs(bu.sub(0.725))).mul(near);
    const win = box(0).mul(upper), frame = box(0.1).mul(upper).sub(win).max(win.mul(centre));
    const mullion = smoothstep(0.455, 0.47, abs(fract(U.div(2.4)).sub(0.5))).max(smoothstep(0.04, 0.02, abs(v.sub(2.9)))).mul(shop);
    const white = mix(vec3(0.66, 0.66, 0.64), vec3(0.76, 0.76, 0.74), weather);
    const red = vec3(0.52, 0.015, 0.02);
    let c = mix(white, red, band.max(frame));
    c = mix(c, vec3(0.5, 0.5, 0.49), fascia);
    const glass = win.mul(float(1).sub(frame));
    c = mix(c, vec3(0.02, 0.025, 0.03), glass);
    c = mix(c, mix(vec3(0.05, 0.06, 0.065), vec3(0.18, 0.18, 0.18), mullion), shop);
    m.colorNode = c;
    m.roughnessNode = mix(float(0.85), float(0.1), glass.max(shop.mul(float(1).sub(mullion))));
    m.metalnessNode = shop.mul(float(1).sub(mullion)).mul(0.5);
    const night = smoothstep(0.6, 1.3, iGlow);
    const shopLight = vec3(1.0, 0.84, 0.64).mul(smoothstep(0.45, 1.1, iGlow).mul(0.42));
    const flood = c.mul(vec3(1.0, 0.9, 0.76)).mul(night.mul(0.26)).mul(float(1).sub(glass)).mul(float(1).sub(shop));
    m.emissiveNode = lit(bay, floor(fl), 23, 0.5).mul(glass).mul(glow.mul(1.2)).add(shopLight.mul(shop).mul(float(1).sub(mullion))).add(flood);
    M.parsenn = m;
  }
  // Its lettering, banner, signs and flags: one canvas atlas (js/landmark-buildings.js parsennAtlas), lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    const map = parsennAtlas();
    m.colorNode = texture(map, uv()).rgb;
    m.emissiveNode = texture(map, uv()).rgb.mul(vec3(1.0, 0.95, 0.88)).mul(smoothstep(0.6, 1.3, iGlow).mul(0.85));
    M.parsennSigns = m;
  }
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.05 });
    const stripe = step(0.5, fract(U.div(3.0)));
    m.colorNode = mix(vec3(0.75, 0.78, 0.8), vec3(0.02, 0.02, 0.025), stripe.mul(0.85));
    M.slide = m;
  }
  // Pool water (heated: open all year), lit from below at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.04, metalness: 0.3 });
    const ripple = mx_noise_float(vec3(positionWorld.x.mul(0.8), positionWorld.z.mul(0.8), time.mul(0.4))).mul(0.5).add(0.5);
    m.colorNode = mix(vec3(0.02, 0.2, 0.26), vec3(0.06, 0.32, 0.38), ripple);
    m.emissiveNode = vec3(0.05, 0.4, 0.55).mul(ripple.mul(0.5).add(0.6)).mul(smoothstep(0.6, 1.3, iGlow));
    M.water = m;
  }
  // The Natureisbahn's ice, only in winter (fades in and out with the season)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.45, transparent: true });
    const scratch = mx_noise_float(vec3(positionWorld.x.mul(3.0), positionWorld.z.mul(0.4), 0)).mul(0.5).add(0.5);
    const blotch = mx_noise_float(positionWorld.mul(0.06)).mul(0.5).add(0.5);
    // dark, glossy black ice where it was flooded last, scratched grey-white where it is skated
    const skated = smoothstep(0.45, 0.85, blotch.mul(0.6).add(scratch.mul(0.4)));
    m.colorNode = mix(vec3(0.16, 0.22, 0.27), vec3(0.5, 0.57, 0.62), skated);
    m.roughnessNode = mix(float(0.04), float(0.4), skated);
    m.metalnessNode = mix(float(0.4), float(0.08), skated);
    m.opacityNode = winter;
    m.depthWrite = true;
    M.ice = m;
  }
  // A rectangle of the wall's uv (u0–u1 along, v0–v1 up) as a 0/1 mask
  const box = (u, v, u0, u1, v0, v1) => step(u0, u).mul(step(u, u1)).mul(step(v0, v)).mul(step(v, v1));
  // The Eisstadion's glazing (the gables, the north stand's glass band, the annex): tall narrow panes in near-black
  // frames, a transom every 2.6 m, reflecting the sky; lit from inside at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
    const mu = abs(fract(U.div(1.3)).sub(0.5)), mv = abs(fract(V.div(2.6)).sub(0.5));
    const frame = smoothstep(0.44, 0.46, mu).max(smoothstep(0.465, 0.48, mv)).mul(near.mul(0.85).add(0.15));
    const pane = hash(floor(U.div(1.3)).mul(13.1).add(floor(V.div(2.6)).mul(7.3)));
    const tint = mix(vec3(0.13, 0.16, 0.18), vec3(0.2, 0.23, 0.25), pane.mul(near));
    m.colorNode = mix(tint, vec3(0.018, 0.016, 0.015), frame);
    m.metalnessNode = mix(float(0.9), float(0.1), frame);
    m.roughnessNode = mix(float(0.05).add(pane.mul(0.05)), float(0.6), frame);
    const inside = lit(floor(U.div(5.2)), floor(V.div(3.8)), 29, 0.8).mul(0.6).add(vec3(1.0, 0.82, 0.6).mul(0.35));
    m.emissiveNode = inside.mul(float(1).sub(frame)).mul(glow.mul(0.7));
    M.arenaGlass = m;
  }
  // Bahnhof Davos Dorf. v < 1500: the block: fine white tiles (0.62 × 0.31 m, staggered), the station's ground floor
  // (3.9 m, glazed in bays of 3 m), on each upper floor (2.875 m) a column per 3 m bay of one kind all the way up: a
  // window behind a red-brown roller shutter, a small window in a red-brown frame, a closed bay, or a glazed loggia over
  // its red-brown parapet. v ≥ 1500: the station building (v − 2000): white render over a grey plinth, windows and doors
  // in grey frames under the canopy, plain above
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
    const st = step(1500, V), v0 = V.sub(st.mul(2000)), plain = step(v0, -500), v = v0.add(plain.mul(1000)), open = float(1).sub(plain);
    const red = vec3(0.15, 0.022, 0.02), glassC = vec3(0.025, 0.03, 0.035);
    // the block
    const row = floor(v.div(0.31)), tu = fract(U.div(0.62).add(row.mul(0.5)));
    const joint = step(fract(v.div(0.31)), 0.045).max(step(tu, 0.025)).mul(fine);
    const tiles = mix(vec3(0.72, 0.72, 0.7), vec3(0.79, 0.79, 0.77), hash(row.mul(17.3).add(floor(U.div(0.62).add(row.mul(0.5))))).mul(fine).mul(0.6).add(weather.mul(0.4))).mul(float(1).sub(joint.mul(0.18)));
    const bay = floor(U.div(3.0)), bu = fract(U.div(3.0)).mul(3.0), kind = hash(bay.mul(7.13).add(3.1));
    const gf = step(v, 3.9).mul(open), upper = step(3.9, v).mul(step(v, 15.2)).mul(open);
    const fl = floor(v.sub(3.9).div(2.875)), fv = fract(v.sub(3.9).div(2.875)).mul(2.875);
    const shutterK = step(kind, 0.32), smallK = step(0.32, kind).mul(step(kind, 0.6)), loggiaK = step(0.72, kind);
    const shutter = box(bu, fv, 0.75, 2.25, 0.75, 2.2).mul(shutterK).mul(upper);
    const reveal = box(bu, fv, 0.68, 2.32, 0.68, 2.27).mul(shutterK).mul(upper).sub(shutter);
    const slats = step(0.5, fract(fv.div(0.07))).mul(fine);
    const small = box(bu, fv, 1.1, 1.9, 0.8, 2.2).mul(smallK).mul(upper);
    const smallFrame = small.sub(box(bu, fv, 1.17, 1.83, 0.87, 2.13).mul(smallK).mul(upper));
    const loggia = box(bu, fv, 0.25, 2.75, 0.95, 2.6).mul(loggiaK).mul(upper);
    const parapet = box(bu, fv, 0.25, 2.75, 0.05, 0.95).mul(loggiaK).mul(upper);
    const logMull = smoothstep(0.455, 0.475, abs(fract(bu.sub(0.25).div(0.833)).sub(0.5))).mul(loggia).mul(near);
    const gWin = box(bu, v, 0.35, 2.65, 0.5, 3.1).mul(gf), gFrame = gWin.sub(box(bu, v, 0.45, 2.55, 0.6, 3.0).mul(gf));
    let cb = mix(tiles, vec3(0.5, 0.51, 0.5), gf.mul(float(1).sub(gWin)));
    cb = mix(cb, red.mul(float(0.65).add(slats.mul(0.25))), shutter);
    cb = mix(cb, vec3(0.6, 0.6, 0.58), reveal);
    cb = mix(cb, glassC, small.max(loggia).max(gWin));
    cb = mix(cb, red, smallFrame.max(parapet).max(logMull));
    cb = mix(cb, vec3(0.3, 0.31, 0.31), gFrame);
    const glassB = small.sub(smallFrame).max(loggia.sub(logMull)).max(gWin.sub(gFrame));
    // the station building
    const sb = floor(U.div(2.7)), su = fract(U.div(2.7)).mul(2.7), door = step(hash(sb.mul(5.7).add(1.3)), 0.22);
    const render = mix(vec3(0.68, 0.68, 0.66), vec3(0.75, 0.75, 0.73), weather);
    const win = box(su, v, 0.5, 2.2, 0.9, 2.9).mul(float(1).sub(door)).max(box(su, v, 0.7, 2.0, 0.0, 2.6).mul(door)).mul(open);
    const inner = box(su, v, 0.58, 2.12, 0.98, 2.82).mul(float(1).sub(door)).max(box(su, v, 0.78, 1.92, 0.0, 2.52).mul(door)).mul(open);
    const sFrame = win.sub(inner).max(smoothstep(0.03, 0.01, abs(su.sub(1.35))).mul(win).mul(near));
    let cs = mix(render, vec3(0.33, 0.33, 0.33), step(v, 0.45).mul(float(1).sub(win)));
    cs = mix(cs, glassC, win);
    cs = mix(cs, vec3(0.42, 0.43, 0.43), sFrame);
    const glassS = win.sub(sFrame).max(0);
    m.colorNode = mix(cb, cs, st);
    const glass = mix(glassB, glassS, st);
    m.roughnessNode = mix(mix(float(0.45), float(0.85), st), float(0.1), glass);
    m.metalnessNode = glass.mul(0.5);
    m.emissiveNode = lit(mix(bay, sb.add(50), st), mix(fl, float(-1), st.max(gf)), 31, 0.55).mul(glass).mul(glow.mul(1.2));
    M.dorf = m;
  }
  // Bahnhof Davos Platz: cream render. v ≥ 3500: the hall's street front (v − 4000 over the base's roof): vertical ribs
  // to 1 m, then the great window grid (panes 1.2 × 1.6 m in cream frames) up to 7 m; 1500 ≤ v < 3500: the base storey
  // (v − 2000 over the ground): white pilasters every 3.6 m, pairs of tall windows in white frames between them (now and
  // then a door), a grey plinth; v < 1500: the upper walls over the base's roof: a copper-brown band at their foot, two
  // rows of windows in white frames, one per 2.6 m
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const hb = step(3500, V), bs = step(1500, V).mul(float(1).sub(hb));
    const v0 = V.sub(bs.mul(2000)).sub(hb.mul(4000)), plain = step(v0, -500), v = v0.add(plain.mul(1000)), open = float(1).sub(plain);
    const cream = mix(vec3(0.62, 0.52, 0.3), vec3(0.7, 0.6, 0.36), weather.mul(0.7).add(noise(1.9).mul(0.3)));
    const white = vec3(0.78, 0.77, 0.72), glassC = vec3(0.07, 0.085, 0.1);
    // base storey
    const pb = floor(U.div(3.6)), pu = fract(U.div(3.6)).mul(3.6), door = step(hash(pb.mul(3.3).add(0.7)), 0.18);
    const pil = step(pu, 0.5).mul(step(0.5, v));
    const w2 = box(pu, v, 0.85, 1.85, 1.2, 3.4).max(box(pu, v, 2.15, 3.15, 1.2, 3.4)).mul(float(1).sub(door)).max(box(pu, v, 1.0, 3.0, 0.0, 2.9).mul(door)).mul(open);
    const w2in = box(pu, v, 0.95, 1.75, 1.3, 3.3).max(box(pu, v, 2.25, 3.05, 1.3, 3.3)).mul(float(1).sub(door)).max(box(pu, v, 1.1, 2.9, 0.0, 2.8).mul(door)).mul(open);
    let cB = mix(cream, vec3(0.42, 0.4, 0.36), step(v, 0.5));
    cB = mix(cB, white, pil.max(w2.sub(w2in)));
    cB = mix(cB, glassC, w2in);
    // upper walls
    const ub = floor(U.div(2.6)), uu = fract(U.div(2.6)).mul(2.6);
    const uw = box(uu, v, 0.85, 1.75, 0.85, 2.05).max(box(uu, v, 0.85, 1.75, 2.45, 3.65)).mul(open);
    const uwin = box(uu, v, 0.93, 1.67, 0.93, 1.97).max(box(uu, v, 0.93, 1.67, 2.53, 3.57)).mul(open);
    const cross = smoothstep(0.03, 0.012, abs(uu.sub(1.3))).mul(uwin).mul(near);
    let cU = mix(cream, vec3(0.16, 0.075, 0.035), step(v, 0.45));
    cU = mix(cU, white, uw.sub(uwin).max(cross));
    cU = mix(cU, glassC, uwin.mul(float(1).sub(cross)));
    // the hall's grid
    const rib = smoothstep(0.38, 0.5, abs(fract(U.div(0.3)).sub(0.5))).mul(fine);
    const grid = step(1.0, v).mul(step(v, 7.0)).mul(open);
    const gf = smoothstep(0.43, 0.455, abs(fract(U.div(1.2)).sub(0.5))).max(smoothstep(0.44, 0.46, abs(fract(v.sub(1.0).div(1.6)).sub(0.5)))).mul(grid);
    let cH = mix(cream.mul(float(1).sub(rib.mul(0.12))), glassC, grid);
    cH = mix(cH, white.mul(0.95), gf);
    const glassH = grid.sub(gf).max(0), glassBase = w2in, glassUp = uwin.mul(float(1).sub(cross));
    m.colorNode = mix(mix(cU, cB, bs), cH, hb);
    const glass = mix(mix(glassUp, glassBase, bs), glassH, hb);
    m.roughnessNode = mix(float(0.85), float(0.1), glass);
    m.metalnessNode = glass.mul(0.7);
    const cellU = mix(mix(ub, pb.mul(2).add(step(2.0, pu)), bs), floor(U.div(2.4)), hb), cellV = mix(floor(v.div(1.6)), float(-3), bs);
    m.emissiveNode = lit(cellU, cellV, 37, 0.55).mul(glass).mul(glow.mul(1.2)).add(vec3(1.0, 0.85, 0.65).mul(glassH).mul(glow.mul(0.25)));
    M.platz = m;
  }
  // The Arkadenplatz's wings: white render. v < 1500: the outer walls over the square: over the arcades (7.2 m) a
  // frieze with a painted panel every 6.8 m and a row of small dark openings under it. v ≥ 1500: the walls behind the
  // arcades (v − 2000): red shop fronts in bays of 3.4 m, a mullion and a transom each, the mezzanine's windows in red
  // frames over them
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
    const sh = step(1500, V), v0 = V.sub(sh.mul(2000)), plain = step(v0, -500), v = v0.add(plain.mul(1000)), open = float(1).sub(plain);
    const plaster = mix(vec3(0.72, 0.7, 0.67), vec3(0.79, 0.77, 0.74), weather.mul(0.8).add(noise(2.3).mul(0.2)));
    const red = vec3(0.4, 0.045, 0.02), glassC = vec3(0.03, 0.035, 0.04);
    const fu = fract(U.div(6.8)).mul(6.8), pid = floor(U.div(6.8));
    const panel = box(fu, v, 3.0, 3.75, 7.85, 9.0).mul(open), panelIn = box(fu, v, 3.08, 3.67, 7.93, 8.92).mul(open);
    const figure = smoothstep(0.32, 0.18, abs(fu.sub(3.375))).mul(smoothstep(8.05, 8.15, v)).mul(smoothstep(8.85, 8.7, v));
    const pc = mix(vec3(0.5, 0.36, 0.1), vec3(0.08, 0.13, 0.3), step(0.5, hash(pid.add(4.1))));
    const dot = box(fract(U.div(3.4)).mul(3.4), v, 1.55, 1.85, 7.45, 7.75).mul(open);
    let cO = mix(plaster, vec3(0.3, 0.27, 0.22), panel.sub(panelIn));
    cO = mix(cO, mix(pc, vec3(0.75, 0.68, 0.55), figure.mul(0.7)), panelIn);
    cO = mix(cO, vec3(0.08, 0.08, 0.08), dot);
    const bu = fract(U.div(3.4)).mul(3.4), sb = floor(U.div(3.4));
    const shop = box(bu, v, 0.3, 3.1, 0.15, 3.35).mul(open), shopIn = box(bu, v, 0.42, 2.98, 0.15, 3.23).mul(open);
    const bars = smoothstep(0.04, 0.02, abs(bu.sub(1.7))).max(smoothstep(0.04, 0.02, abs(v.sub(2.55)))).mul(shopIn).mul(near);
    const mez = box(bu, v, 0.6, 2.8, 4.0, 6.3).mul(open), mezIn = box(bu, v, 0.7, 2.7, 4.1, 6.2).mul(open);
    const mBar = smoothstep(0.035, 0.015, abs(bu.sub(1.7))).mul(mezIn).mul(near);
    let cS = mix(plaster, red, shop.sub(shopIn).max(mez.sub(mezIn)).max(bars).max(mBar));
    const glassS = shopIn.sub(bars).max(mezIn.sub(mBar)).max(0);
    cS = mix(cS, glassC, glassS);
    m.colorNode = mix(cO, cS, sh);
    const glass = glassS.mul(sh);
    m.roughnessNode = mix(float(0.88), float(0.1), glass);
    m.metalnessNode = glass.mul(0.5);
    m.emissiveNode = lit(sb, step(3.8, v), 41, 0.75).mul(glass).mul(glow.mul(1.3)).add(vec3(1.0, 0.8, 0.55).mul(shopIn.sub(bars).max(0)).mul(sh).mul(smoothstep(0.45, 1.1, iGlow).mul(0.35)));
    M.arcade = m;
  }
  // The Kulturplatz: brick (0.25 × 0.075 m, staggered) between concrete pilasters every 5.8 m, a light frieze over it
  // (from 7.8 m) with a small square recess every 2.9 m
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const v = V.add(step(V, -500).mul(1000));
    const course = floor(v.div(0.075)), bx = U.div(0.25).add(course.mul(0.5));
    const mortar = step(fract(v.div(0.075)), 0.14).max(step(fract(bx), 0.06)).mul(fine);
    const brick = mix(vec3(0.3, 0.085, 0.05), vec3(0.42, 0.14, 0.08), hash(floor(bx).add(course.mul(31.7))).mul(fine).mul(0.7).add(weather.mul(0.3)));
    const wall = mix(brick, vec3(0.42, 0.38, 0.34), mortar.mul(0.8));
    const pu = fract(U.div(5.8)).mul(5.8), pil = step(pu, 0.75);
    const frieze = step(7.8, v), recess = box(fract(U.div(2.9)).mul(2.9), v, 1.3, 1.6, 8.35, 8.75);
    let c = mix(wall, mix(vec3(0.46, 0.45, 0.43), vec3(0.52, 0.51, 0.49), weather), pil);
    c = mix(c, mix(vec3(0.5, 0.42, 0.31), vec3(0.56, 0.48, 0.36), weather), frieze);
    c = mix(c, vec3(0.2, 0.17, 0.13), recess.mul(frieze));
    m.colorNode = c;
    M.brick = m;
  }
  // The square's red paving: slabs of 1.6 m along the square's edges (turned 16° against the grid), cleared in winter
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
    const a = 0.278, cs = Math.cos(a), sn = Math.sin(a);
    const px = positionWorld.x.mul(cs).add(positionWorld.z.mul(sn)), pz = positionWorld.z.mul(cs).sub(positionWorld.x.mul(sn));
    const joint = step(fract(px.div(1.6)), 0.012).max(step(fract(pz.div(1.6)), 0.012)).mul(fine);
    const slab = hash(floor(px.div(1.6)).mul(7.7).add(floor(pz.div(1.6)).mul(3.1)));
    const c = mix(vec3(0.42, 0.13, 0.08), vec3(0.5, 0.18, 0.11), slab.mul(fine).mul(0.5).add(weather.mul(0.5))).mul(float(1).sub(joint.mul(0.35)));
    m.colorNode = c; // (cleared of snow in winter, like the streets)
    M.redSquare = m;
  }
  // The stations' platforms: asphalt on top, concrete at their edges (the walls: normal not up); v ≥ 4000: the light edge
  // stones along the tracks, v ≥ 5500: the white safety line
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const asphalt = mix(vec3(0.075, 0.075, 0.078), vec3(0.12, 0.12, 0.122), noise(1.1).mul(0.5).add(weather.mul(0.5)));
    const side = smoothstep(0.6, 0.3, normalWorld.y);
    let c = mix(asphalt, mix(vec3(0.34, 0.33, 0.31), vec3(0.42, 0.41, 0.39), weather), side);
    c = mix(c, mix(vec3(0.46, 0.45, 0.43), vec3(0.54, 0.53, 0.5), weather), step(4000, V));
    c = mix(c, vec3(0.8, 0.8, 0.78), step(5500, V));
    m.colorNode = snowyRoof(c, float(0.6));
    M.platform = m;
  }
  // The platform canopies' undersides and fascias: light grey steel, a cross beam every 1.5 m
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.3 });
    const beam = smoothstep(0.4, 0.46, abs(fract(U.div(1.5)).sub(0.5))).mul(near);
    m.colorNode = mix(vec3(0.5, 0.51, 0.52), vec3(0.3, 0.31, 0.32), beam);
    M.canopy = m;
  }
  return M;
}

// The Parsennbahn station's lettering, in one small canvas (logical 512 × 256 px; half that on the mobile profile): the
// texts as plain type (the trademarks of Davos Klosters Bergbahnen AG are not reproduced, see assets/logos/SOURCES.md)
const PARSENN_ATLAS = {
  W: 512, H: 512,
  davos: [0, 0, 512, 72], banner: [0, 72, 512, 48], logo: [0, 120, 256, 64], entrance: [256, 120, 256, 64],
  flag: [0, 184, 448, 72], metal: [448, 184, 64, 72],
  // the stations' and the arena's signs (the lower half): the RhB's name plates (white on blue), the red "Rhätische Bahn"
  // plate, the kiosk's, a platform clock, the arena's lettering over its doors
  dorfName: [0, 256, 256, 48], platzName: [256, 256, 256, 48], rhb: [0, 304, 256, 48], kiosk: [256, 304, 256, 48],
  clock: [0, 352, 96, 96], arena: [96, 352, 416, 40]
};
function parsennAtlas() {
  const A = PARSENN_ATLAS, s = Math.max(0.5, QUALITY.atlasScale ?? 1);
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = Math.round(A.W * s); c.height = Math.round(A.H * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  const box = ([x, y, w, h], bg) => { g.fillStyle = bg; g.fillRect(x, y, w, h); };
  const text = (t, x, y, font, col, align = 'center') => { g.font = font; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  const BLUE = '#1d5fae', RED = '#d0101e';
  box(A.davos, '#f2f2ef');
  text('DAVOS KLOSTERS', 256, 26, '800 34px Arial, Helvetica, sans-serif', '#1b1c1e');
  text('mountains', 256, 56, 'italic 300 24px Arial, Helvetica, sans-serif', '#1b1c1e');
  box(A.banner, '#e9e8e4');
  text('EIN HOCH AUF DAS TIEF', 256, 97, '800 34px Arial, Helvetica, sans-serif', '#141414');
  box(A.logo, BLUE);
  text('parsenn', 128, 150, '700 46px Arial, Helvetica, sans-serif', '#ffffff');
  box(A.entrance, '#f6f6f4');
  box([256, 172, 256, 12], BLUE);
  text('parsenn', 384, 146, '700 44px Arial, Helvetica, sans-serif', BLUE);
  box(A.flag, '#f4f4f2');
  box([0, 244, 448, 12], BLUE);
  text('Parsenn', 214, 214, '800 52px Arial, Helvetica, sans-serif', RED);
  box(A.metal, '#a4a9ad');
  const NAVY = '#1c2f6b';
  for (const [r, name] of [[A.dorfName, 'Davos Dorf'], [A.platzName, 'Davos Platz']]) {
    box(r, NAVY);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(r[0] + 4, r[1] + 4, r[2] - 8, r[3] - 8);
    text(name, r[0] + r[2] / 2, r[1] + r[3] / 2 + 1, '600 26px Arial, Helvetica, sans-serif', '#ffffff');
  }
  box(A.rhb, '#c8102e');
  text('Rhätische Bahn', 128, 329, '700 28px Arial, Helvetica, sans-serif', '#ffffff');
  box(A.kiosk, '#3aa8dc');
  text('k kiosk', 384, 329, '700 30px Arial, Helvetica, sans-serif', '#ffffff');
  box(A.clock, '#30343a');
  g.fillStyle = '#f6f6f4'; g.beginPath(); g.arc(48, 400, 44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#111111'; g.lineCap = 'butt';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = i % 3 ? 2 : 4; g.beginPath(); g.moveTo(48 + Math.sin(a) * 34, 400 - Math.cos(a) * 34); g.lineTo(48 + Math.sin(a) * 41, 400 - Math.cos(a) * 41); g.stroke(); }
  g.lineWidth = 4; g.beginPath(); g.moveTo(48, 400); g.lineTo(48 + 20, 400 - 12); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(48, 400); g.lineTo(48 - 6, 400 - 31); g.stroke();
  box(A.arena, '#1a1817');
  text('FANSHOP      KRISTALL CLUB      SEKTOR N      VIP NORD', 304, 372, '700 17px Arial, Helvetica, sans-serif', '#e9e6df');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// uv corners of an atlas rect: [u0, u1, vBottom, vTop]
const atlasUV = ([x, y, w, h]) => [x / PARSENN_ATLAS.W, (x + w) / PARSENN_ATLAS.W, 1 - (y + h) / PARSENN_ATLAS.H, 1 - y / PARSENN_ATLAS.H];

// --- Geometry: triangles collected per material ------------------------------------------------------------------------
class Builder {
  constructor() { this.parts = new Map(); }
  arr(mat) { if (!this.parts.has(mat)) this.parts.set(mat, { p: [], u: [] }); return this.parts.get(mat); }
  // A triangle (points [x, y, z], uvs [u, v]); `up`: flip it if needed so that its normal points that way
  tri(mat, a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0], want = null) {
    if (want) {
      const n = cross(sub(b, a), sub(c, a));
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    }
    const t = this.arr(mat);
    t.p.push(...a, ...b, ...c);
    t.u.push(...ua, ...ub, ...uc);
  }
  // A quad a-b-c-d (in order round it), facing `want`
  quad(mat, a, b, c, d, ua, ub, uc, ud, want) {
    this.tri(mat, a, b, c, ua, ub, uc, want);
    this.tri(mat, a, c, d, ua, uc, ud, want);
  }
  // A vertical wall from plan (ax, az) to (bx, bz), bottom and top heights at either end, facing (nx, nz); uv: u along
  // from u0, v the height over vRef (− 1000 when the material is to leave out its windows)
  wall(mat, ax, az, bx, bz, botA, botB, topA, topB, n, u0, vRef, windows = true) {
    if (topA - botA < 0.01 && topB - botB < 0.01) return;
    const L = Math.hypot(bx - ax, bz - az), off = windows ? 0 : -1000;
    this.quad(mat, [ax, botA, az], [bx, botB, bz], [bx, topB, bz], [ax, topA, az],
      [u0, botA - vRef + off], [u0 + L, botB - vRef + off], [u0 + L, topB - vRef + off], [u0, topA - vRef + off], [n[0], 0, n[1]]);
  }
  // A flat polygon (plan points [[x, z]], with holes [[[x, z]]]) at height y, facing up (dir 1) or down (−1)
  cap(mat, pts, y, dir = 1, holes = []) {
    const vec = (ring) => ring.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(vec(pts), holes.map(vec));
    const all = [...pts, ...holes.flat()];
    for (const [i, j, k] of tris) {
      const a = all[i], b = all[j], c = all[k];
      this.tri(mat, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], a, b, c, [0, dir, 0]);
    }
  }
  add(mat, geometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const t = this.arr(mat), pos = g.attributes.position, uvs = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { t.p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); t.u.push(uvs ? uvs.getX(i) : 0, uvs ? uvs.getY(i) : 0); }
  }
  meshes(M) {
    const out = [];
    for (const [key, { p, u }] of this.parts) {
      if (!p.length) continue; // (WebGPU: no empty buffers)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[key]);
      mesh.name = `landmark ${key}`;
      mesh.castShadow = key !== 'ice' && key !== 'water';
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The outward normal (plan) of the edge a→b of a ring
function outward(pts, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const n = [dz / L, -dx / L], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  return pointInRing(pts, mx + n[0] * 0.05, mz + n[1] * 0.05) ? [-n[0], -n[1]] : n;
}
// An edge cut into pieces no longer than `step`
function pieces(a, b, stepLen) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / stepLen)), out = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    out.push([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], L * t0, L * t1]);
  }
  return out;
}
const minGround = (pts) => Math.min(...pts.map(([x, z]) => groundHeight(x, z)));

// Colliders (absolute heights: liftColliders leaves them be): a thin oriented box along a wall
function wallCollider(list, a, b, botY, topY, thick = 0.8) {
  const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.3) return;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), cs = Math.cos(ang), sn = -Math.sin(ang);
  // (local x along the wall: (cos θ, −sin θ) in the frame of detail-houses.js, θ = −ang)
  const hx = L / 2, hz = thick / 2;
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  list.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: botY, minY: botY, maxY: topY, obb: { cx, cz, hx, hz, cs, sn } });
}

// --- Eisstadion ----------------------------------------------------------------------------------------------------------------
function buildEisstadion(B, colliders) {
  const S = EISSTADION, outline = S.outline.map((p) => [p.x, p.z]);
  // The foot: the lowest ground under the outline (the survey's reference, js/landmark-buildings-data.js)
  const floorY = minGround(outline);
  const T = S.thickness, eaves = floorY + S.eaves;
  const A = S.apex;
  // The pitched roof: its top (standing seams converging on the apex: u the angle round the apex × 50 m, v the
  // distance from it), the larch soffit under it
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const F of stadiumFacets(S)) {
    const cx = F.reduce((s, p) => s + p.x, 0) / 3 - A.x, cz = F.reduce((s, p) => s + p.z, 0) / 3 - A.z, mid = Math.atan2(cz, cx);
    const uv = (p) => { const dx = p.x - A.x, dz = p.z - A.z, r = Math.hypot(dx, dz); return [(mid + (r < 0.1 ? 0 : wrap(Math.atan2(dz, dx) - mid))) * 50, r]; };
    const pts = F.map((p) => [p.x, floorY + p.h, p.z]), uvs = F.map(uv);
    B.tri('stadiumRoof', pts[0], pts[1], pts[2], uvs[0], uvs[1], uvs[2], [0, 1, 0]);
    const d = (v) => [v[0], v[1] - T, v[2]];
    B.tri('darkwood', d(pts[0]), d(pts[1]), d(pts[2]), uvs[0], uvs[1], uvs[2], [0, -1, 0]);
  }
  // The dark fascia along the roof's edge, facing out (away from the apex)
  const verge = stadiumVerge(S);
  const us = [0];
  for (let i = 1; i <= verge.length; i++) { const a = verge[i - 1], b = verge[i % verge.length]; us.push(us[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const away = (a, b) => { const n = [(a.x + b.x) / 2 - A.x, (a.z + b.z) / 2 - A.z], l = Math.hypot(...n); return [n[0] / l, n[1] / l]; };
  verge.forEach((P, i) => {
    const Q = verge[(i + 1) % verge.length];
    B.wall('arenaTrim', P.x, P.z, Q.x, Q.z, floorY + P.h - T, floorY + Q.h - T, floorY + P.h + 0.05, floorY + Q.h + 0.05, away(P, Q), us[i], floorY, false);
  });
  // The stands: the concrete outer wall round the outline up to the eaves (a low parapet over the roof), their flat
  // gravel roof between the outline and the pitched roof
  const parapet = eaves + 0.3;
  let u = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], n = outward(outline, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (S.glazed.includes(i)) {
      // The north stand's front (the photograph from the Kurpark): a band of glass in near-black frames from the ledge up
      // to a dark fascia at the eaves, over a ledge of concrete beams; the ground floor (doors, the fan shop, the club)
      // set back in the shadow under it
      const G = S.ground, inA = [a[0] - n[0] * G.recess, a[1] - n[1] * G.recess], inB = [b[0] - n[0] * G.recess, b[1] - n[1] * G.recess];
      for (const [p, q, t0] of pieces(inA, inB, 3)) {
        const gp = groundHeight(p[0], p[1]), gq = groundHeight(q[0], q[1]);
        B.wall('arenaGlass', p[0], p[1], q[0], q[1], Math.min(gp, floorY) - 0.5, Math.min(gq, floorY) - 0.5, floorY + G.ledge, floorY + G.ledge, n, u + t0, floorY);
      }
      // the square piers in the front line, carrying the ledge
      const ang0 = -Math.atan2(b[1] - a[1], b[0] - a[0]), np = Math.max(1, Math.round(L / G.pierStep));
      for (let k = 0; k <= np; k++) {
        const c = along([a, b], Math.min(0.985, Math.max(0.015, k / np))), g = Math.min(groundHeight(c[0], c[1]), floorY) - 0.5, h = floorY + G.ledge - g;
        const pier = new THREE.BoxGeometry(0.55, h, 0.55);
        pier.rotateY(ang0);
        B.add('concrete', pier.translate(c[0] - n[0] * 0.35, g + h / 2, c[1] - n[1] * 0.35));
      }
      B.cap('concrete', [a, b, inB, inA], floorY + G.ledge, -1);
      B.wall('concrete', a[0], a[1], b[0], b[1], floorY + G.ledge, floorY + G.ledge, floorY + G.glass, floorY + G.glass, n, u, floorY, false);
      B.wall('arenaGlass', a[0], a[1], b[0], b[1], floorY + G.glass, floorY + G.glass, eaves - 0.6, eaves - 0.6, n, u, floorY + G.glass);
      B.wall('arenaTrim', a[0] + n[0] * 0.05, a[1] + n[1] * 0.05, b[0] + n[0] * 0.05, b[1] + n[1] * 0.05, eaves - 0.6, eaves - 0.6, parapet, parapet, n, u, floorY, false);
      // the beams' ends under the ledge, across the recess, one every 1.3 m
      const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = 0.65; t < L; t += 1.3) {
        const c = along([a, b], t / L), beam = new THREE.BoxGeometry(0.22, 0.45, G.recess);
        beam.rotateY(ang);
        B.add('concrete', beam.translate(c[0] - n[0] * G.recess / 2, floorY + G.ledge - 0.22, c[1] - n[1] * G.recess / 2));
      }
      // the lettering over the doors on the ledge
      if (i === S.glazed[0]) plateAt(B, along([a, b], 0.42), n, 11, floorY + G.ledge + 0.12, floorY + G.glass - 0.12, PARSENN_ATLAS.arena, 0.03);
    } else {
      for (const [p, q, t0] of pieces(a, b, 3)) {
        const gp = groundHeight(p[0], p[1]), gq = groundHeight(q[0], q[1]);
        B.wall('concrete', p[0], p[1], q[0], q[1], Math.min(gp, floorY) - 0.5, Math.min(gq, floorY) - 0.5, parapet, parapet, n, u + t0, floorY, false);
      }
    }
    wallCollider(colliders, a, b, floorY - 0.5, parapet, 1.2);
    u += L;
  }
  // The copper chimneys on the roof, behind the north gable's top towards the apex
  for (const [t, w] of [[0.42, 1.3], [0.5, 1.1], [0.58, 1.3]]) {
    const g = S.outline[1].top, x = g[0] + (A.x - g[0]) * t + 3.2, z = g[1] + (A.z - g[1]) * t - 1.0;
    const y = floorY + stadiumRoofHeight(x, z, S);
    B.add('copper', new THREE.BoxGeometry(w, 2.6, w).rotateY(0.5).translate(x, y + 0.9, z));
    B.add('copper', new THREE.BoxGeometry(w + 0.3, 0.2, w + 0.3).rotateY(0.5).translate(x, y + 2.3, z));
  }
  B.cap('roofGravel', outline, eaves, 1, [verge.map((p) => [p.x, p.z])]);
  // The glazed gables: the glass stands a metre inside the roof's edge, from the stands' roof up under the verge (the
  // eaves point on either side, the top between them); the panes' floors count from the eaves
  const inset = (p) => { const dx = p.x - A.x, dz = p.z - A.z, r = Math.hypot(dx, dz), k = (r - S.glassInset) / r; return [A.x + dx * k, A.z + dz * k]; };
  const roofUnder = (x, z) => floorY + stadiumRoofHeight(x, z, S) - T - 0.02;
  verge.forEach((g, i) => {
    if (g.kind !== 'gable') return;
    const P = [inset(verge[(i + verge.length - 1) % verge.length]), inset(g), inset(verge[(i + 1) % verge.length])];
    let ug = 0;
    for (let j = 0; j + 1 < P.length; j++) {
      const a = P[j], b = P[j + 1], n = away({ x: a[0], z: a[1] }, { x: b[0], z: b[1] });
      for (const [p, q, t0] of pieces(a, b, 3)) {
        const rp = roofUnder(p[0], p[1]), rq = roofUnder(q[0], q[1]);
        B.wall('arenaGlass', p[0], p[1], q[0], q[1], eaves - 0.3, eaves - 0.3, Math.max(eaves - 0.3, rp), Math.max(eaves - 0.3, rq), n, ug + t0, eaves);
      }
      ug += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  });
  // The annex in front of the NNE gable: a glazed box rising from the stands' roof under the gable's glass
  const ring = S.annex.ring, [a0, b0, c0, d0] = ring;
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const pts = [lerp(a0, d0, S.annex.from), lerp(b0, c0, S.annex.from), lerp(b0, c0, S.annex.to), lerp(a0, d0, S.annex.to)];
  const top = floorY + Math.min(S.annex.high, ...pts.map(([x, z]) => stadiumRoofHeight(x, z, S) - T - 0.3));
  B.cap('roofGravel', pts, top);
  let ua = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = outward(pts, a, b);
    B.wall('arenaGlass', a[0], a[1], b[0], b[1], eaves - 0.3, eaves - 0.3, top, top, n, ua, eaves);
    B.wall('arenaTrim', a[0] + n[0] * 0.06, a[1] + n[1] * 0.06, b[0] + n[0] * 0.06, b[1] + n[1] * 0.06, top - 0.6, top - 0.6, top + 0.1, top + 0.1, n, ua, floorY, false);
    ua += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
}

// --- Kongresszentrum, Kongress Hotel, eau-là-là ------------------------------------------------------------------------------
function buildKongress(B, colliders) {
  const K = KONGRESS;
  const parts = K.parts.map((p) => ({ ...p, pts: ringPoints(p.ring) }));
  // The complex's foot: the lowest ground under it (swissBUILDINGS3D measures the heights from there)
  const baseY = Math.min(...parts.map((p) => minGround(p.pts)));
  const cosGlass = Math.cos(55 * Math.PI / 180);
  // the hall's south front (its edge furthest south)
  const hall = parts.find((p) => p.kind === 'hall');
  let south = -1, best = -Infinity;
  hall.pts.forEach((a, i) => { const b = hall.pts[(i + 1) % hall.pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); const zc = (a[1] + b[1]) / 2; if (L > 20 && zc > best) { best = zc; south = i; } });

  for (const part of parts) {
    const { pts, kind } = part, top = baseY + part.h;
    const roofMat = kind === 'eau' || kind === 'hotel' || kind === 'canopy' ? 'roofGravel' : 'roofSolar';
    if (kind === 'canopy') {
      B.cap('roofGravel', pts, top);
      B.cap('darkwood', pts, top - 0.6, -1);
    } else B.cap(roofMat, pts, top);
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = outward(pts, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const gEdge = Math.min(groundHeight(a[0], a[1]), groundHeight(b[0], b[1]));
      for (const [p, q, t0, t1] of pieces(a, b, 6)) {
        const gp = groundHeight(p[0], p[1]), gq = groundHeight(q[0], q[1]), bot = Math.min(gp, gq) - 1.0;
        const U0 = u + t0;
        if (kind === 'canopy') { B.wall('darkwood', p[0], p[1], q[0], q[1], top - 0.6, top - 0.6, top, top, n, U0, gEdge, false); continue; }
        const parapet = top + 0.35;
        if (kind === 'gisel') B.wall('concrete', p[0], p[1], q[0], q[1], bot, bot, parapet, parapet, n, U0, gEdge);
        else if (kind === 'hotel') B.wall('plaster', p[0], p[1], q[0], q[1], bot, bot, parapet, parapet, n, U0, gEdge);
        else if (kind === 'north') {
          const split = gEdge + 4.2;
          B.wall('concrete', p[0], p[1], q[0], q[1], bot, bot, split, split, n, U0, gEdge, false);
          B.wall('larch', p[0], p[1], q[0], q[1], split, split, parapet, parapet, n, U0, gEdge);
        } else if (kind === 'eau') {
          const glazed = n[0] * K.eauGlassDir[0] + n[1] * K.eauGlassDir[1] > cosGlass;
          if (glazed) {
            B.wall('glass', p[0], p[1], q[0], q[1], bot, bot, top - 1.2, top - 1.2, n, U0, gEdge);
            B.wall('darkwood', p[0], p[1], q[0], q[1], top - 1.2, top - 1.2, parapet, parapet, n, U0, gEdge, false);
          } else B.wall('darkwood', p[0], p[1], q[0], q[1], bot, bot, parapet, parapet, n, U0, gEdge);
        } else if (kind === 'hall') {
          // the glazed entrance in the middle of the south front, larch elsewhere
          const f0 = t0 / L, f1 = t1 / L;
          if (i === south && f1 > K.entrance.from && f0 < K.entrance.to) {
            const s0 = Math.max(f0, K.entrance.from), s1 = Math.min(f1, K.entrance.to);
            const P = [a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0], Q = [a[0] + (b[0] - a[0]) * s1, a[1] + (b[1] - a[1]) * s1];
            B.wall('glass', P[0], P[1], Q[0], Q[1], bot, bot, top - 1.5, top - 1.5, n, U0, gEdge);
            B.wall('larch', P[0], P[1], Q[0], Q[1], top - 1.5, top - 1.5, parapet, parapet, n, U0, gEdge, false);
            if (s0 > f0) { const R = [a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0]; B.wall('larch', R[0], R[1], P[0], P[1], bot, bot, parapet, parapet, n, U0, gEdge, false); }
            if (s1 < f1) { const R = [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1]; B.wall('larch', Q[0], Q[1], R[0], R[1], bot, bot, parapet, parapet, n, U0, gEdge, false); }
          } else B.wall('larch', p[0], p[1], q[0], q[1], bot, bot, parapet, parapet, n, U0, gEdge, false);
        }
      }
      if (kind !== 'canopy') wallCollider(colliders, a, b, gEdge - 1, top + 0.35);
      u += L;
    }
  }
  // The hall's roof overhang over the south front: a thin slab, larch underneath and at its edge
  {
    const a = hall.pts[south], b = hall.pts[(south + 1) % hall.pts.length], n = outward(hall.pts, a, b), o = K.entrance.overhang;
    const top = baseY + hall.h, y0 = top - 0.55;
    const slab = [a, b, [b[0] + n[0] * o, b[1] + n[1] * o], [a[0] + n[0] * o, a[1] + n[1] * o]];
    B.cap('roofGravel', slab, top + 0.02);
    B.cap('larch', slab, y0, -1);
    B.wall('larch', slab[3][0], slab[3][1], slab[2][0], slab[2][1], y0, y0, top + 0.35, top + 0.35, n, 0, top, false);
    for (const [p, q] of [[slab[0], slab[3]], [slab[2], slab[1]]]) B.wall('larch', p[0], p[1], q[0], q[1], y0, y0, top + 0.35, top + 0.35, outward(slab, p, q), 0, top, false);
  }
  // The outdoor pool: water in an oval basin with its stone surround, the whirlpool
  {
    const P = K.pool, cs = Math.cos(P.yaw), sn = Math.sin(P.yaw), N = 40;
    const oval = (ra, rb) => Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2, lx = Math.cos(t) * ra, lz = Math.sin(t) * rb; return [P.x + lx * cs + lz * sn, P.z - lx * sn + lz * cs]; });
    const water = oval(P.a, P.b), rim = oval(P.a + 1.0, P.b + 1.0);
    const y = Math.max(...rim.map(([x, z]) => groundHeight(x, z))) + 0.12;
    B.cap('water', water, y - 0.15);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      B.quad('concrete', [water[i][0], y, water[i][1]], [rim[i][0], y, rim[i][1]], [rim[j][0], y, rim[j][1]], [water[j][0], y, water[j][1]], [0, -1000], [0, -1000], [1, -1000], [1, -1000], [0, 1, 0]);
      const n = outward(rim, rim[i], rim[j]);
      B.wall('concrete', rim[i][0], rim[i][1], rim[j][0], rim[j][1], y - 1.2, y - 1.2, y, y, n, i, y, false);
      const ni = outward(water, water[i], water[j]);
      B.wall('concrete', water[i][0], water[i][1], water[j][0], water[j][1], y - 0.15, y - 0.15, y, y, [-ni[0], -ni[1]], i, y, false);
    }
    const W = K.whirlpool, ring = Array.from({ length: 16 }, (_, i) => [W.x + Math.cos(i / 16 * Math.PI * 2) * W.r, W.z + Math.sin(i / 16 * Math.PI * 2) * W.r]);
    const wy = Math.max(...ring.map(([x, z]) => groundHeight(x, z))) + 0.45;
    B.cap('water', ring, wy - 0.1);
    for (let i = 0; i < 16; i++) { const a = ring[i], b = ring[(i + 1) % 16]; B.wall('concrete', a[0], a[1], b[0], b[1], wy - 1, wy - 1, wy, wy, outward(ring, a, b), i, wy, false); }
  }
  // The slide: a tube winding down round its steel column from the pool hall's roof
  {
    const S = K.slide, g = groundHeight(S.x, S.z);
    const pts = [];
    const steps = Math.ceil(S.turns * 24);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = t * S.turns * Math.PI * 2;
      pts.push(new THREE.Vector3(S.x + Math.cos(a) * S.r, g + S.top + (S.bottom - S.top) * t, S.z + Math.sin(a) * S.r));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, S.tube, 10, false);
    B.add('slide', tube);
    const col = new THREE.CylinderGeometry(0.35, 0.35, S.top + 1, 8);
    col.translate(S.x, g + (S.top + 1) / 2 - 0.5, S.z);
    B.add('metal', col);
    for (let y = 2; y < S.top; y += 3) {
      const arm = new THREE.BoxGeometry(S.r * 2, 0.15, 0.15);
      arm.rotateY((y * 0.9) % Math.PI);
      arm.translate(S.x, g + y, S.z);
      B.add('metal', arm);
    }
  }
}

// --- Parsennbahn, Talstation Davos Dorf ----------------------------------------------------------------------------------
function buildParsenn(B, colliders) {
  const P = PARSENN;
  const parts = P.parts.map((p) => ({ ...p, pts: ringPoints(p.ring) }));
  const baseY = Math.min(...parts.map((p) => minGround(p.pts)));
  const isFront = (n) => P.fronts.some(([fx, fz]) => n[0] * fx + n[1] * fz > 0.75);
  for (const part of parts) {
    const { pts } = part, roofAt = (i) => baseY + (part.roof ? part.roof[i] : part.h);
    // the roof (flat, or sloping from corner to corner), gravel like the others
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of tris) B.tri('roofGravel', [pts[i][0], roofAt(i), pts[i][1]], [pts[j][0], roofAt(j), pts[j][1]], [pts[k][0], roofAt(k), pts[k][1]], pts[i], pts[j], pts[k], [0, 1, 0]);
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length, a = pts[i], b = pts[j], n = outward(pts, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const front = part.kind !== 'west' && part.kind !== 'hall' && isFront(n);
      const gEdge = Math.min(groundHeight(a[0], a[1]), groundHeight(b[0], b[1]));
      // a parapet on the flat roofs
      const ta = roofAt(i) + (part.roof ? 0.15 : 0.45), tb = roofAt(j) + (part.roof ? 0.15 : 0.45);
      B.wall('parsenn', a[0], a[1], b[0], b[1], gEdge - 1, gEdge - 1, ta, tb, n, u, gEdge - (front ? 2000 : 0));
      wallCollider(colliders, a, b, gEdge - 1, Math.max(ta, tb));
      u += L;
    }
  }
  // Lettering and signs: plates just off the walls (centre c, outward normal n, width w, from y0 to y1 over the ground)
  const plate = (c, n, w, y0, y1, rect, off = 0.08) => {
    const r = [n[1], -n[0]], [u0, u1, vb, vt] = atlasUV(rect);
    const x = c[0] + n[0] * off, z = c[1] + n[1] * off, g = baseY;
    const L = [x - r[0] * w / 2, z - r[1] * w / 2], R = [x + r[0] * w / 2, z + r[1] * w / 2];
    B.quad('parsennSigns', [L[0], g + y0, L[1]], [R[0], g + y0, R[1]], [R[0], g + y1, R[1]], [L[0], g + y1, L[1]], [u0, vb], [u1, vb], [u1, vt], [u0, vt], [n[0], 0, n[1]]);
  };
  const edge = ([a, b], t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const normalOf = ([a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [-dz / l, dx / l]; };
  const outer = (seg) => { const n = normalOf(seg); return P.fronts.some(([fx, fz]) => n[0] * fx + n[1] * fz > 0.75) ? n : [-n[0], -n[1]]; };
  const nMain = outer(P.endMain), nWing = outer(P.endWing);
  plate(edge(P.endMain, 0.5), nMain, 7.4, 10.3, 11.34, PARSENN_ATLAS.davos);
  plate(edge(P.endWing, 0.5), nWing, 7.6, 4.3, 5.01, PARSENN_ATLAS.banner);
  // the blue "parsenn" sign on the wing's corner, and the entrance from the Promenade (blue-white, over the doors)
  const corner = [[674.2, -1450.3], [677.4, -1454.5]];
  plate(edge(corner, 0.5), outer(corner), 3.4, 6.2, 7.05, PARSENN_ATLAS.logo);
  const prom = [[654.6, -1419.5], [676.0, -1449.0]];
  plate(edge(prom, 0.78), outer(prom), 3.6, 4.2, 5.1, PARSENN_ATLAS.entrance, 0.12);
  // The tall flags on the main block's roof, in a row behind its end: pole, and the banner hanging from a crossbar
  const [mu0, mu1, mvb, mvt] = atlasUV(PARSENN_ATLAS.metal), mu = (mu0 + mu1) / 2, mv = (mvb + mvt) / 2;
  const metal = (geo) => { const uvs = geo.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, mu, mv); B.add('parsennSigns', geo); };
  const [a, b] = P.endMain, d = [(b[0] - a[0]), (b[1] - a[1])], dl = Math.hypot(d[0], d[1]); d[0] /= dl; d[1] /= dl;
  const roof = baseY + P.parts[0].h, [fu0, fu1, fvb, fvt] = atlasUV(PARSENN_ATLAS.flag);
  for (const t of [0.14, 0.32, 0.5, 0.68, 0.86]) {
    const p = edge(P.endMain, t), x = p[0] - nMain[0] * 2.2, z = p[1] - nMain[1] * 2.2, top = roof + 9.5;
    metal(new THREE.CylinderGeometry(0.045, 0.07, top - roof, 6).translate(x, (roof + top) / 2, z));
    metal(new THREE.BoxGeometry(0.04, 0.04, 1.0).lookAt(new THREE.Vector3(d[0], 0, d[1])).translate(x + d[0] * 0.5, top - 0.25, z + d[1] * 0.5));
    const q0 = [x + d[0] * 0.06, z + d[1] * 0.06], q1 = [x + d[0] * 0.98, z + d[1] * 0.98], y0 = top - 5.0, y1 = top - 0.25;
    // the text runs down the banner (along the atlas row): u from the top, v across, its foot at the pole (one sheet,
    // both sides drawn)
    B.quad('parsennSigns', [q0[0], y1, q0[1]], [q1[0], y1, q1[1]], [q1[0], y0, q1[1]], [q0[0], y0, q0[1]],
      [fu0, fvb], [fu0, fvt], [fu1, fvt], [fu1, fvb], [nMain[0], 0, nMain[1]]);
  }
}

// --- Shared pieces of the stations and the Arkadenplatz ------------------------------------------------------------------
// A sign plate just off a wall: centre c (plan), outward normal n, width w, from y0 to y1 (absolute heights)
function plateAt(B, c, n, w, y0, y1, rect, off = 0.08) {
  const r = [n[1], -n[0]], [u0, u1, vb, vt] = atlasUV(rect);
  const x = c[0] + n[0] * off, z = c[1] + n[1] * off;
  const L = [x - r[0] * w / 2, z - r[1] * w / 2], R = [x + r[0] * w / 2, z + r[1] * w / 2];
  B.quad('parsennSigns', [L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]], [u0, vb], [u1, vb], [u1, vt], [u0, vt], [n[0], 0, n[1]]);
}
const along = ([a, b], t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// A convex ring pushed out by d (each corner along its bisector)
function offsetRing(pts, d) {
  return pts.map((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    const n1 = outward(pts, a, p), n2 = outward(pts, p, b), bx = n1[0] + n2[0], bz = n1[1] + n2[1], bl = Math.hypot(bx, bz) || 1;
    const k = d / Math.max(0.35, (bx / bl) * n1[0] + (bz / bl) * n1[1]);
    return [p[0] + (bx / bl) * k, p[1] + (bz / bl) * k];
  });
}
// A flat roof's overhang: the roof cap pushed out by `o`, its underside and fascia (`mat`: the wall material, plain)
function eavesSlab(B, pts, y, o, mat, thick = 0.35) {
  const out = offsetRing(pts, o);
  B.cap('roofGravel', out, y + 0.02);
  B.cap(mat, out, y - thick, -1);
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    B.wall(mat, a[0], a[1], b[0], b[1], y - thick, y - thick, y + 0.12, y + 0.12, outward(out, a, b), 0, y - 50); // (v ~ 50: plain)
  }
}
const distToSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
};
// A canopy from the survey's top triangles (flat x, y, z): its top, its underside `thick` lower, a fascia round its
// free edges; uv along `dir`. Returns the triangles and the free edges
function canopyFromTris(B, flat, dir, { thick = 0.4, top = 'metal' } = {}) {
  const T = [];
  for (let i = 0; i < flat.length; i += 9) T.push([[flat[i], flat[i + 1], flat[i + 2]], [flat[i + 3], flat[i + 4], flat[i + 5]], [flat[i + 6], flat[i + 7], flat[i + 8]]]);
  const uvOf = (p) => [p[0] * dir[0] + p[2] * dir[1], p[0] * dir[1] - p[2] * dir[0]];
  const key = (p) => `${p[0].toFixed(1)},${p[2].toFixed(1)}`, edges = new Map();
  for (const t of T) {
    B.tri(top, t[0], t[1], t[2], uvOf(t[0]), uvOf(t[1]), uvOf(t[2]), [0, 1, 0]);
    const d = (p) => [p[0], p[1] - thick, p[2]];
    B.tri('canopy', d(t[0]), d(t[1]), d(t[2]), uvOf(t[0]), uvOf(t[1]), uvOf(t[2]), [0, -1, 0]);
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3], o = t[(k + 2) % 3], id = [key(a), key(b)].sort().join('|');
      const e = edges.get(id);
      if (e) e.n++; else edges.set(id, { a, b, o, n: 1 });
    }
  }
  const free = [];
  for (const { a, b, o, n } of edges.values()) {
    if (n !== 1) continue;
    let nx = b[2] - a[2], nz = a[0] - b[0];
    const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
    if ((o[0] - a[0]) * nx + (o[2] - a[2]) * nz > 0) { nx = -nx; nz = -nz; }
    B.wall('canopy', a[0], a[2], b[0], b[2], a[1] - thick, b[1] - thick, a[1] + 0.06, b[1] + 0.06, [nx, nz], uvOf(a)[0], a[1], false);
    free.push([[a[0], a[2]], [b[0], b[2]]]);
  }
  return { T, free };
}
// The height of the triangles' surface at (x, z), or null
function trisHeight(T, x, z) {
  for (const [a, b, c] of T) {
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * a[1] + l2 * b[1] + l3 * c[1];
  }
  return null;
}
// Steel posts under a canopy: a row along `dir` every `step` m, each where the canopy is widest across (furthest from
// its free edges), none inside the buildings (`avoid` rings); a Y of two raking struts on each
function canopyPosts(B, { T, free }, dir, avoid, { step = 9, thick = 0.4, minEdge = 1.6, colliders } = {}) {
  const P = T.flat(), us = P.map((p) => p[0] * dir[0] + p[2] * dir[1]), ws = P.map((p) => p[0] * dir[1] - p[2] * dir[0]);
  const u0 = Math.min(...us), u1 = Math.max(...us), w0 = Math.min(...ws), w1 = Math.max(...ws);
  const at = (u, w) => [u * dir[0] + w * dir[1], u * dir[1] - w * dir[0]];
  const across = [dir[1], -dir[0]];
  for (let u = u0 + step / 2; u < u1; u += step) {
    let run = null;
    const flush = () => {
      if (run && run.d >= minEdge) {
        const [x, z] = run.p, y = trisHeight(T, x, z) - thick, g = groundHeight(x, z);
        if (y - g > 2.5) {
          B.add('metal', new THREE.CylinderGeometry(0.11, 0.14, y - 1.1 - g, 8).translate(x, g + (y - 1.1 - g) / 2, z));
          for (const s of [1, -1]) {
            const L = Math.hypot(1.1, 1.6), mid = new THREE.Vector3(x + across[0] * s * 0.8, y - 0.55, z + across[1] * s * 0.8);
            const strut = new THREE.BoxGeometry(0.12, L, 0.12);
            strut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(across[0] * s * 1.6, 1.1, across[1] * s * 1.6).normalize()));
            B.add('metal', strut.translate(mid.x, mid.y, mid.z));
          }
          colliders?.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, baseY: g, minY: g, maxY: y });
        }
      }
      run = null;
    };
    for (let w = w0; w <= w1; w += 0.5) {
      const p = at(u, w);
      const inside = trisHeight(T, p[0], p[1]) !== null && !avoid.some((r) => pointInRing(r, p[0], p[1]));
      if (!inside) { flush(); continue; }
      const d = Math.min(...free.map(([a, b]) => distToSeg(p, a, b)), ...avoid.flatMap((r) => r.map((a, i) => distToSeg(p, a, r[(i + 1) % r.length]))));
      if (!run || d > run.d) run = { p, d: d };
    }
    flush();
  }
}

// --- Bahnhof Davos Dorf ----------------------------------------------------------------------------------------------------
function buildDorf(B, colliders) {
  const D = DORF;
  const parts = [['block', D.block], ['station', D.station], ['link', D.link]].map(([kind, p]) => ({ ...p, kind, pts: ringPoints(p.ring) }));
  const baseY = Math.min(...parts.map((p) => minGround(p.pts)));
  const facing = (n) => n[0] * D.track[0] + n[1] * D.track[1];
  const fronts = {};
  for (const part of parts) {
    const { pts, kind } = part, top = baseY + part.h, parapet = top + (kind === 'block' ? 0.4 : 0.15);
    B.cap('roofGravel', pts, top);
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = outward(pts, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const gEdge = Math.min(groundHeight(a[0], a[1]), groundHeight(b[0], b[1]));
      // (the block: v over the platform; the station and the link: v + 2000)
      B.wall('dorf', a[0], a[1], b[0], b[1], gEdge - 1, gEdge - 1, parapet, parapet, n, u, kind === 'block' ? baseY : baseY - 2000);
      if (facing(n) > 0.8 && (!fronts[kind] || L > fronts[kind].L)) fronts[kind] = { a, b, n, L };
      u += L;
    }
  }
  // The canopy over the house platform, on its posts in front of the walls
  const dir = [0.549, -0.836];
  const canopy = canopyFromTris(B, D.canopy, dir, { thick: 0.45 });
  canopyPosts(B, canopy, dir, parts.map((p) => p.pts), { step: 9.5, thick: 0.45, minEdge: 1.2, colliders });
  // The blue name plate hanging under the canopy in front of the station building, the clock at the block's corner
  const st = fronts.station, bl = fronts.block;
  if (st) {
    const c = along([st.a, st.b], 0.55), y = trisHeight(canopy.T, c[0] + st.n[0] * 1.6, c[1] + st.n[1] * 1.6) ?? baseY + 6.8;
    plateAt(B, c, st.n, 2.6, y - 1.45, y - 0.95, PARSENN_ATLAS.dorfName, 1.6);
    B.add('metal', new THREE.BoxGeometry(0.04, 0.5, 0.04).translate(c[0] + st.n[0] * 1.6, y - 0.7, c[1] + st.n[1] * 1.6));
  }
  if (bl) {
    const c = along([bl.a, bl.b], 0.1), y = baseY + 4.6;
    for (const s of [1, -1]) {
      const r = [bl.n[1] * s, -bl.n[0] * s];
      plateAt(B, [c[0] + bl.n[0] * 1.2, c[1] + bl.n[1] * 1.2], r, 0.75, y - 0.375, y + 0.375, PARSENN_ATLAS.clock, 0.02);
    }
  }
}

// --- Bahnhof Davos Platz ---------------------------------------------------------------------------------------------------
function buildPlatz(B, colliders) {
  const P = PLATZ, base = ringPoints(P.base.ring), blocks = P.blocks.map((b) => ({ ...b, pts: ringPoints(b.ring) }));
  const baseY = minGround(base), roofY = baseY + P.base.h;
  const street = (n) => n[0] * P.street[0] + n[1] * P.street[1];
  const onBlock = (p, q) => blocks.some((b) => b.pts.some((a, i) => { const c = b.pts[(i + 1) % b.pts.length]; return distToSeg(p, a, c) < 0.3 && distToSeg(q, a, c) < 0.3; }));
  // The base storey: its walls (v + 2000 over the ground) up under the roof slab, where no block stands on the line
  let u = 0, front = null;
  for (let i = 0; i < base.length; i++) {
    const a = base[i], b = base[(i + 1) % base.length], n = outward(base, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!onBlock(a, b)) {
      const gEdge = Math.min(groundHeight(a[0], a[1]), groundHeight(b[0], b[1]));
      B.wall('platz', a[0], a[1], b[0], b[1], gEdge - 1, gEdge - 1, roofY - 0.5, roofY - 0.5, n, u, baseY - 2000);
      wallCollider(colliders, a, b, gEdge - 1, roofY);
    }
    if (street(n) > 0.9 && (!front || L > front.L)) front = { a, b, n, L };
    u += L;
  }
  // its flat roof, overhanging the street by a metre, a cream fascia
  B.cap('roofGravel', base, roofY);
  if (front) {
    const { a, b, n } = front, o = 1.1, A2 = [a[0] + n[0] * o, a[1] + n[1] * o], B2 = [b[0] + n[0] * o, b[1] + n[1] * o];
    const slab = [a, b, B2, A2];
    B.cap('roofGravel', slab, roofY + 0.01);
    B.cap('platz', slab, roofY - 0.5, -1);
    B.wall('platz', A2[0], A2[1], B2[0], B2[1], roofY - 0.5, roofY - 0.5, roofY + 0.15, roofY + 0.15, n, 0, roofY - 50);
    for (const [p, q] of [[a, A2], [B2, b]]) B.wall('platz', p[0], p[1], q[0], q[1], roofY - 0.5, roofY - 0.5, roofY + 0.15, roofY + 0.15, outward(slab, p, q), 0, roofY - 50);
  }
  // The blocks and the hall on it: the hall's street front its window grid (v + 4000 over the base's roof), the walls on
  // the track side down to the ground (the base storey's skin below its roof), the others from the base's roof
  for (const blk of blocks) {
    const { pts } = blk, top = baseY + blk.h;
    let ub = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = outward(pts, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const gEdge = Math.min(groundHeight(a[0], a[1]), groundHeight(b[0], b[1]));
      const toTrack = street(n) < -0.8;
      if (toTrack) {
        B.wall('platz', a[0], a[1], b[0], b[1], gEdge - 1, gEdge - 1, roofY, roofY, n, ub, baseY - 2000);
        wallCollider(colliders, a, b, gEdge - 1, top);
      }
      const grid = blk.kind === 'hall' && street(n) > 0.8;
      B.wall('platz', a[0], a[1], b[0], b[1], roofY - 0.1, roofY - 0.1, top - 0.2, top - 0.2, n, ub, grid ? roofY - 4000 : roofY);
      ub += L;
    }
    B.cap('roofGravel', pts, top - 0.2);
    eavesSlab(B, pts, top, blk.kind === 'hall' ? 0.45 : 0.8, 'platz');
  }
  // The signs: the name plate on the north-east block under its eaves, "Rhätische Bahn" on the base's roof edge in front
  // of the hall, the kiosk's over the north-east end
  const ne = blocks[0], hall = blocks[1];
  const edgeTo = (blk, want) => { const p = blk.pts; let best = null; p.forEach((a, i) => { const b = p[(i + 1) % p.length], n = outward(p, a, b); if (street(n) > want && (!best || Math.hypot(b[0] - a[0], b[1] - a[1]) > best.L)) best = { a, b, n, L: Math.hypot(b[0] - a[0], b[1] - a[1]) }; }); return best; };
  const neFront = edgeTo(ne, 0.8);
  if (neFront) plateAt(B, along([neFront.a, neFront.b], 0.62), neFront.n, 3.6, baseY + ne.h - 1.75, baseY + ne.h - 1.08, PARSENN_ATLAS.platzName, 0.1);
  if (front) {
    const hc = hall.pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
    const { a, b, n } = front, d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
    const t = ((hc[0] - a[0]) * d[0] + (hc[1] - a[1]) * d[1]) / L2, c = along([a, b], t);
    plateAt(B, [c[0] + n[0] * 1.1, c[1] + n[1] * 1.1], n, 4.6, roofY + 0.15, roofY + 0.95, PARSENN_ATLAS.rhb, 0.02);
    const tk = a[0] + a[1] > b[0] + b[1] ? 0.9 : 0.1; // (the north-east end of the front)
    const k = along([a, b], tk);
    plateAt(B, [k[0] + n[0] * 1.1, k[1] + n[1] * 1.1], n, 3.0, roofY - 0.45, roofY - 0.06, PARSENN_ATLAS.kiosk, 0.03);
  }
  // The platform canopies the survey draws with the station, on their posts
  const dir = [-0.55, 0.835];
  const canopy = canopyFromTris(B, P.canopy, dir, { thick: 0.35, top: 'roofGravel' });
  canopyPosts(B, canopy, dir, [base, ...blocks.map((b) => b.pts)], { step: 10, thick: 0.35, minEdge: 1.5, colliders });
}

// A surface laid exactly on the terrain, `lift` over it: the terrain's own triangles (its 8 m grid, each cell split like
// js/terrain-grid.js gridHeight) cut to the outline `pts` (each triangle clipping the outline, Sutherland–Hodgman), so
// that no crease of the ground can rise through it
function drapeOnTerrain(B, mat, pts, lift) {
  const { cell, minX, minZ, cols, rows } = TERRAIN;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / cell)), i1 = Math.min(cols - 2, Math.floor((Math.max(...xs) - minX) / cell));
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - minZ) / cell)), j1 = Math.min(rows - 2, Math.floor((Math.max(...zs) - minZ) / cell));
  const clip = (subject, tri) => {
    let out = subject;
    for (let e = 0; e < 3 && out.length; e++) {
      const a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3];
      const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const sc = Math.sign(side(c)), inside = (p) => side(p) * sc >= -1e-9, input = out;
      out = [];
      for (let k = 0; k < input.length; k++) {
        const P = input[k], Q = input[(k + 1) % input.length], pin = inside(P), qin = inside(Q);
        if (pin) out.push(P);
        if (pin !== qin) { const sp = side(P), sq = side(Q), t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
      }
    }
    return out;
  };
  const y = (p) => groundHeight(p[0], p[1]) + lift;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const x0 = minX + i * cell, z0 = minZ + j * cell, x1 = x0 + cell, z1 = z0 + cell;
    for (const tri of [[[x0, z0], [x1, z0], [x1, z1]], [[x0, z0], [x1, z1], [x0, z1]]]) {
      const poly = clip(pts, tri);
      if (poly.length < 3) continue;
      // (a convex triangle cuts a concave outline into pieces joined along its edge: triangulated as one polygon)
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(poly.map(([px, pz]) => new THREE.Vector2(px, pz)), []); } catch { continue; }
      for (const [a, b, c] of tris) B.tri(mat, [poly[a][0], y(poly[a]), poly[a][1]], [poly[b][0], y(poly[b]), poly[b][1]], [poly[c][0], y(poly[c]), poly[c][1]], poly[a], poly[b], poly[c], [0, 1, 0]);
    }
  }
}

// --- Arkadenplatz, Kulturplatz Davos ---------------------------------------------------------------------------------------
function buildArkaden(B, colliders) {
  const A = ARKADEN, sq = ringPoints(A.square);
  // The square's level: the survey's, or just over the terrain's highest point under it (the terrain model's 8 m grid
  // smooths the car park's edge: here and there it rises through the paving)
  let Y = A.level;
  const xs = sq.map((p) => p[0]), zs = sq.map((p) => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 1.5) {
    if (pointInRing(sq, x, z)) Y = Math.max(Y, groundHeight(x, z) + 0.04);
  }
  // The red square: paving laid on the ground (a few centimetres over it, the terrain's every metre and a half), raised
  // ground for whoever walks there (js/terrain.js); cars drive over it at the roads' height
  const pave = (x, z) => groundHeight(x, z) + A.paving;
  const grid = [];
  for (let i = 0; i < sq.length; i++) for (const [p] of pieces(sq[i], sq[(i + 1) % sq.length], 1.5)) grid.push(p);
  drapeOnTerrain(B, 'redSquare', sq, A.paving);
  for (let i = 0; i < grid.length; i++) {
    const a = grid[i], b = grid[(i + 1) % grid.length];
    B.wall('concrete', a[0], a[1], b[0], b[1], pave(a[0], a[1]) - 0.3, pave(b[0], b[1]) - 0.3, pave(a[0], a[1]), pave(b[0], b[1]), outward(grid, a, b), i, 0, false);
  }
  addRaisedSidewalk(sq.map(([x, z]) => ({ x, z })), 'arkadenplatz', A.paving);
  const D = A.arcadeDepth, H = Y + A.arcadeHigh;
  for (const wing of A.wings) {
    const pts = ringPoints(wing.ring), top = Y + wing.h, parapet = top + 0.4;
    B.cap('roofGravel', pts, top);
    const inArcade = (i) => wing.arcade && i >= wing.arcade[0] && i < wing.arcade[1];
    let back = null;
    if (wing.arcade) {
      const [i0, i1] = wing.arcade, chain = [];
      for (let i = i0; i <= i1; i++) chain.push(pts[i % pts.length]);
      const nOf = (k) => outward(pts, pts[(i0 + k) % pts.length], pts[(i0 + k + 1) % pts.length]);
      back = chain.map((p, k) => {
        const n0 = nOf(Math.max(0, k - 1)), n1 = nOf(Math.min(chain.length - 2, k));
        const bx = n0[0] + n1[0], bz = n0[1] + n1[1], bl = Math.hypot(bx, bz) || 1, cos = Math.max(0.5, (bx / bl) * n1[0] + (bz / bl) * n1[1]);
        return [p[0] - (bx / bl) * D / cos, p[1] - (bz / bl) * D / cos];
      });
      // its two ends closed (a wall from the outline to the back line, facing into the arcade)
      for (const [k, kIn] of [[0, 1], [chain.length - 1, chain.length - 2]]) {
        const p = chain[k], q = back[k], into = [chain[kIn][0] - p[0], chain[kIn][1] - p[1]], l = Math.hypot(into[0], into[1]) || 1;
        const g = Math.min(groundHeight(p[0], p[1]), groundHeight(q[0], q[1]), Y) - 1;
        B.wall('arcade', p[0], p[1], q[0], q[1], g, g, H + 0.05, H + 0.05, [into[0] / l, into[1] / l], 0, Y - 2000);
      }
    }
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = outward(pts, a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const gEdge = Math.min(groundHeight(a[0], a[1]), groundHeight(b[0], b[1]), Y), bot = gEdge - 1;
      if (wing.kind === 'brick') {
        if (i === wing.front) {
          // the Kulturplatz's front: brick between the pilasters, its four middle bays glazed up to 6.4 m
          const bays = [];
          for (let k = 2; k <= 5; k++) bays.push([(k * 5.8 + 0.75) / L, ((k + 1) * 5.8) / L]);
          let t = 0;
          for (const [s0, s1] of bays) {
            const P0 = along([a, b], t), P1 = along([a, b], s0), Q = along([a, b], s1);
            B.wall('brick', P0[0], P0[1], P1[0], P1[1], bot, bot, parapet, parapet, n, u + t * L, Y);
            B.wall('glass', P1[0] - n[0] * 0.25, P1[1] - n[1] * 0.25, Q[0] - n[0] * 0.25, Q[1] - n[1] * 0.25, bot, bot, Y + 6.4, Y + 6.4, n, u + s0 * L, Y);
            B.wall('brick', P1[0], P1[1], Q[0], Q[1], Y + 6.4, Y + 6.4, parapet, parapet, n, u + s0 * L, Y);
            B.cap('brick', [P1, Q, [Q[0] - n[0] * 0.25, Q[1] - n[1] * 0.25], [P1[0] - n[0] * 0.25, P1[1] - n[1] * 0.25]], Y + 6.4, -1);
            t = s1;
          }
          const P0 = along([a, b], t);
          B.wall('brick', P0[0], P0[1], b[0], b[1], bot, bot, parapet, parapet, n, u + t * L, Y);
        } else B.wall('brick', a[0], a[1], b[0], b[1], bot, bot, parapet, parapet, n, u, Y);
      } else if (inArcade(i)) {
        // the arcade: the frieze over it on the outline, its ceiling, its floor, the shop fronts at the back (v + 2000)
        // along the back line (the outline moved in by its depth, mitred at the corners: no gaps round the curve)
        const ia = back[i - wing.arcade[0]], ib = back[i + 1 - wing.arcade[0]];
        B.wall('arcade', a[0], a[1], b[0], b[1], H, H, parapet, parapet, n, u, Y);
        B.wall('arcade', ia[0], ia[1], ib[0], ib[1], bot, bot, H + 0.05, H + 0.05, n, u, Y - 2000);
        B.cap('arcade', [a, b, ib, ia], H, -1);
        drapeOnTerrain(B, 'redSquare', [a, b, ib, ia], A.paving);
      } else if (wing.street && i === wing.street[0]) {
        B.wall('arcade', a[0], a[1], b[0], b[1], bot, bot, H, H, n, u, Y - 2000);
        B.wall('arcade', a[0], a[1], b[0], b[1], H, H, parapet, parapet, n, u, Y);
      } else B.wall('arcade', a[0], a[1], b[0], b[1], bot, bot, parapet, parapet, n, u, Y - 2000);
      u += L;
    }
    // the arcade's piers along the outline, one every pierStep and one at either end
    if (wing.arcade) {
      const seg = [];
      for (let i = wing.arcade[0]; i < wing.arcade[1]; i++) seg.push([pts[i], pts[(i + 1) % pts.length]]);
      const total = seg.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
      const count = Math.max(1, Math.round(total / A.pierStep));
      for (let k = 0; k <= count; k++) {
        let s = Math.min(total - 0.01, Math.max(0.01, (k / count) * total)), j = 0;
        while (j < seg.length - 1 && s > Math.hypot(seg[j][1][0] - seg[j][0][0], seg[j][1][1] - seg[j][0][1])) { s -= Math.hypot(seg[j][1][0] - seg[j][0][0], seg[j][1][1] - seg[j][0][1]); j++; }
        const [a, b] = seg[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.min(1, s / L), p = along([a, b], t), n = outward(pts, a, b);
        const w = A.pier, c = [p[0] - n[0] * w / 2, p[1] - n[1] * w / 2];
        const pier = new THREE.BoxGeometry(w, A.arcadeHigh + 0.6, w);
        pier.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
        B.add('arcade', pier.translate(c[0], Y + (A.arcadeHigh + 0.6) / 2 - 0.55, c[1]));
        colliders.push({ minX: c[0] - w * 0.7, maxX: c[0] + w * 0.7, minZ: c[1] - w * 0.7, maxZ: c[1] + w * 0.7, baseY: Y - 0.6, minY: Y - 0.6, maxY: H });
      }
    }
  }
  // The parasols over the café tables
  for (const [x, z] of A.parasols) {
    const y = pave(x, z);
    B.add('metal', new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(x, y + 1.3, z));
    const roof = new THREE.ConeGeometry(3.3, 0.8, 4, 1, true);
    roof.rotateY(Math.PI / 4 + 0.278);
    B.add('arcade', roof.translate(x, y + 2.75, z));
    // (its underside: the same cone wound the other way, seen from below)
    const under = roof.clone(), ix = under.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    B.add('arcade', under);
  }
}

// --- The stations' platforms ------------------------------------------------------------------------------------------------
// A slab PLATFORM_RISE over the ground (its top following the terrain, its edges down into it), the edge stones and the
// white line along the tracks; registered as raised ground (js/terrain.js), so that whoever walks there stands on it
function buildPlatforms(B) {
  const R = PLATFORM_RISE;
  for (const P of PLATFORMS) {
    const ring = ringPoints(P.ring);
    // the outline every 3 m, the top over the ground at each point
    const pts = [];
    for (let i = 0; i < ring.length; i++) for (const [p] of pieces(ring[i], ring[(i + 1) % ring.length], 3)) pts.push(p);
    const top = (x, z) => groundHeight(x, z) + R + 0.02;
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of tris) {
      const a = pts[i], b = pts[j], c = pts[k];
      B.tri('platform', [a[0], top(a[0], a[1]), a[1]], [b[0], top(b[0], b[1]), b[1]], [c[0], top(c[0], c[1]), c[1]], a, b, c, [0, 1, 0]);
    }
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = outward(pts, a, b);
      B.wall('platform', a[0], a[1], b[0], b[1], groundHeight(a[0], a[1]) - 0.3, groundHeight(b[0], b[1]) - 0.3, top(a[0], a[1]), top(b[0], b[1]), n, u, 0, false);
      u += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    // along the tracks: the edge stones (0.35 m) and the white line 0.8 m in
    for (const e of P.track) {
      const a0 = ring[e], b0 = ring[(e + 1) % ring.length], n = outward(ring, a0, b0);
      for (const [p, q] of pieces(a0, b0, 3)) {
        const strip = (d0, d1, v, lift) => {
          const P0 = [p[0] - n[0] * d0, p[1] - n[1] * d0], Q0 = [q[0] - n[0] * d0, q[1] - n[1] * d0];
          const P1 = [p[0] - n[0] * d1, p[1] - n[1] * d1], Q1 = [q[0] - n[0] * d1, q[1] - n[1] * d1];
          const y = (pt) => top(pt[0], pt[1]) + lift;
          B.quad('platform', [P0[0], y(P0), P0[1]], [Q0[0], y(Q0), Q0[1]], [Q1[0], y(Q1), Q1[1]], [P1[0], y(P1), P1[1]], [0, v], [0, v], [0, v], [0, v], [0, 1, 0]);
        };
        strip(0, 0.35, 5000, 0.006);
        strip(0.8, 0.9, 6000, 0.006);
      }
    }
    addRaisedSidewalk(ring.map(([x, z]) => ({ x, z })), 'platform', R);
  }
}

// --- Natureisbahn ------------------------------------------------------------------------------------------------------------
function buildEisbahn(B) {
  // The track and the pitch inside it lie flat: one sheet just over the highest ground under it
  const track = trackOutline();
  const y = Math.max(...track.map(([x, z]) => groundHeight(x, z)), groundHeight(EISBAHN.track.x, EISBAHN.track.z)) + 0.14;
  B.cap('ice', track, y);
  // The hard court beside it slopes a little: draped on a grid
  const c = EISBAHN.court, n = 10;
  const at = (s, t) => {
    const x = c[0][0] + (c[1][0] - c[0][0]) * s + (c[3][0] - c[0][0]) * t, z = c[0][1] + (c[1][1] - c[0][1]) * s + (c[3][1] - c[0][1]) * t;
    return [x, groundHeight(x, z) + 0.14, z];
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    B.quad('ice', at(i / n, j / n), at((i + 1) / n, j / n), at((i + 1) / n, (j + 1) / n), at(i / n, (j + 1) / n), [0, 0], [0, 0], [0, 0], [0, 0], [0, 1, 0]);
  }
}

/**
 * Builds the landmarks into `scene`. Returns { group, colliders } (colliders with absolute heights).
 */
export function buildLandmarkBuildings(scene) {
  const root = new THREE.Group();
  root.name = 'LandmarkBuildings';
  root.userData.terrain = 'absolute';
  const M = materials(), colliders = [];
  const B = new Builder();
  buildEisstadion(B, colliders);
  buildKongress(B, colliders);
  buildEisbahn(B);
  buildParsenn(B, colliders);
  buildDorf(B, colliders);
  buildPlatz(B, colliders);
  buildArkaden(B, colliders);
  buildPlatforms(B);
  for (const mesh of B.meshes(M)) {
    if (mesh.name === 'landmark parsennSigns') mesh.castShadow = false; // (thin plates and flags: no shadow pass)
    root.add(mesh);
  }
  // The ice: drawn only while there is winter in the air (no draw call in summer)
  const ice = root.children.find((m) => m.name === 'landmark ice');
  if (ice) {
    ice.renderOrder = 1;
    const sync = () => { ice.visible = winter.value > 0.001; };
    sync();
    if (typeof requestAnimationFrame !== 'undefined') { const loop = () => { sync(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  }
  scene.add(root);
  // The Eisstadion's outline as a floor plan for js/controllers.js keepOutOfBuildings: its walls stand round the stands,
  // well outside the OSM footprint (w37221744 is the inner hall), so whoever got in between (a gap at a gable, a way led
  // across a corner) was walled in with no floor plan to put him out
  const ring = EISSTADION.outline.map((p) => ({ x: p.x, z: p.z }));
  const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z);
  const interiors = [{ id: 'eisstadion', ring, holes: [], minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), maxY: EISSTADION.eaves + EISSTADION.apex.h }]; // (up to the apex: on the stands' roof too)
  return { group: root, colliders, interiors };
}
