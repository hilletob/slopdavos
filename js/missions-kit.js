import * as THREE from 'three/webgpu';
import { ParticleBatch } from './missions-fx.js';
import { el } from './dom.js';

// js/missions-kit.js
// What the missions share at run time: the registry of the vehicles the player's car wears (js/missions-work.js
// workVehicle), the hold key, the toast, the run's particles and a work map drawn as a mesh. Taken out of
// js/missions-work.js, where it had grown up with the first work missions.

const _c = new THREE.Color();

/** The vehicles a work mission puts the player in: name -> a builder of its model. Each mission module registers its own
 *  on import (VEHICLES.plough = ..., js/missions-plough.js); js/missions.js imports them all, js/race-ghosts.js reads it */
export const VEHICLES = {};

// --- Shared: the hold key (Space / E, the touch button), a toast ---------------------------------------------------------
/** The hold as an action of the register (js/actions.js): the big touch button, the gamepad's A, the key bar's Space;
 *  the jump button goes (Space is the hold: holdKey swallows it). `when`: while the hold applies (always otherwise) */
export function holdButton(run, label, { icon = 'i-shovel', when = undefined } = {}) {
  run.button('up', null);
  run.actions([{ id: 'work-hold', kind: 'hold', primary: true, label, icon, keys: ['Space', 'KeyE'], kbd: ['Space'], keyboard: false, pad: 'a', when, run: (on) => { run.work.touchHold = on; } }]);
}
/** Space or E held (taken from the controllers: no jump), the keyup and a lost focus let go */
export function bindHold(run) {
  run.listen(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') run.work.keyHold = false; }, { capture: true });
  run.listen(window, 'blur', () => { run.work.keyHold = false; run.work.touchHold = false; });
}
export function holdKey(run, e) {
  if (e.code !== 'Space' && e.code !== 'KeyE') return false;
  if (run.phase === 'intro') return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  run.work.keyHold = true;
  return true;
}
export const holding = (run) => !!(run.work.keyHold || run.work.touchHold);

export function createToast(run) {
  const t = el('div');
  Object.assign(t.style, {
    position: 'fixed', left: '50%', top: '36%', transform: 'translate(-50%, -50%)', zIndex: 14, pointerEvents: 'none',
    font: '800 24px/1.15 system-ui, sans-serif', color: '#fff', textAlign: 'center', textShadow: '0 2px 6px rgba(0,0,0,0.75)', opacity: '0', transition: 'opacity 0.25s'
  });
  document.body.append(t);
  run.cleanups.push(() => t.remove());
  let left = 0;
  return {
    show(text, colour = '#fff', seconds = 1.4) { t.textContent = text; t.style.color = colour; t.style.opacity = '1'; left = seconds; },
    update(dt) { if (left > 0 && (left -= dt) <= 0) t.style.opacity = '0'; },
    hide() { left = 0; t.style.opacity = '0'; }
  };
}

/** The particle batch of the run (the throws, the chute, the clippings); torn down with it */
export function particles(run) {
  if (run.workParticles) return run.workParticles;
  const p = run.workParticles = new ParticleBatch(run.scene);
  run.storage(p.mesh);
  run.cleanups.push(() => { p.dispose(); run.workParticles = null; });
  return p;
}
/** A lump flying from (a) to (b) in `T` s (ballistic) */
export function lump(pb, a, b, T, { size = 0.35, grow = 0.6, r = 0.93, g = 0.95, bl = 1, alpha = 0.95 } = {}) {
  pb.spawn({ x: a.x, y: a.y, z: a.z, vx: (b.x - a.x) / T, vy: (b.y - a.y) / T + 0.5 * 9.81 * T, vz: (b.z - a.z) / T, gravity: 9.81, life: T + 0.15, size0: size, size1: size + grow, alpha, r, g, b: bl, kind: 'lump' });
}

// --- A work map as a mesh: one vertex a cell, its height and colour from the cell's value ----------------------------------
export class GridMesh {
  /**
   * grid: js/missions-data-work.js createGrid; toWorld(u, v) -> { x, z } (grid metres); base(x, z): the ground under it;
   * height(h, k): m over the ground; colour(h, k, out: THREE.Color)
   */
  constructor(grid, { toWorld, base, height, colour, lift = 0.02, roughness = 0.9, name = 'WorkMap' }) {
    this.grid = grid; this.height = height; this.colour = colour;
    const { cols, rows, cell } = grid, n = cols * rows;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.base = new Float32Array(n);
    this.edge = new Uint8Array(n);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, w = toWorld((i + 0.5) * cell, (j + 0.5) * cell);
      pos[k * 3] = w.x; pos[k * 3 + 2] = w.z;
      this.base[k] = base(w.x, w.z) + lift;
      this.edge[k] = i === 0 || j === 0 || i === cols - 1 || j === rows - 1 ? 1 : 0;
    }
    // (the winding so that the faces look up, whichever way the frame turns)
    const a = toWorld(1.5 * cell, 0.5 * cell), o = toWorld(0.5 * cell, 0.5 * cell), b = toWorld(0.5 * cell, 1.5 * cell);
    const up = (b.z - o.z) * (a.x - o.x) - (b.x - o.x) * (a.z - o.z) > 0;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)((cols - 1) * (rows - 1) * 6);
    let q = 0;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const k = j * cols + i;
      if (up) idx.set([k, k + cols, k + 1, k + 1, k + cols, k + cols + 1], q);
      else idx.set([k, k + 1, k + cols, k + 1, k + cols + 1, k + cols], q);
      q += 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness }));
    this.mesh.name = name;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.normalT = 0;
    this.refresh();
  }
  refresh() { this.grid.dirty = null; this.range(0, this.grid.cols - 1, 0, this.grid.rows - 1); this.mesh.geometry.computeVertexNormals(); this.normalsDirty = false; }
  range(i0, i1, j0, j1) {
    const g = this.grid, geo = this.mesh.geometry, pos = geo.attributes.position.array, col = geo.attributes.color.array;
    // (one cell round the range: the neighbours' normals change too)
    for (let j = Math.max(0, j0); j <= Math.min(g.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(g.cols - 1, i1); i++) {
      const k = j * g.cols + i, h = g.h[k];
      pos[k * 3 + 1] = this.base[k] + (this.edge[k] ? 0 : this.height(h, k));
      this.colour(h, k, _c);
      col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.normalsDirty = true;
  }
  /** Takes the grid's changes (call every frame); the normals at most ten times a second */
  update(dt) {
    const d = this.grid.dirty;
    if (d) { this.grid.dirty = null; this.range(d.i0 - 1, d.i1 + 1, d.j0 - 1, d.j1 + 1); }
    this.normalT += dt;
    if (this.normalsDirty && this.normalT > 0.1) { this.normalT = 0; this.normalsDirty = false; this.mesh.geometry.computeVertexNormals(); }
  }
}
