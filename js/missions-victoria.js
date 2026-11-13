import * as THREE from 'three/webgpu';
import { setLocalizedText } from './i18n.js';
import { el, clamp, live, swallow, gameKey, addStyle, box, cyl, solid, meshOf, textPlane, glow, makeCrowd, poseCrowd, Room, blip, flashPop } from './missions-gastro.js';
import {
  CHORES, CHORE_KEYS, HOUSEKEEPING, hkStep, hkPick, hkStroke, hkRoom, hkAllowed, hkProgress, createHousekeeping,
  DISHES, KITCHEN, KITCHEN_ORDERS, createKitchen, kitchenStep, kitchenPress,
  LINEN, LAUNDRY, createLaundry, laundrySort, laundryStep, sortWindow, victoriaScore
} from './missions-data-victoria.js';

// js/missions-victoria.js
// The runtime of the shift at the Turmhotel Victoria (js/missions-data-victoria.js has the definition and the three
// games' pure logic): js/missions.js merges VICTORIA_FEATURES into its features. The rooms float above the staff door
// like js/missions-gastro.js's bars (its Room, geometry helpers, crowd, sounds and HUD style are reused here), each built
// when its step begins and disposed when the next one starts:
//  - housekeeping: a hotel room seen from the door: the bed made as it is worked, the towels from the floor to the rail,
//    the grime fading from the bath and the mirror, the bin emptied, the minibar filled. Seven chore buttons, two pads.
//  - kitchen: the stove from above, three pans whose contents brown as they cook, the tickets on the pass; three burner
//    buttons, each with its doneness gauge.
//  - laundry: the Lingerie: the linen over two baskets (whites left, colours right), then the mangle's feed table with
//    the sheet running into the rollers, its sideways drift on a gauge; two pads, held to steer.

const STYLE = `
.vc-row{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;width:min(560px,calc(100vw - 12px))}
.vc-row[hidden],.vc-pads[hidden],.vc-bar[hidden],.vc-chips[hidden]{display:none!important}
.vc-row.three{grid-template-columns:repeat(3,1fr)}
.vc-row .gs-top{font-size:11.5px;justify-content:center;min-height:46px;line-height:1.15}
.vc-row .gs-top.on{background:#7b4fa0;border-color:#d9b8ff;box-shadow:0 0 14px rgba(170,110,230,.7)}
.vc-row .gs-top.done{opacity:.4;text-decoration:line-through}
.vc-row .gs-top:disabled{opacity:.32}
.vc-row .gs-top b{display:block;width:100%;height:7px;margin-top:3px;border-radius:4px;background:rgba(255,255,255,.16);position:relative;overflow:hidden}
.vc-row .gs-top b u{position:absolute;top:0;bottom:0;background:#3fbf6b;text-decoration:none}
.vc-row .gs-top b s{position:absolute;top:-1px;bottom:-1px;width:4px;margin-left:-2px;background:#fff;text-decoration:none}
.vc-row .gs-top b.fill s{display:none}
.vc-row .gs-top b.fill u{left:0;background:#b98ce8}
.vc-pads{display:flex;gap:10px;justify-content:center;width:100%}
.vc-pads .gs-act{min-width:0;flex:1;max-width:240px;padding:12px 10px;font-size:17px;background:linear-gradient(180deg,#9a6cc4,#5e3486);box-shadow:0 6px 18px rgba(94,52,134,.45)}
.vc-pads .gs-act.held{filter:brightness(1.35);transform:scale(.97)}
.vc-bar{height:9px;margin-top:6px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden}
.vc-bar span{display:block;height:100%;transform-origin:left;background:linear-gradient(90deg,#3fbf6b,#f2b632 70%,#e8391f)}
.vc-chips{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:5px}
.vc-swatch{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px;border:1px solid rgba(255,255,255,.5)}
@media (max-width:520px){.vc-row .gs-top{font-size:10.5px;min-height:42px}}
`;

const STATIONS = ['housekeeping', 'kitchen', 'laundry'];
const _d = new THREE.Color();

// =====================================================================================================================
// The rooms
// =====================================================================================================================
const flatMat = (color, opacity = 1) => new THREE.MeshBasicNodeMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
const disc = (r, color, opacity = 1) => meshOf(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), flatMat(color, opacity));

/** The hotel room (5.5 × 5 m), seen from the door: the bed on the left, the bath and the mirror on the right */
function buildHotelRoom(group, parts, roomIndex) {
  const suite = roomIndex > 0;
  const W = 5.6, D = 5, H = 2.7, hw = W / 2, hd = D / 2, WALL = suite ? 0xd9c8a8 : 0xe8e0cf, WOOD = suite ? 0x6b4325 : 0x8a5a34;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, suite ? 0x7a2a32 : 0x4a5a7a), // the carpet
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, WALL), box(W, H, 0.2, 0, H / 2, hd + 0.1, WALL),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, WALL), box(0.2, H, D, hw + 0.1, H / 2, 0, WALL),
    box(W, 0.2, D, 0, H + 0.1, 0, 0xf4f0e6),
    // the window in the back wall: its frame, the sky and the Seehorn beyond
    box(1.6, 1.3, 0.04, -0.4, 1.55, -hd + 0.02, 0xffffff), box(1.45, 1.15, 0.03, -0.4, 1.55, -hd + 0.05, 0x9cc6e8),
    box(1.45, 0.42, 0.02, -0.4, 1.18, -hd + 0.07, 0x6f8a6a), box(0.05, 1.15, 0.03, -0.4, 1.55, -hd + 0.07, 0xffffff),
    // the bed: its frame and headboard, the mattress
    box(1.7, 0.32, 2.1, -1.55, 0.16, -1.15, WOOD), box(1.8, 1.0, 0.08, -1.55, 0.5, -2.22, WOOD), box(1.62, 0.2, 2.0, -1.55, 0.42, -1.15, 0xf6f4ee),
    // the bedside tables, the lamp
    box(0.45, 0.5, 0.4, -0.45, 0.25, -2.0, WOOD), cyl(0.06, 0.09, 0.32, -0.45, 0.66, -2.0, 0xd8c39a), cyl(0.16, 0.12, 0.2, -0.45, 0.9, -2.0, 0xf3e7c8),
    // the bathroom corner: the tub, its rim; the basin and the mirror on the right wall; the towel rail
    box(0.8, 0.55, 1.7, 2.35, 0.275, -1.55, 0xf6f6f2), box(0.62, 0.02, 1.5, 2.35, 0.545, -1.55, 0xdfe8ec),
    box(0.5, 0.18, 0.42, 2.5, 0.85, 0.35, 0xf6f6f2), cyl(0.04, 0.04, 0.85, 2.5, 0.42, 0.35, 0xe0e0dc), box(0.04, 0.03, 1.0, 2.68, 1.35, -0.6, 0xb8bec6),
    box(0.03, 0.9, 0.7, 2.78, 1.55, 0.35, 0xc8d6de), // the mirror's frame
    // the housekeeping trolley by the door
    box(0.5, 0.06, 0.9, 1.1, 0.25, 1.9, 0x5a5f66), box(0.5, 0.06, 0.9, 1.1, 0.7, 1.9, 0x5a5f66), box(0.5, 0.06, 0.9, 1.1, 1.0, 1.9, 0x5a5f66),
    box(0.4, 0.22, 0.35, 1.1, 0.84, 1.68, 0xffffff), box(0.4, 0.22, 0.35, 1.1, 0.84, 2.1, 0xf2f0ea), box(0.44, 0.3, 0.6, 1.1, 0.44, 1.9, 0x3a6aa0)
  ];
  group.add(solid(room));
  const sign = textPlane(suite ? 'TOWER SUITE' : 'ROOM 204', 0.9, 0.16, { bg: '#2a1a3a', fg: '#e8d29a', font: '700 90px Georgia, serif' });
  sign.position.set(-1.55, 1.25, -2.17);
  group.add(sign);
  // the duvet: crumpled (tilted, lumps) → smooth; the pillows tossed → square; the chocolate on the pillow
  const duvet = meshOf(new THREE.BoxGeometry(1.66, 0.1, 1.5), flatMat(suite ? 0xf8f3e6 : 0xf4f6fa));
  group.add(duvet);
  const lumps = [];
  for (let i = 0; i < 5; i++) { const l = meshOf(new THREE.SphereGeometry(0.22, 8, 6), flatMat(0xe6e8ee)); l.position.set(-1.55 + (i % 3 - 1) * 0.45, 0.6, -0.8 + (i >> 1) * 0.3 - 0.3); l.scale.set(1.3, 0.45, 1); group.add(l); lumps.push(l); }
  const pillows = [0, 1].map((i) => { const p = meshOf(new THREE.BoxGeometry(0.62, 0.14, 0.4), flatMat(0xffffff)); group.add(p); return p; });
  const choc = solid([box(0.09, 0.02, 0.06, 0, 0, 0, 0x4a2414), box(0.092, 0.006, 0.02, 0, 0.012, 0, 0xd8b45a)]);
  choc.position.set(-1.55, 0.68, -1.85);
  group.add(choc);
  // the towels: in a heap by the tub → folded over the rail
  const heap = solid([box(0.5, 0.12, 0.4, 0, 0.06, 0, 0xffffff), box(0.4, 0.1, 0.35, 0.08, 0.15, 0.05, 0xf0f0ec)]);
  heap.position.set(1.7, 0, -0.35);
  heap.rotation.y = 0.5;
  group.add(heap);
  const rail = solid([box(0.08, 0.5, 0.42, 0, -0.25, -0.24, 0xffffff), box(0.08, 0.42, 0.42, 0, -0.21, 0.24, 0xf6f6f2)]);
  rail.position.set(2.66, 1.35, -0.6);
  group.add(rail);
  // the grime in the tub and on the mirror (fades as it is scrubbed)
  const grimeMat = flatMat(0x7a6040, 0.75), smudgeMat = flatMat(0x8a8f80, 0.6);
  const grime = [[2.3, -1.9, 0.22], [2.42, -1.35, 0.16], [2.28, -0.95, 0.13], [2.4, -1.6, 0.1]].map(([x, z, r]) => { const d = meshOf(new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2), grimeMat); d.position.set(x, 0.56, z); group.add(d); return d; });
  const mirror = meshOf(new THREE.PlaneGeometry(0.6, 0.8), flatMat(0xb8d4e2));
  mirror.rotation.y = -Math.PI / 2;
  mirror.position.set(2.76, 1.55, 0.35);
  group.add(mirror);
  const smudges = [[0.18, 1.7, 0.12], [0.5, 1.45, 0.1], [0.3, 1.32, 0.08]].map(([z, y, r]) => { const d = meshOf(new THREE.CircleGeometry(r, 12), smudgeMat); d.rotation.y = -Math.PI / 2; d.position.set(2.75, y, z); group.add(d); return d; });
  // the bin with its paper; the minibar (the suite's) with its bottles
  group.add(solid([cyl(0.15, 0.12, 0.34, 0.15, 0.17, -2.1, 0x8a8f96, 12)]));
  const paper = [0, 1, 2, 3].map((i) => { const p = meshOf(new THREE.IcosahedronGeometry(0.06, 0), flatMat(0xf2f2ee)); p.position.set(0.12 + (i % 2) * 0.07, 0.36 + (i >> 1) * 0.06, -2.1 + (i % 3 - 1) * 0.04); group.add(p); return p; });
  const minibar = new THREE.Group();
  minibar.add(solid([box(0.5, 0.55, 0.45, 0, 0.275, 0, 0x2a2a2e), box(0.42, 0.02, 0.37, 0, 0.28, 0.02, 0x9aa0a8)]));
  const door = solid([box(0.5, 0.55, 0.04, 0.25, 0.275, 0, 0x34343a)]);
  door.position.set(-0.25, 0, 0.245);
  door.rotation.y = -1.2;
  minibar.add(door);
  const bottleCols = [0x2e6b2a, 0xd8c47a, 0x7a3b12, 0xc8e4f2, 0xa8261a, 0x2e6b2a, 0xd8c47a, 0x7a3b12];
  const bottles = bottleCols.map((c, i) => { const b = solid([cyl(0.025, 0.025, 0.14, -0.15 + (i % 4) * 0.1, 0.07 + 0.3 * (i >> 2) + 0.02, 0.05, c, 6)]); minibar.add(b); return b; });
  minibar.position.set(0.55, 0, -2.05);
  minibar.visible = suite;
  group.add(minibar);
  // the light: a warm glow by the lamp
  const halo = glow(1.2, 1.2, 0xffd9a0, 0.25);
  halo.position.set(-0.45, 1.0, -1.9);
  group.add(halo);
  Object.assign(parts, { duvet, lumps, pillows, choc, heap, rail, grime, grimeMat, smudges, smudgeMat, paper, bottles, door, halo });
}

/** The room as far as the chores have got */
function poseHotelRoom(p, g, cam) {
  const pr = (id) => (hkRoom(g).chores.includes(id) ? hkProgress(g, id) : 1);
  const bed = pr('bed');
  p.duvet.position.set(-1.55 + 0.12 * (1 - bed), 0.57 + 0.04 * (1 - bed), -0.85 + 0.25 * (1 - bed));
  p.duvet.rotation.set(0.12 * (1 - bed), 0.35 * (1 - bed), 0.18 * (1 - bed));
  p.lumps.forEach((l, i) => { const k = clamp((1 - bed) * 1.25 - i * 0.05, 0, 1); l.visible = k > 0.02; l.scale.set(1.3 * k, 0.45 * k, k); });
  p.pillows.forEach((pl, i) => {
    const x = -1.55 + (i ? 0.38 : -0.38);
    pl.position.set(x + (1 - bed) * (i ? 0.35 : -0.1), 0.6 + (1 - bed) * 0.05, -1.9 + (1 - bed) * (i ? 0.7 : 0.2));
    pl.rotation.set((1 - bed) * 0.4, (1 - bed) * (i ? 1.1 : -0.6), (1 - bed) * (i ? 0.5 : -0.3));
  });
  p.choc.visible = hkRoom(g).chores.includes('chocolate') && pr('chocolate') >= 1;
  const tw = pr('towels');
  p.heap.scale.setScalar(Math.max(0.001, 1 - tw)); p.heap.visible = tw < 1;
  p.rail.scale.set(1, Math.max(0.001, tw), 1); p.rail.visible = tw > 0;
  p.grimeMat.opacity = 0.75 * (1 - pr('bath'));
  p.smudgeMat.opacity = 0.6 * (1 - pr('mirror'));
  const bin = pr('bin');
  p.paper.forEach((x, i) => { x.visible = bin < 1 - i * 0.25; });
  const mb = pr('minibar');
  p.bottles.forEach((b, i) => { b.visible = mb * p.bottles.length > i; });
  p.door.rotation.y = mb >= 1 ? 0 : -1.2;
  p.halo.quaternion.copy(cam.quaternion);
}

// (where the portrait camera looks while a chore is worked: the narrow view cannot hold the whole room)
const CHORE_SPOT = { bed: [-1.45, 0.45, -1.2], towels: [2.2, 0.7, -0.5], bath: [2.2, 0.45, -1.45], mirror: [2.5, 1.3, 0.3], bin: [0.2, 0.3, -2.0], minibar: [0.5, 0.35, -2.0], chocolate: [-1.5, 0.55, -1.8] };
const _look = new THREE.Vector3();

const BURNER_X = [-0.5, 0, 0.5];
/** The hotel kitchen: the stove in the middle of the view, the pass behind it with its heat lamps */
function buildKitchen(group, parts) {
  const W = 6, D = 5, H = 2.8, hw = W / 2, hd = D / 2, TILE = 0xe8ebe8, STEEL = 0xa9afb5;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, 0x8a8478),
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, TILE), box(W, H, 0.2, 0, H / 2, hd + 0.1, TILE),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, TILE), box(0.2, H, D, hw + 0.1, H / 2, 0, TILE),
    box(W, 0.2, D, 0, H + 0.1, 0, 0xf1f2f0),
    // the stove block: its steel body, the black top, the three burners
    box(1.8, 0.88, 0.9, 0, 0.44, -0.2, STEEL), box(1.82, 0.04, 0.92, 0, 0.9, -0.2, 0x26282a),
    ...BURNER_X.map((x) => cyl(0.17, 0.17, 0.012, x, 0.925, -0.2, 0x3a3c3e, 18)),
    ...BURNER_X.map((x) => box(0.08, 0.06, 0.03, x, 0.7, 0.26, 0x1c1c1e)),
    // the pass: a steel shelf under the heat lamps, the counters along the back
    box(2.6, 0.06, 0.45, 0, 1.4, -1.25, STEEL), box(0.06, 0.5, 0.45, -1.27, 1.15, -1.25, STEEL), box(0.06, 0.5, 0.45, 1.27, 1.15, -1.25, STEEL),
    box(2.6, 0.06, 0.3, 0, 1.95, -1.25, 0x5a5f66),
    box(W - 0.4, 0.9, 0.7, 0, 0.45, -hd + 0.35, STEEL), box(W - 0.4, 0.04, 0.72, 0, 0.92, -hd + 0.35, 0xc8ccd0),
    box(1.2, 0.75, 0.04, -2.2, 1.6, -hd + 0.03, 0xc8ccd0), // (the menu board's frame)
    // pots on the shelf, a stack of plates
    cyl(0.18, 0.18, 0.3, -1.9, 1.07, -hd + 0.35, 0x9aa0a6, 14), cyl(0.14, 0.14, 0.22, -1.4, 1.03, -hd + 0.35, 0x9aa0a6, 14),
    ...[0, 1, 2, 3, 4, 5].map((i) => cyl(0.13, 0.11, 0.018, 1.0, 1.44 + i * 0.02, -1.25, 0xffffff, 16))
  ];
  group.add(solid(room));
  const menu = textPlane('MITTAGSMENU', 1.1, 0.22, { bg: '#1d2b20', fg: '#f4ecd8', font: '700 80px Georgia, serif' });
  menu.position.set(-2.2, 1.8, -hd + 0.06);
  group.add(menu);
  // the pans: steel, a handle, the food (a disc coloured by its doneness), the burner's glow, steam and smoke
  const pans = BURNER_X.map((x) => {
    const pan = new THREE.Group();
    pan.add(solid([cyl(0.15, 0.13, 0.06, 0, 0.03, 0, 0x45484c, 20), box(0.03, 0.02, 0.26, 0, 0.05, 0.27, 0x1e1e20)]));
    const food = disc(0.125, 0xe0b04a);
    food.position.y = 0.064;
    pan.add(food);
    pan.position.set(x, 0.93, -0.2);
    group.add(pan);
    const fire = glow(0.5, 0.5, 0xff5020, 0.0);
    fire.rotation.x = -Math.PI / 2;
    fire.position.set(x, 0.932, -0.2);
    group.add(fire);
    const steam = glow(0.35, 0.5, 0xffffff, 0.0);
    steam.position.set(x, 1.15, -0.2);
    group.add(steam);
    const smoke = glow(0.55, 0.7, 0x3a3836, 0.0);
    Object.assign(smoke.material, { blending: THREE.NormalBlending, alphaMap: smoke.material.map, map: null }); // (the glow's falloff as its alpha: grey smoke, no dark square)
    smoke.material.needsUpdate = true;
    smoke.position.set(x, 1.25, -0.2);
    group.add(smoke);
    return { pan, food, fire, steam, smoke };
  });
  // the tickets on the pass (one for each waiting order) and the plates that go out
  const tickets = Array.from({ length: 6 }, (_, i) => { const t = meshOf(new THREE.PlaneGeometry(0.1, 0.16), flatMat(0xfffbe8)); t.position.set(-1.0 + i * 0.16, 1.82, -1.1); group.add(t); return t; });
  const plates = Array.from({ length: KITCHEN_ORDERS.length }, (_, i) => {
    const pl = new THREE.Group();
    pl.add(solid([cyl(0.12, 0.1, 0.02, 0, 0.01, 0, 0xffffff, 18)]));
    const f = disc(0.075, 0xe0b04a);
    f.position.y = 0.023;
    pl.add(f);
    pl.food = f;
    pl.position.set(-1.05 + (i % 8) * 0.3, 1.43, -1.25);
    pl.visible = false;
    group.add(pl);
    return pl;
  });
  Object.assign(parts, { pans, tickets, plates });
}
const RAW = new THREE.Color(0xf2e6c8), BURNT = new THREE.Color(0x2a1a10);
function foodColour(dish, d, out) {
  _d.set(DISHES[dish].colour);
  if (d < 1) return out.copy(RAW).lerp(_d, clamp(d, 0, 1));
  return out.copy(_d).lerp(BURNT, clamp((d - 1) / (KITCHEN.burnt - 1), 0, 1));
}
function poseKitchen(p, g, cam, t) {
  p.pans.forEach((q, i) => {
    const pan = g.pans[i];
    q.food.visible = !!pan;
    q.fire.material.opacity = pan ? 0.35 + 0.05 * Math.sin(t * 9 + i) : 0;
    q.steam.visible = !!pan && pan.d > 0.35 && pan.d < KITCHEN.window[1];
    q.smoke.visible = !!pan && pan.d > KITCHEN.window[1];
    if (!pan) return;
    const dish = KITCHEN_ORDERS[pan.order].dish;
    foodColour(dish, pan.d, q.food.material.color);
    q.food.scale.setScalar(dish === 'wurst' ? 0.75 : 1);
    q.steam.material.opacity = 0.12 + 0.06 * Math.sin(t * 3 + i);
    q.steam.position.y = 1.12 + 0.05 * ((t * 0.7 + i * 0.3) % 1);
    q.steam.quaternion.copy(cam.quaternion);
    q.smoke.material.opacity = clamp((pan.d - KITCHEN.window[1]) / (KITCHEN.burnt - KITCHEN.window[1]), 0, 1) * 0.6;
    q.smoke.quaternion.copy(cam.quaternion);
    q.pan.position.x = BURNER_X[i] + (pan.d > 1.2 ? 0.004 * Math.sin(t * 40) : 0);
  });
  p.tickets.forEach((tk, i) => { tk.visible = i < g.queue.length; });
  p.plates.forEach((pl, i) => {
    const s = g.served[i];
    pl.visible = !!s && !s.burnt;
    if (pl.visible) foodColour(KITCHEN_ORDERS[s.order].dish, s.d, pl.food.material.color);
  });
}

/** The Lingerie: the washers along the back, the two baskets on the left, the mangle on the right */
const MANGLE_X = 1.6, ROLLER_Z = -0.75, FEED_Z0 = 0.55, SHEET_W = 1.3, MANGLE_Y = 0.92;
function buildLaundry(group, parts) {
  const W = 7, D = 5, H = 2.7, hw = W / 2, hd = D / 2, WALL = 0xcfdcd6;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, 0x9a9a94),
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, WALL), box(W, H, 0.2, 0, H / 2, hd + 0.1, WALL),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, WALL), box(0.2, H, D, hw + 0.1, H / 2, 0, WALL),
    box(W, 0.2, D, 0, H + 0.1, 0, 0xe6ece8),
    // pipes along the ceiling
    box(W, 0.1, 0.1, 0, H - 0.2, -hd + 0.2, 0xb08a5a), box(W, 0.08, 0.08, 0, H - 0.34, -hd + 0.2, 0x9aa0a6),
    // the washing machines, three industrial front loaders
    ...[-2.9, -1.95, -1.0].flatMap((x) => [box(0.9, 1.1, 0.85, x, 0.55, -hd + 0.5, 0xf2f2ee), box(0.92, 0.12, 0.87, x, 1.16, -hd + 0.5, 0x6c7f94)]),
    // the sorting table between the baskets
    box(0.9, 0.06, 0.6, -1.95, 0.86, -0.6, 0xb89a6a), box(0.06, 0.84, 0.06, -2.33, 0.42, -0.85, 0x7a6a4a), box(0.06, 0.84, 0.06, -1.57, 0.42, -0.85, 0x7a6a4a), box(0.06, 0.84, 0.06, -2.33, 0.42, -0.35, 0x7a6a4a), box(0.06, 0.84, 0.06, -1.57, 0.42, -0.35, 0x7a6a4a),
    // the baskets: whites (left) and colours (right)
    box(0.7, 0.5, 0.5, -2.75, 0.25, -0.2, 0xe8e4d6), box(0.6, 0.04, 0.4, -2.75, 0.46, -0.2, 0xffffff),
    box(0.7, 0.5, 0.5, -1.15, 0.25, -0.2, 0x3a62a8), box(0.6, 0.04, 0.4, -1.15, 0.46, -0.2, 0xc4262e),
    // the mangle: its two side frames, the heated drum's housing, the feed table, the folding table behind
    box(0.2, 1.15, 0.9, MANGLE_X - 1.35, 0.575, ROLLER_Z, 0x3a5a7a), box(0.2, 1.15, 0.9, MANGLE_X + 1.35, 0.575, ROLLER_Z, 0x3a5a7a),
    box(2.5, 0.35, 0.5, MANGLE_X, 1.25, ROLLER_Z - 0.1, 0x4a6a8a),
    box(2.6, 0.04, 1.3, MANGLE_X, MANGLE_Y - 0.02, (FEED_Z0 + ROLLER_Z) / 2 + 0.1, 0xd8dcde), box(2.6, 0.82, 0.1, MANGLE_X, 0.45, FEED_Z0 + 0.25, 0x3a5a7a),
    box(1.6, 0.06, 0.6, MANGLE_X, 0.85, -hd + 0.4, 0xb89a6a),
    // the green marks on the feed table's edges: the middle and how far it may wander
    box(0.02, 0.006, 1.2, MANGLE_X - SHEET_W / 2 - 0.03, MANGLE_Y + 0.003, 0.0, 0x3fbf6b), box(0.02, 0.006, 1.2, MANGLE_X + SHEET_W / 2 + 0.03, MANGLE_Y + 0.003, 0.0, 0x3fbf6b),
    box(0.02, 0.006, 1.2, MANGLE_X - SHEET_W / 2 - LAUNDRY.jam * SHEET_W, MANGLE_Y + 0.003, 0.0, 0xd83a2a), box(0.02, 0.006, 1.2, MANGLE_X + SHEET_W / 2 + LAUNDRY.jam * SHEET_W, MANGLE_Y + 0.003, 0.0, 0xd83a2a)
  ];
  group.add(solid(room));
  for (const [text, x, bg, fg] of [['WHITES', -2.75, '#f6f3e8', '#2a2a2a'], ['COLOURS', -1.15, '#c4262e', '#ffffff']]) {
    const s = textPlane(text, 0.6, 0.14, { bg, fg, font: '900 100px Inter, Arial, sans-serif' });
    s.position.set(x, 0.32, 0.055);
    group.add(s);
  }
  const sign = textPlane('LINGERIE', 1.4, 0.24, { bg: '#2a1a3a', fg: '#e8d29a', font: '700 90px Georgia, serif' });
  sign.position.set(1.8, 2.15, -hd + 0.03);
  group.add(sign);
  // the washers' round doors (they spin while washing)
  const drums = [-2.9, -1.95, -1.0].map((x) => {
    const d = new THREE.Group();
    d.add(solid([cyl(0.3, 0.3, 0.05, 0, 0, 0, 0x9aa0a6, 20), cyl(0.24, 0.24, 0.06, 0, 0, 0, 0x5a7a9a, 20), box(0.05, 0.06, 0.4, 0, 0.012, 0, 0xe0e4e8)]));
    d.rotation.x = Math.PI / 2;
    d.position.set(x, 0.62, -hd + 0.94);
    group.add(d);
    return d;
  });
  // the roller (turns), the item being sorted, the sheet on the feed table, the folded stack
  const roller = solid([cyl(0.16, 0.16, 2.48, 0, 0, 0, 0xc8ccd0, 18), box(0.33, 2.48, 0.03, 0, 0, 0, 0x9aa0a6)]);
  roller.rotation.z = Math.PI / 2;
  roller.position.set(MANGLE_X, MANGLE_Y + 0.12, ROLLER_Z + 0.12);
  group.add(roller);
  const item = meshOf(new THREE.BoxGeometry(0.5, 0.05, 0.36), flatMat(0xffffff));
  item.position.set(-1.95, 0.92, -0.6);
  group.add(item);
  const sheet = meshOf(new THREE.PlaneGeometry(SHEET_W, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), flatMat(0xfbfbf8));
  sheet.position.set(MANGLE_X, MANGLE_Y + 0.006, ROLLER_Z + 0.1);
  group.add(sheet);
  const creases = [0, 1, 2].map((i) => { const c = meshOf(new THREE.PlaneGeometry(0.02, 0.8).rotateX(-Math.PI / 2), flatMat(0xbfc4c8)); c.position.y = MANGLE_Y + 0.008; group.add(c); return c; });
  const stack = Array.from({ length: LAUNDRY.sheets }, (_, i) => { const s = meshOf(new THREE.BoxGeometry(0.5, 0.05, 0.36), flatMat(0xf8f8f4)); s.position.set(MANGLE_X - 0.45 + (i % 2) * 0.6, 0.91 + Math.floor(i / 2) * 0.05, -2.1); s.visible = false; group.add(s); return s; });
  Object.assign(parts, { drums, roller, item, sheet, creases, stack });
}
const PINK = new THREE.Color(0xf4c4d0), WHITE = new THREE.Color(0xfbfbf8);
function poseLaundry(p, g, vc, t) {
  const sorting = g.phase === 'sort';
  p.item.visible = sorting || vc.drop > 0;
  if (sorting && vc.drop <= 0) {
    const it = LINEN[g.item];
    p.item.material.color.set(it.colour);
    const k = g.itemT / sortWindow(g);
    p.item.position.set(-1.95 + 0.02 * Math.sin(t * 7) * k, 0.92 + 0.04 * Math.sin(t * 3), -0.6);
    p.item.rotation.set(0, 0.2 * Math.sin(t * 2), 0);
  } else if (vc.drop > 0) { // flying into its basket
    const k = 1 - vc.drop / 0.35;
    p.item.position.set(-1.95 + vc.dropSide * 0.8 * k, 0.92 + 0.25 * Math.sin(k * Math.PI) - 0.4 * k, -0.6 + 0.3 * k);
    p.item.rotation.z = vc.dropSide * k * 1.2;
  }
  for (const d of p.drums) d.rotation.y = g.phase === 'wash' ? t * 9 : d.rotation.y;
  const feeding = g.phase === 'mangle';
  p.roller.rotation.x = (feeding || g.phase === 'gap') ? t * 4 : 0;
  p.sheet.visible = feeding;
  if (feeding) {
    const k = g.sheetT / LAUNDRY.sheetTime;
    p.sheet.scale.z = Math.max(0.001, (FEED_Z0 - ROLLER_Z) * (1 - k) + 0.1);
    p.sheet.position.x = MANGLE_X + g.off * SHEET_W;
    p.sheet.material.color.copy(g.pink ? PINK : WHITE);
    const a = Math.abs(g.off);
    p.creases.forEach((c, i) => {
      c.visible = a > LAUNDRY.green;
      c.position.set(p.sheet.position.x - 0.4 + i * 0.4 + 0.05 * Math.sin(t * 2 + i), MANGLE_Y + 0.008, ROLLER_Z + 0.1 + 0.4 * p.sheet.scale.z);
      c.scale.z = p.sheet.scale.z * 0.8;
      c.rotation.y = g.off * (i - 1) * 0.6;
    });
  } else p.creases.forEach((c) => { c.visible = false; });
  p.stack.forEach((s, i) => { const done = g.sheets[i]; s.visible = !!done && !done.jam; if (s.visible) s.material.color.copy(g.pink ? PINK : WHITE); });
}

// =====================================================================================================================
// The HUD: a line and a label, a slot (a gauge, a bar or chips), a row of buttons, two pads
// =====================================================================================================================
function makeHud(run) {
  addStyle(run);
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
  const hud = el('div', 'gs-hud gs-pizza');
  hud.hidden = true;
  const pop = el('div', 'gs-pop');
  const card = el('div', 'gs-card');
  const line = el('div'), label = el('div');
  const gauge = el('div', 'gs-gauge'), zone = el('span', 'gs-zone'), needle = el('span', 'gs-needle');
  gauge.append(zone, needle);
  const bar = el('div', 'vc-bar'), barFill = el('span');
  bar.append(barFill);
  const chips = el('div', 'vc-chips');
  card.append(line, label, gauge, bar, chips);
  const row = el('div', 'vc-row');
  const pads = el('div', 'vc-pads');
  const left = el('button', 'gs-act', '◀'), right = el('button', 'gs-act', '▶');
  left.type = right.type = 'button';
  pads.append(left, right);
  hud.append(pop, card, row, pads);
  document.body.append(hud);
  run.cleanups.push(() => hud.remove());
  return { hud, pop, line, label, gauge, zone, needle, bar, barFill, chips, row, pads, left, right, buttons: [], rowKey: '' };
}
const setText = (node, t) => { if (node._src !== t) { node._src = t; setLocalizedText(node, t); } }; // (the source kept: js/i18n.js translates it once)
const show = (node, on) => { if (node.hidden === on) node.hidden = !on; };

// =====================================================================================================================
// The feature
// =====================================================================================================================
const victoria = {
  setup(run) {
    const vc = run.vc = { room: null, key: null, parts: null, crowd: null, ui: makeHud(run), seq: 0, held: 0, t: 0, drop: 0, dropSide: 0, keys: { left: false, right: false } };
    const ui = vc.ui;
    const padDown = (side) => (e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* (a synthetic event) */ } victoria.side(run, side, true); };
    const padUp = (side) => () => victoria.side(run, side, false);
    for (const [b, side] of [[ui.left, -1], [ui.right, 1]]) {
      run.listen(b, 'pointerdown', padDown(side));
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) run.listen(b, ev, padUp(side));
      run.listen(b, 'contextmenu', (e) => e.preventDefault());
    }
    // (js/missions.js hands the features only keydown: the mangle is steered while a key is held)
    run.listen(window, 'keyup', (e) => {
      if (!vc.room) return;
      const side = e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : e.code === 'KeyD' || e.code === 'ArrowRight' ? 1 : 0;
      if (side) { swallow(e); victoria.side(run, side, false); }
    }, { capture: true });
    run.listen(window, 'blur', () => { vc.keys.left = vc.keys.right = false; });
  },
  reset(run) {
    const vc = run.vc;
    vc.room?.dispose(); vc.room = null; vc.key = null;
    vc.ui.hud.hidden = true;
    Object.assign(vc, { seq: 0, t: 0, drop: 0, dropSide: 0, look: null });
    vc.keys.left = vc.keys.right = false;
    if (run.state) Object.assign(run.state, { hk: null, kitchen: null, laundry: null, inside: false });
  },
  teardown(run) { run.vc.room?.dispose(); run.vc.room = null; },
  ownControls: (run) => !!run.vc.room,
  key(run, e) {
    if (!run.vc.room || !gameKey(e.code)) return;
    swallow(e);
    if (e.repeat) return;
    const side = e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : e.code === 'KeyD' || e.code === 'ArrowRight' ? 1 : 0;
    if (side) { victoria.side(run, side, true); return; }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) victoria.pick(run, +m[1] - 1);
  },
  station: (run) => run.def.objectives[run.index]?.id,
  /** A pad or a side key goes down (or up) */
  side(run, side, down) {
    const vc = run.vc, s = run.state, id = victoria.station(run);
    vc.keys[side < 0 ? 'left' : 'right'] = down;
    (side < 0 ? vc.ui.left : vc.ui.right).classList.toggle('held', down);
    if (!down || !live(run) || !vc.room) return;
    if (id === 'housekeeping' && s.hk) {
      const r = hkStroke(s.hk, side);
      if (r === 'stroke') blip(run, 'pock'); else if (r === 'chore') blip(run, 'good');
    } else if (id === 'laundry' && s.laundry?.phase === 'sort') {
      const r = laundrySort(s.laundry, side);
      if (r) { blip(run, r === 'right' ? 'pock' : 'bad'); vc.drop = 0.35; vc.dropSide = side; }
    }
  },
  /** A numbered button: a chore, or a burner */
  pick(run, i) {
    const s = run.state, id = victoria.station(run);
    if (!live(run) || !run.vc.room) return;
    if (id === 'housekeeping' && s.hk) {
      const r = hkPick(s.hk, CHORE_KEYS[i]);
      if (r) blip(run, r === 'pick' ? 'pock' : 'bad');
    } else if (id === 'kitchen' && s.kitchen) {
      const r = kitchenPress(s.kitchen, i);
      if (r === 'place') blip(run, 'fwoosh'); else if (r === 'plate') blip(run, 'pock');
    }
  },
  /** The room for this step (the housekeeping's second room is a room of its own) */
  enter(run, id) {
    const vc = run.vc, s = run.state;
    if (id === 'housekeeping' && !s.hk) s.hk = createHousekeeping();
    if (id === 'kitchen' && !s.kitchen) s.kitchen = createKitchen();
    if (id === 'laundry' && !s.laundry) s.laundry = createLaundry();
    const key = id === 'housekeeping' ? `${id}:${s.hk.room}` : id;
    if (vc.key === key) return;
    vc.room?.dispose();
    const parts = vc.parts = {};
    vc.room = new Room(run, run.def.interior.door, (group) => {
      if (id === 'housekeeping') {
        buildHotelRoom(group, parts, s.hk.room);
        vc.crowd = makeCrowd([window.innerHeight > window.innerWidth ? { x: 1.4, z: 1.7, yaw: -2.4, female: true } : { x: 0.6, z: -2.0, yaw: -0.59, female: true }], group); // (the Gouvernante, by the window; in portrait by the door, out of the narrow view)
      } else if (id === 'kitchen') {
        buildKitchen(group, parts);
        vc.crowd = makeCrowd([{ x: -2.2, z: -1.5, yaw: 0.5 }, { x: 1.8, z: -1.9, yaw: -0.5, female: true }], group);
      } else {
        buildLaundry(group, parts);
        vc.crowd = makeCrowd([{ x: 3.1, z: -1.9, yaw: -2.2, female: true }], group);
      }
    });
    vc.key = key;
    vc.ui.rowKey = '';
    s.inside = true;
    vc.ui.hud.hidden = false;
  },
  update(run, ctx, dt) {
    const vc = run.vc, s = run.state, id = victoria.station(run);
    if (!s || !live(run) || !STATIONS.includes(id)) return;
    victoria.enter(run, id);
    vc.t += dt;
    if (vc.drop > 0) vc.drop = Math.max(0, vc.drop - dt);
    let g;
    if (id === 'housekeeping') { g = s.hk; hkStep(g, dt); }
    else if (id === 'kitchen') { g = s.kitchen; const burnt = g.burnt; kitchenStep(g, dt); if (g.burnt > burnt) blip(run, 'bad'); }
    else {
      g = s.laundry;
      g.steer = (vc.keys.right ? 1 : 0) - (vc.keys.left ? 1 : 0);
      const n = g.sheets.length;
      laundryStep(g, dt);
      if (g.sheets.length > n) blip(run, g.sheets.at(-1).jam ? 'bad' : 'good');
    }
    if (g.last && g.last.seq !== vc.seq) { vc.seq = g.last.seq; flashPop(vc.ui.pop, g.last); if (g.last.good && id !== 'housekeeping') blip(run, 'good'); }
  },
  after(run, ctx, dt) {
    const vc = run.vc, s = run.state;
    if (!live(run)) vc.ui.hud.hidden = true;
    if (!vc.room || run.phase === 'aborted' || !s) return;
    const portrait = window.innerHeight > window.innerWidth, cam = ctx.camera, p = vc.parts, ui = vc.ui;
    poseCrowd(vc.crowd, dt);
    if (vc.key.startsWith('housekeeping') && s.hk) {
      const g = s.hk;
      if (portrait) { // (following the chore picked, smoothly)
        const spot = CHORE_SPOT[g.chore] || [0.4, 0.45, -1.2];
        if (!vc.look) vc.look = new THREE.Vector3(...spot);
        vc.look.lerp(_look.set(...spot), 1 - Math.exp(-dt * 4));
        vc.room.camera(cam, { x: -0.4 + vc.look.x * 0.25, y: 2.2, z: 2.25 }, vc.look);
      } else vc.room.camera(cam, { x: -2.2, y: 2.05, z: 2.2 }, { x: 0.8, y: 0.45, z: -1.0 });
      poseHotelRoom(p, g, cam);
      victoria.hudHousekeeping(run, g, ui);
    } else if (vc.key === 'kitchen' && s.kitchen) {
      vc.room.camera(cam, portrait ? { x: 0, y: 2.5, z: 1.9 } : { x: 0, y: 2.05, z: 1.5 }, { x: 0, y: 0.9, z: -0.65 });
      poseKitchen(p, s.kitchen, cam, vc.t);
      victoria.hudKitchen(run, s.kitchen, ui);
    } else if (vc.key === 'laundry' && s.laundry) {
      const g = s.laundry, mangle = g.phase !== 'sort';
      if (mangle) vc.room.camera(cam, portrait ? { x: MANGLE_X, y: 2.6, z: 2.3 } : { x: MANGLE_X, y: 2.0, z: 1.75 }, { x: MANGLE_X, y: MANGLE_Y, z: -0.45 });
      else vc.room.camera(cam, portrait ? { x: -1.95, y: 2.45, z: 2.3 } : { x: -1.95, y: 1.85, z: 1.7 }, { x: -1.95, y: 0.55, z: -0.75 });
      poseLaundry(p, g, vc, vc.t);
      victoria.hudLaundry(run, g, ui);
    }
  },

  // --- The HUD for each step -----------------------------------------------------------------------------------------
  row(run, ui, key, items, cls = '') {
    if (ui.rowKey === key) return;
    ui.rowKey = key;
    ui.row.className = `vc-row ${cls}`;
    ui.buttons = items.map((it) => {
      const b = el('button', 'gs-top');
      b.type = 'button';
      const name = el('span', null, it.label), kbd = el('kbd', null, `${it.key}`), meter = el('b'), u = el('u'), st = el('s');
      meter.append(u, st);
      b.append(name, meter, kbd);
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); victoria.pick(run, it.index); });
      return { b, name, meter, u, st, index: it.index };
    });
    ui.row.replaceChildren(...ui.buttons.map((x) => x.b));
  },
  hudHousekeeping(run, g, ui) {
    const room = hkRoom(g);
    setText(ui.line, `${room.name} · ${Math.ceil(g.left)} s · ${Math.round(victoriaScore(run.state))} pts`);
    setText(ui.label, g.phase === 'inspect' ? 'The Gouvernante has a look …' : g.chore ? `${CHORES[g.chore].name}: scrub left, right, left …` : `${room.guest} are back soon. Pick a chore`);
    show(ui.gauge, false); show(ui.chips, false); show(ui.bar, true); show(ui.pads, true); show(ui.row, true);
    ui.barFill.style.transform = `scaleX(${clamp(g.left / HOUSEKEEPING.time[g.room], 0, 1)})`;
    setText(ui.left, '◀ A'); setText(ui.right, 'D ▶');
    victoria.row(run, ui, `hk:${g.room}`, room.chores.map((c) => ({ label: CHORES[c].name, key: CHORE_KEYS.indexOf(c) + 1, index: CHORE_KEYS.indexOf(c) })));
    for (const x of ui.buttons) {
      const id = CHORE_KEYS[x.index], done = g.done.includes(id);
      x.b.classList.toggle('done', done);
      x.b.classList.toggle('on', g.chore === id);
      x.b.disabled = !done && !hkAllowed(g, id);
      x.meter.className = 'fill';
      x.u.style.width = `${hkProgress(g, id) * 100}%`;
    }
  },
  hudKitchen(run, g, ui) {
    setText(ui.line, `Lunch service · ${g.served.length} of ${KITCHEN_ORDERS.length} dishes · ${Math.round(victoriaScore(run.state))} pts`);
    setText(ui.label, g.queue.length ? 'New ticket: put it on a free burner' : g.pans.some(Boolean) ? 'Plate each dish in the green' : 'Waiting for the next ticket …');
    show(ui.gauge, false); show(ui.bar, false); show(ui.pads, false); show(ui.row, true);
    show(ui.chips, g.queue.length > 0);
    const chipKey = g.queue.join(',');
    if (ui.chips._k !== chipKey) { ui.chips._k = chipKey; ui.chips.replaceChildren(...g.queue.map((o, i) => el('span', `gs-chip${i === 0 ? ' next' : ''}`, `Table ${KITCHEN_ORDERS[o].table}: ${DISHES[KITCHEN_ORDERS[o].dish].name}`))); }
    victoria.row(run, ui, 'kitchen', [0, 1, 2].map((i) => ({ label: `Burner ${i + 1}`, key: i + 1, index: i })), 'three');
    for (const x of ui.buttons) {
      const pan = g.pans[x.index];
      setText(x.name, pan ? DISHES[KITCHEN_ORDERS[pan.order].dish].name : g.queue.length ? 'Put it on' : `Burner ${x.index + 1}`);
      x.b.classList.toggle('on', !!pan && pan.d >= KITCHEN.window[0] && pan.d <= KITCHEN.window[1]);
      x.b.disabled = !pan && !g.queue.length;
      x.meter.className = '';
      x.meter.style.visibility = pan ? 'visible' : 'hidden';
      x.u.style.left = `${(KITCHEN.window[0] / KITCHEN.burnt) * 100}%`; x.u.style.width = `${((KITCHEN.window[1] - KITCHEN.window[0]) / KITCHEN.burnt) * 100}%`;
      x.st.style.left = `${clamp((pan?.d || 0) / KITCHEN.burnt, 0, 1) * 100}%`;
    }
  },
  hudLaundry(run, g, ui) {
    show(ui.row, false); show(ui.chips, false); show(ui.pads, g.phase === 'sort' || g.phase === 'mangle');
    if (g.phase === 'sort') {
      const it = LINEN[g.item];
      setText(ui.line, `Sorting · item ${g.item + 1} of ${LINEN.length} · ${Math.round(victoriaScore(run.state))} pts`);
      if (ui.label._k !== `${g.item}`) { ui.label._k = `${g.item}`; ui.label._src = null; const sw = el('i', 'vc-swatch'); sw.style.background = it.colour; ui.label.replaceChildren(sw, el('span', null, it.name)); }
      show(ui.gauge, false); show(ui.bar, true);
      ui.barFill.style.transform = `scaleX(${clamp(1 - g.itemT / sortWindow(g), 0, 1)})`;
      setText(ui.left, '◀ Whites'); setText(ui.right, 'Colours ▶');
      return;
    }
    ui.label._k = null;
    show(ui.bar, false);
    setText(ui.line, `The mangle · sheet ${Math.min(g.sheet + 1, LAUNDRY.sheets)} of ${LAUNDRY.sheets} · ${Math.round(victoriaScore(run.state))} pts`);
    setText(ui.label, g.phase === 'wash' ? 'The drum turns …' : g.phase === 'mangle' ? 'Keep the sheet straight: hold ◀ or ▶' : g.sheet >= LAUNDRY.sheets ? 'All through' : 'Next sheet …');
    show(ui.gauge, g.phase === 'mangle');
    if (g.phase === 'mangle') {
      const J = LAUNDRY.jam, v = (g.off + J) / (2 * J);
      ui.zone.style.left = `${(0.5 - LAUNDRY.green / (2 * J)) * 100}%`; ui.zone.style.width = `${(LAUNDRY.green / J) * 100}%`;
      ui.needle.style.left = `${clamp(v, 0, 1) * 100}%`;
    }
    setText(ui.left, '◀'); setText(ui.right, '▶');
  }
};

export const VICTORIA_FEATURES = { victoria };
