import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, mx_noise_float, normalWorld, positionView, positionWorld, smoothstep, step, texture, time, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { snowyRoof, winter } from './season.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import {
  EISSTADION, KONGRESS, EISBAHN, PARSENN, LANDMARK_EXCLUSIONS, stadiumVerge, stadiumFacets, stadiumRoofHeight, trackOutline,
  ringPoints, pointInRing
} from './landmark-buildings-data.js';

// Landmarks of Davos Platz rebuilt by hand from the survey (js/landmark-buildings-data.js), standing in for their
// swissBUILDINGS3D volumes (left out of the streamed tiles: js/swissbuildings3d.js excludeBuildings):
//  - the Eisstadion: the surveyed timber roof (two crossed gables, the apex 33 m over the ground) on the concrete
//    stands' octagon with their flat roof 10.4 m up, larch fascias and soffits, the four glazed gables over the stands,
//    the north stand's glazed annex
//  - the Kongresszentrum with the Kongress Hotel and the eau-là-là: every part at its surveyed outline and height, in
//    its own skin (Gisel's board-marked concrete with ribbon windows, Degelo's larch hall with the glazed entrance
//    under the overhang, the hotel's white plaster, the pool's dark timber and its glazing towards the park), the roofs
//    under their solar panels; the outdoor pool and the slide's helix
//  - the Natureisbahn: ice over the track, the pitch and the court in winter (the summer's sports ground is the
//    orthophoto's)
//  - the Parsennbahn's valley station in Davos Dorf: white walls with red window frames and red-white bands, the glazed
//    shop on the ground floor, its lettering, banner, entrance sign and roof flags from one small canvas atlas
// All of it merged into one mesh per material (14 draw calls in all); the facades' detail (boards, mullions, windows,
// panels) is drawn by the materials from the walls' uv (metres along the wall, metres over the ground), not modelled,
// and fades to its mean colour with distance. Windows glow at dusk and night like the other buildings'
// (cityUniforms.uInteriorGlow).

excludeBuildings(LANDMARK_EXCLUSIONS);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------------
// The mobile profile (js/quality.js simpleMaterials): every skin in its mean colour, the windowed ones with a plain lit
// band per floor at night, the roofs white in winter; no boards, mullions, noise or per-window hashes (a third of the
// WGSL: ~8-9 KB each instead of ~22-26 KB, after an iPhone's GPU process died while compiling them)
function simpleMaterials() {
  const V = uv().y;
  const iGlow = cityUniforms.uInteriorGlow;
  const glow = smoothstep(0.7, 1.45, iGlow);
  const warm = vec3(1.0, 0.66, 0.36);
  // a lit band per floor (`h` m), windows only on walls whose v is >= 0 (as above)
  const band = (h, lo, hi) => step(0, V).mul(step(lo, fract(V.div(h)))).mul(step(fract(V.div(h)), hi));
  const snowRoof = (c) => mix(c, vec3(0.84, 0.86, 0.9), smoothstep(0.35, 0.6, normalWorld.y).mul(winter));
  const make = (c, roughness, metalness = 0, extra = {}) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness, ...extra });
    m.colorNode = c;
    return m;
  };
  const M = {};
  const windowed = (c, h, lo, hi, roughness, strength) => {
    const b = band(h, lo, hi);
    const m = make(mix(c, vec3(0.03, 0.035, 0.04), b), roughness);
    m.emissiveNode = warm.mul(b).mul(glow.mul(strength));
    return m;
  };
  M.larch = windowed(vec3(0.3, 0.16, 0.07), 3.8, 0.35, 0.75, 0.82, 0.6);
  M.concrete = windowed(vec3(0.23, 0.225, 0.21), 3.8, 0.38, 0.79, 0.9, 0.5);
  M.darkwood = windowed(vec3(0.06, 0.034, 0.02), 3.6, 0.31, 0.71, 0.8, 0.5);
  M.plaster = windowed(vec3(0.65, 0.65, 0.63), 2.9, 0.29, 0.81, 0.9, 0.4);
  M.glass = make(vec3(0.24, 0.28, 0.31), 0.08, 0.85);
  M.glass.emissiveNode = vec3(1.0, 0.8, 0.58).mul(glow.mul(0.45));
  M.roofSolar = make(snowRoof(vec3(0.1, 0.1, 0.11)), 0.6, 0.2);
  M.roofGravel = make(snowRoof(vec3(0.27, 0.26, 0.25)), 0.92);
  M.stadiumRoof = make(snowRoof(vec3(0.09, 0.065, 0.05)), 0.7, 0.1);
  M.metal = new THREE.MeshStandardNodeMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.7 });
  M.parsenn = windowed(vec3(0.71, 0.71, 0.69), 3.2, 0.24, 0.72, 0.85, 0.4);
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    const map = parsennAtlas();
    m.colorNode = texture(map, uv()).rgb;
    M.parsennSigns = m;
  }
  M.slide = make(vec3(0.4, 0.42, 0.43), 0.3, 0.05);
  M.water = make(vec3(0.04, 0.26, 0.32), 0.04, 0.3);
  M.water.emissiveNode = vec3(0.05, 0.4, 0.55).mul(smoothstep(0.6, 1.3, iGlow).mul(0.8));
  M.ice = make(vec3(0.3, 0.37, 0.42), 0.2, 0.3, { transparent: true });
  M.ice.opacityNode = winter;
  M.ice.depthWrite = true;
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
    const metal = mix(vec3(0.07, 0.05, 0.04), vec3(0.11, 0.08, 0.06), weather).mul(float(1).add(seam.mul(0.35)));
    r3.colorNode = snowyRoof(metal, float(1));
    M.stadiumRoof = r3;
  }
  M.metal = new THREE.MeshStandardNodeMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.7 });
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
  return M;
}

// The Parsennbahn station's lettering, in one small canvas (logical 512 × 256 px; half that on the mobile profile): the
// texts as plain type (the trademarks of Davos Klosters Bergbahnen AG are not reproduced, see assets/logos/SOURCES.md)
const PARSENN_ATLAS = {
  W: 512, H: 256,
  davos: [0, 0, 512, 72], banner: [0, 72, 512, 48], logo: [0, 120, 256, 64], entrance: [256, 120, 256, 64],
  flag: [0, 184, 448, 72], metal: [448, 184, 64, 72]
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
    B.tri('larch', d(pts[0]), d(pts[1]), d(pts[2]), uvs[0], uvs[1], uvs[2], [0, -1, 0]);
  }
  // The larch fascia along the roof's edge, facing out (away from the apex)
  const verge = stadiumVerge(S);
  const us = [0];
  for (let i = 1; i <= verge.length; i++) { const a = verge[i - 1], b = verge[i % verge.length]; us.push(us[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const away = (a, b) => { const n = [(a.x + b.x) / 2 - A.x, (a.z + b.z) / 2 - A.z], l = Math.hypot(...n); return [n[0] / l, n[1] / l]; };
  verge.forEach((P, i) => {
    const Q = verge[(i + 1) % verge.length];
    B.wall('larch', P.x, P.z, Q.x, Q.z, floorY + P.h - T, floorY + Q.h - T, floorY + P.h + 0.05, floorY + Q.h + 0.05, away(P, Q), us[i], floorY, false);
  });
  // The stands: the concrete outer wall round the outline up to the eaves (a low parapet over the roof), their flat
  // gravel roof between the outline and the pitched roof
  const parapet = eaves + 0.3;
  let u = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], n = outward(outline, a, b);
    for (const [p, q, t0] of pieces(a, b, 3)) {
      const gp = groundHeight(p[0], p[1]), gq = groundHeight(q[0], q[1]);
      B.wall('concrete', p[0], p[1], q[0], q[1], Math.min(gp, floorY) - 0.5, Math.min(gq, floorY) - 0.5, parapet, parapet, n, u + t0, floorY, false);
    }
    wallCollider(colliders, a, b, floorY - 0.5, parapet, 1.2);
    u += Math.hypot(b[0] - a[0], b[1] - a[1]);
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
        B.wall('glass', p[0], p[1], q[0], q[1], eaves - 0.3, eaves - 0.3, Math.max(eaves - 0.3, rp), Math.max(eaves - 0.3, rq), n, ug + t0, eaves);
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
    B.wall('glass', a[0], a[1], b[0], b[1], eaves - 0.3, eaves - 0.3, top, top, n, ua, eaves);
    B.wall('larch', a[0] + n[0] * 0.06, a[1] + n[1] * 0.06, b[0] + n[0] * 0.06, b[1] + n[1] * 0.06, top - 0.6, top - 0.6, top + 0.1, top + 0.1, n, ua, floorY, false);
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
