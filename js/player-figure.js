// js/player-figure.js
// The player's figure: one of the converted Rocketbox people (js/person-models.js), the same everywhere the player is
// a person — on foot (with the missions' own poses: sledges, golf, the paraglider, ...), on the bicycle and on the cargo
// bike. Chosen in the menu (play.html #figure-dialog), kept in this browser and, signed in, in the account's cloud save
// (js/account-merge.js WORLD_KEYS.figure, part of the world); ?qset=playerModel:<id> picks one for a test.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PersonCrowd } from './pedestrians.js';
import { loadPersonModel } from './person-models.js';
import { loadPersonClips } from './person-clips.js';
import { QUALITY } from './quality.js';

/**
 * The figures to choose from (assets/models/rocketbox-<id>.glb, assets/figures/<id>.webp); the first is the default.
 * helmet: false — no cycling helmet on the bikes
 */
export const FIGURES = [
  { id: 'f04', label: 'Jacket & boots' },
  { id: 'm02', label: 'Jumper' },
  { id: 'f01', label: 'Blouse & jeans' },
  { id: 'm04', label: 'Hoodie' },
  { id: 'f02', label: 'Jumper & skirt' },
  { id: 'police-m01', label: 'Police officer', helmet: false } // (rides in his cap)
];
const KEY = 'slopdavos-figure';
const known = (id) => FIGURES.some((f) => f.id === id);

/** The chosen figure's id (?qset=playerModel first, then this browser's choice, else the default) */
export function chosenFigure() {
  if (QUALITY.playerModel) return QUALITY.playerModel;
  try {
    const raw = localStorage.getItem(KEY);
    let id = raw;
    try { id = JSON.parse(raw); } catch { /* (a bare id) */ }
    if (known(id)) return id;
  } catch { /* storage is optional */ }
  return FIGURES[0].id;
}

/** Keep `id` as this browser's choice (as JSON, like the rest of the world the cloud save carries) */
export function rememberFigure(id) {
  if (!known(id)) return;
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch { /* storage is optional */ }
}

// The cycling helmet: "Bicycle Hat" by MR.Sirapop (CC BY 4.0; assets/models/bicycle-helmet.glb, tools/build-bicycle-helmet.mjs),
// its origin at the shell's crown, 0.21 m wide outside
const HELMET_WIDTH = 0.21;
let helmetMesh = null;
function loadHelmet() {
  helmetMesh ??= new GLTFLoader().loadAsync(new URL('../assets/models/bicycle-helmet.glb', import.meta.url).href).then((gltf) => {
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    mesh.material.map.colorSpace = THREE.SRGBColorSpace;
    mesh.castShadow = true;
    return mesh;
  });
  return helmetMesh;
}

/**
 * Where the helmet sits on a model's head, in the bind pose relative to the head joint (0, 1.52, -0.012), m: measured
 * from the forehead (the face's foremost point between the brows and the hairline, above the nose), not from the whole head, so that
 * a bun or a ponytail doesn't pull it back or up — the crown on the hair above the front half of the head, the shell's
 * middle 9.5 cm behind the forehead, the scale that leaves it ~2 cm round the head at its rim
 */
function helmetFit(model) {
  if (model.helmetFit) return model.helmetFit;
  const p = model.geometry.attributes.position, k = model.geometry.attributes.skin;
  const head = [];
  for (let i = 0; i < p.count; i++) if (k.getX(i) === 2 && k.getZ(i) <= 0.5 && p.getY(i) >= 1.58) head.push(i);
  let front = -Infinity;
  for (const i of head) if (p.getY(i) > 1.7 && p.getY(i) < 1.75 && Math.abs(p.getX(i)) < 0.04) front = Math.max(front, p.getZ(i)); // (the brow & forehead: the eyes are at ~1.685, the nose below)
  let top = -Infinity;
  for (const i of head) if (Math.abs(p.getX(i)) < 0.06 && p.getZ(i) < front - 0.03 && p.getZ(i) > front - 0.13) top = Math.max(top, p.getY(i));
  let half = 0;
  for (const i of head) if (p.getY(i) > top - 0.09 && p.getY(i) < top - 0.02 && p.getZ(i) > front - 0.2) half = Math.max(half, Math.abs(p.getX(i)));
  const s = Math.min(1.3, Math.max(0.9, (2 * half + 0.04) / HELMET_WIDTH));
  model.helmetFit = { y: top - 1.52 + 0.004, z: front - 0.095 + 0.012, s };
  return model.helmetFit;
}

let request = 0;

/**
 * Dress the player (the controllers' person, cyclist and cargo bike riders) as figure `id`: each gets a crowd of that
 * model, and its PersonRig — the same object, the missions may hold it — the model's scale and bind pose. Resolves to
 * the model once it shows (a later call wins over an earlier one still loading).
 */
export async function applyFigure(cm, id) {
  const mine = ++request;
  const model = await loadPersonModel(id);
  const clips = await loadPersonClips().catch(() => null);
  const helmet = await loadHelmet().catch((e) => { console.warn('[player-figure] helmet', e); return null; });
  if (mine !== request) return null;
  const dress = (ent, crowdKey, rigKey) => {
    if (!ent?.[crowdKey] || !ent[rigKey]) return;
    const old = ent[crowdKey];
    const crowd = new PersonCrowd(1, { farDistance: Infinity, dress: { model } });
    old.meshes.forEach((m, i) => {
      crowd.meshes[i].castShadow = m.castShadow;
      crowd.meshes[i].visible = m.visible;
      (m.parent || cm.scene).add(crowd.meshes[i]);
      m.parent?.remove(m);
      m.material.dispose(); // (the lofted body's geometry is shared, a model's stays cached)
    });
    crowd.model = model;
    ent[crowdKey] = crowd;
    ent[rigKey].setBuild({ scale: model.scale, female: model.female });
    if (rigKey === 'rig' && clips) ent[rigKey].setClips(clips.idle(model.female));
    // the bikes' helmet: the fitted one in the old one's place (the same object, js/main.js updates its matrix; its own
    // shell hidden), placed by js/controllers.js poseCharacters from ent.helmetFit
    if (ent.helmet && helmet) {
      const wears = FIGURES.find((f) => f.id === id)?.helmet !== false;
      if (!ent.helmetFitted) {
        if (ent.helmet.isMesh) ent.helmet.material.visible = false;
        for (const c of ent.helmet.children) c.visible = false;
        ent.helmetFitted = helmet.clone();
        ent.helmet.add(ent.helmetFitted);
      }
      ent.helmetFitted.visible = wears;
      ent.helmetFit = helmetFit(model);
    }
  };
  dress(cm.entities.person, 'crowd', 'rig');
  dress(cm.entities.cyclist, 'riderCrowd', 'riderRig');
  dress(cm.entities.cargobike, 'riderCrowd', 'riderRig');
  return model;
}
