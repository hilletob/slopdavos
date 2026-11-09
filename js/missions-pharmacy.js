import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceHeight } from './terrain.js';
import { createToast } from './missions-work.js';
import { PARCELS, parcelById } from './missions-data-pharmacy.js';

// js/missions-pharmacy.js
// The runtime of the medicine round by cargo bike (js/missions-data-pharmacy.js has its definition and the pure logic;
// js/missions.js takes PHARMACY_FEATURES into its FEATURES):
//   pharmacyRound — the player's cargo bike (js/controllers.js `cargobike`, put away in the open world since Davos
//                   offers none: js/main.js) brought out for the run and put away again at its end, the player back on
//                   the bike where it stands; an open crate on its deck (the pharmacy's green cross on its front) with the
//                   six parcels in it (the cool box white with a blue lid, the glass ones taped red), each gone from the
//                   crate once handed over and set down on the doorstep instead; a parcel floating over each door still
//                   waiting; the toasts (delivered, a bump, a crash, broken, the insulin warm) and a thump for a knock.
// Everything is built for the run: the crate on the bike's lean pivot is taken off and disposed at the teardown, the rest
// goes with the run's group (js/missions.js disposes it).

const mat = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.75, ...o });
const KIND_COLOUR = { cold: 0x4aa8e8, fragile: 0xe0552b, normal: 0x2e9d47 };
const DECK_TOP = 0.272, DECK_Z = [-0.03, 0.62], CRATE = { w: 0.46, h: 0.24, wall: 0.014 };
// the parcels' places in the crate (local to the bike's lean pivot: x across, z forward) and their sizes
const SLOTS = [[-0.11, 0.49], [0.11, 0.49], [-0.11, 0.29], [0.11, 0.29], [-0.11, 0.09], [0.11, 0.09]];

function parcelGeometry(kind) {
  if (kind === 'cold') {
    // a cool box: the white tub, the blue lid
    return { parts: [[new THREE.BoxGeometry(0.19, 0.2, 0.18).translate(0, 0.1, 0), 0], [new THREE.BoxGeometry(0.2, 0.035, 0.19).translate(0, 0.215, 0), 1]], mats: [mat(0xf2f4f5, { roughness: 0.4 }), mat(0x2f7fd0, { roughness: 0.45 })] };
  }
  const h = kind === 'fragile' ? 0.17 : 0.22;
  const parts = [[new THREE.BoxGeometry(0.18, h, 0.18).translate(0, h / 2, 0), 0]];
  // the tape across the top (red for glass)
  parts.push([new THREE.BoxGeometry(0.185, 0.006, 0.05).translate(0, h + 0.002, 0), 1]);
  if (kind === 'fragile') parts.push([new THREE.BoxGeometry(0.186, 0.05, 0.186).translate(0, h * 0.55, 0), 1]);
  return { parts, mats: [mat(0xb98a55, { roughness: 0.9 }), mat(kind === 'fragile' ? 0xd8322b : 0xcfae7c, { roughness: 0.6 })] };
}

function buildParcel(kind) {
  const { parts, mats } = parcelGeometry(kind);
  const geo = mergeGeometries(parts.map(([g]) => g), true);
  // (one group a material: mergeGeometries with useGroups)
  const mesh = new THREE.Mesh(geo, parts.map(([, m]) => mats[m]));
  mesh.castShadow = true;
  return mesh;
}

/** The open crate on the deck: four walls and a floor, the green panel with the white cross on its front */
function buildCrate() {
  const { w, h, wall } = CRATE, L = DECK_Z[1] - DECK_Z[0], zc = (DECK_Z[0] + DECK_Z[1]) / 2;
  const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
  const shell = mergeGeometries([
    box(w, 0.012, L, 0, 0.006, zc),
    box(wall, h, L, -w / 2 + wall / 2, h / 2, zc), box(wall, h, L, w / 2 - wall / 2, h / 2, zc),
    box(w, h, wall, 0, h / 2, DECK_Z[0] + wall / 2), box(w, h, wall, 0, h / 2, DECK_Z[1] - wall / 2)
  ]);
  const crate = new THREE.Group();
  crate.name = 'PharmacyCrate';
  const body = new THREE.Mesh(shell, mat(0xe9ecea, { roughness: 0.55 }));
  body.castShadow = body.receiveShadow = true;
  const panel = new THREE.Mesh(mergeGeometries([box(0.2, 0.17, 0.004, 0, h * 0.5, DECK_Z[1] + 0.002), box(0.004, 0.17, 0.2, -w / 2 - 0.002, h * 0.5, zc), box(0.004, 0.17, 0.2, w / 2 + 0.002, h * 0.5, zc)]), mat(0x2e9d47, { roughness: 0.5 }));
  const t = 0.028, a = 0.06;
  const cross = new THREE.Mesh(mergeGeometries([
    box(2 * a, t, 0.003, 0, h * 0.5, DECK_Z[1] + 0.005), box(t, 2 * a, 0.003, 0, h * 0.5, DECK_Z[1] + 0.005),
    ...[-1, 1].flatMap((s) => [box(0.003, t, 2 * a, s * (w / 2 + 0.005), h * 0.5, zc), box(0.003, 2 * a, t, s * (w / 2 + 0.005), h * 0.5, zc)])
  ]), mat(0xffffff, { roughness: 0.4, emissive: 0x335533 }));
  crate.add(body, panel, cross);
  crate.position.y = DECK_TOP;
  return crate;
}

/** A parcel floating over a door still waiting: a box in the kind's colour with a white band, turning */
function buildDoorMarker(kind) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), mat(KIND_COLOUR[kind], { roughness: 0.5, emissive: KIND_COLOUR[kind], emissiveIntensity: 0.35 }));
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.72), mat(0xffffff, { roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  g.add(box, band);
  return g;
}

const pharmacyRound = {
  setup(run) {
    const cm = run.hooks.controllerManager;
    const bike = cm.entities.cargobike;
    cm.setEntityHidden('cargobike', false); // (put away in the open world: js/main.js)
    const crate = buildCrate();
    const aboard = PARCELS.map((p, i) => {
      const mesh = buildParcel(p.kind);
      mesh.position.set(SLOTS[i][0], 0.012, SLOTS[i][1]);
      mesh.rotation.y = (i % 3) * 0.12 - 0.12;
      crate.add(mesh);
      return mesh;
    });
    bike.leanPivot.add(crate);
    const markers = PARCELS.map((p) => {
      const m = buildDoorMarker(p.kind);
      m.position.set(p.door.x, surfaceHeight(p.door.x, p.door.z) + 3.2, p.door.z);
      run.group.add(m);
      return m;
    });
    // the parcel set down on the doorstep: 2 m from the door ring's centre towards the house
    const doorsteps = PARCELS.map((p) => {
      const m = buildParcel(p.kind);
      m.scale.setScalar(1.6);
      const x = p.door.x + Math.sin(p.face) * 2, z = p.door.z + Math.cos(p.face) * 2;
      m.position.set(x, surfaceHeight(x, z) + 0.11, z);
      m.rotation.y = p.face;
      m.visible = false;
      run.group.add(m);
      return m;
    });
    run.pharmacy = { crate, aboard, markers, doorsteps, toast: createToast(run), spin: 0 };
  },
  reset(run) {
    const ph = run.pharmacy;
    for (const m of ph.aboard) { m.visible = true; m.scale.set(1, 1, 1); m.rotation.z = 0; }
    for (const m of ph.markers) m.visible = true;
    for (const m of ph.doorsteps) m.visible = false;
    ph.toast.hide();
  },
  update(run, ctx, dt) {
    const ph = run.pharmacy, st = run.state;
    if (!st?.parcels) return;
    ph.spin += dt;
    st.parcels.forEach((s, i) => {
      ph.aboard[i].visible = !s.delivered;
      ph.markers[i].visible = !s.delivered && run.phase !== 'done';
      ph.doorsteps[i].visible = s.delivered;
      if (s.broken && !s.delivered) { ph.aboard[i].scale.set(1, 0.8, 1); ph.aboard[i].rotation.z = 0.25; }
      const m = ph.markers[i];
      if (m.visible) {
        const p = PARCELS[i];
        m.rotation.y = ph.spin * 0.9 + i;
        m.position.y = surfaceHeight(p.door.x, p.door.z) + 3.2 + Math.sin(ph.spin * 2 + i) * 0.15;
      }
    });
  },
  after(run, ctx, dt) {
    const ph = run.pharmacy, st = run.state;
    if (!st?.events) return;
    while (st.events.length) {
      const e = st.events.shift();
      const p = e.id ? parcelById(e.id) : null;
      if (e.type === 'delivered') ph.toast.show(`Delivered: ${p.content}`, e.broken ? '#ffb4a0' : '#c8f7a0', 1.6);
      else if (e.type === 'bump') { ph.toast.show(`Bump! The glass at ${Math.round(e.condition * 100)} %`, '#ffd27a', 1.2); run.audio.thump(); }
      else if (e.type === 'crash') { ph.toast.show(`Crash! The glass at ${Math.round(e.condition * 100)} %`, '#ff9a7a', 1.4); run.audio.thump(); }
      else if (e.type === 'broken') ph.toast.show(`${p.content} broken: +30 s`, '#ff6a5a', 2.2);
      else if (e.type === 'warm') ph.toast.show('The insulin is warm: +45 s', '#ff6a5a', 2.2);
    }
    ph.toast.update(dt);
  },
  teardown(run) {
    const ph = run.pharmacy;
    const cm = run.hooks.controllerManager;
    if (ph) {
      ph.crate.removeFromParent();
      ph.crate.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) m.dispose(); } });
    }
    // the player gets off: back on the bike where the cargo bike stands, the cargo bike put away again
    if (cm.activeMode === 'cargobike') {
      const b = cm.entities.cargobike;
      cm.placeEntity('cyclist', b.position.x, b.position.z, b.heading);
      run.hooks.selectMode('cyclist');
    }
    cm.setEntityHidden('cargobike', true);
    run.pharmacy = null;
  }
};

export const PHARMACY_FEATURES = { pharmacyRound };
