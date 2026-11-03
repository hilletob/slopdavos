import * as THREE from 'three/webgpu';
import { QUALITY, rectRegion, setWorldCenter } from './quality.js';
import { releaseRenderState } from './gpu-memory.js';
import { WORLD_CELL, cellKey, cellDistance, cellsAround, cellsToDrop } from './world-cells.js';
import { buildGroundLayers } from './city-grid.js';
import { buildRoadPaint } from './road-paint.js';
import { buildTrackBed } from './trams.js';
import { buildParking } from './parking.js';
import { carveRoads, addRaisedSidewalk, removeRaisedSidewalks, drapeOverlay, liftColliders } from './terrain.js';

// js/world-stream.js
// The streamed town of the mobile profile (js/quality.js worldRadius). A phone can't hold the whole valley's streets,
// so the radius-dependent builders (the ground layers of js/city-grid.js, the markings of js/road-paint.js, the track
// bed of js/trams.js, the car parks of js/parking.js) build 500 m cells (js/world-cells.js) round the player instead:
// a cell is queued when its square comes within `radius` of the player and torn down again (geometry disposed, its
// colliders, raised sidewalks and terrain carving withdrawn) once it is farther than radius + hysteresis. One part of
// one cell is built at a time, nearest first, each builder yielding within as the start-up build does, so the frames
// go on between; the player sees the streets come in a few hundred metres ahead.
//
// Builders: { name, build(region, cell) -> { objects, colliders, update?, dispose? } } (async or not). The objects go
// into the cell's group (userData.terrain 'absolute': in world heights already), the colliders to the controllers
// (onAdded / onRemoved), update(camera) is called every frame while the cell lives, dispose() when it goes.

const yieldNow = () => new Promise((resolve) => setTimeout(resolve, 0));
// (the mobile profile: a breath after every part built, in which Safari's idle-time garbage collection can free the
// part's temporary arrays before the next piles more on top; js/city-grid.js buildPause does the same within)
const breathe = () => new Promise((resolve) => setTimeout(resolve, QUALITY.mobile ? 30 : 0));

export class WorldStreamer {
  constructor({ scene, radius, hysteresis = 250, cell = WORLD_CELL, onAdded = null, onRemoved = null }) {
    this.scene = scene;
    this.radius = radius;
    this.hysteresis = hysteresis;
    this.cell = cell;
    this.onAdded = onAdded;
    this.onRemoved = onRemoved;
    this.root = new THREE.Group();
    this.root.name = 'WorldCells';
    this.root.userData.terrain = 'absolute';
    scene.add(this.root);
    this.builders = [];
    this.cells = new Map(); // key -> { i, j, key, region, group, parts: Map(name -> part), pending: Set(name) }
    this.queue = []; // [{ cell, builder }]
    this.busy = null; // the job running (a promise)
    this.x = NaN; this.z = NaN; // where the cells were last chosen for
    this.lastPick = -Infinity;
    this.stats = { built: 0, dropped: 0, buildMs: 0, maxBuildMs: 0, maxBlockMs: 0 };
  }

  /** Registers a builder; the cells already live get its part queued */
  addBuilder(builder) {
    this.builders.push(builder);
    for (const cell of this.cells.values()) this._queue(cell, builder);
  }

  _queue(cell, builder) {
    if (cell.parts.has(builder.name) || cell.pending.has(builder.name)) return;
    cell.pending.add(builder.name);
    this.queue.push({ cell, builder });
  }

  _create(i, j) {
    const key = cellKey(i, j);
    let cell = this.cells.get(key);
    if (cell) return cell;
    const region = rectRegion(i * this.cell, (i + 1) * this.cell, j * this.cell, (j + 1) * this.cell);
    const group = new THREE.Group();
    group.name = `WorldCell ${key}`;
    group.userData.terrain = 'absolute';
    this.root.add(group);
    cell = { i, j, key, region, group, parts: new Map(), pending: new Set(), live: true, priming: !!this.priming };
    this.cells.set(key, cell);
    for (const builder of this.builders) this._queue(cell, builder);
    return cell;
  }

  /** Chooses the cells for a player at (x, z): the missing ones are queued, the far ones dropped */
  _pick(x, z) {
    this.x = x; this.z = z;
    setWorldCenter(x, z); // (js/quality.js inWorld: the detailed town now lies round the player)
    for (const { i, j } of cellsAround(x, z, this.radius, this.cell)) this._create(i, j);
    for (const key of cellsToDrop([...this.cells.keys()], x, z, this.radius, this.hysteresis, this.cell)) this._drop(this.cells.get(key));
    // (nearest first; the ground before the markings on it)
    const order = new Map(this.builders.map((b, k) => [b.name, k]));
    this.queue.sort((p, q) => cellDistance(p.cell.i, p.cell.j, x, z, this.cell) - cellDistance(q.cell.i, q.cell.j, x, z, this.cell) || order.get(p.builder.name) - order.get(q.builder.name));
  }

  _drop(cell) {
    if (!cell || !cell.live) return;
    cell.live = false;
    this.cells.delete(cell.key);
    this.queue = this.queue.filter((job) => job.cell !== cell);
    for (const part of cell.parts.values()) this._disposePart(cell, part);
    cell.parts.clear();
    this.root.remove(cell.group);
    this.stats.dropped++;
  }

  _disposePart(cell, part) {
    const objects = part.objects || [];
    for (const o of objects) {
      o.removeFromParent();
      o.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        releaseRenderState(m);
      });
    }
    if (part.dispose) part.dispose();
    if (this.onRemoved) this.onRemoved(objects, part.colliders || [], cell);
  }

  async _run(job) {
    const { cell, builder } = job;
    cell.pending.delete(builder.name);
    const t0 = performance.now();
    let part = null;
    try {
      part = await builder.build(cell.region, cell);
    } catch (error) {
      console.warn(`[world] ${builder.name} of cell ${cell.key}:`, error);
    }
    const ms = performance.now() - t0;
    this.stats.buildMs += ms; this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
    if (!part) return;
    if (!cell.live) { this._disposePart(cell, part); return; } // (the player moved on meanwhile)
    cell.parts.set(builder.name, part);
    for (const o of part.objects || []) { cell.group.add(o); o.updateMatrixWorld(true); }
    if (part.colliders?.length) liftColliders(part.colliders);
    if (this.onAdded) this.onAdded(part.objects || [], part.colliders || [], cell);
    this.stats.built++;
    await breathe();
  }

  _next() {
    if (this.busy || !this.queue.length) return null;
    const job = this.queue.shift();
    this.busy = this._run(job).finally(() => { this.busy = null; });
    return this.busy;
  }

  /** Builds every cell within reach of (x, z) now (the start: the town before the first frame) */
  async prime(x, z) {
    this.priming = true; // (the cells of the start collect the street lamps' sites, js/city-grid.js berlinStreetSites)
    this._pick(x, z);
    await this.settle();
    this.priming = false;
  }

  /** Waits until nothing is queued any more */
  async settle() {
    while (this.queue.length || this.busy) {
      if (this.busy) await this.busy; else await this._next();
    }
  }

  /** Every frame: the cells follow the player at (x, z); one part of one cell is built at a time */
  update(x, z, camera) {
    const now = performance.now();
    if (now - this.lastPick > 500 && (Math.hypot(x - this.x, z - this.z) > 40 || this.queue.length || this.busy === null && Number.isNaN(this.x))) {
      this.lastPick = now;
      this._pick(x, z);
    }
    this._next();
    if (camera) for (const cell of this.cells.values()) for (const part of cell.parts.values()) if (part.update) part.update(camera);
  }

  /** The colliders of every part built so far */
  colliders() {
    const out = [];
    for (const cell of this.cells.values()) for (const part of cell.parts.values()) if (part.colliders) out.push(...part.colliders);
    return out;
  }

  /** For the HUD and the probes */
  info() {
    let parts = 0;
    for (const cell of this.cells.values()) parts += cell.parts.size;
    return { cells: this.cells.size, parts, queued: this.queue.length, busy: !!this.busy, ...this.stats, buildMs: Math.round(this.stats.buildMs), maxBuildMs: Math.round(this.stats.maxBuildMs) };
  }
}

// --- The builders ----------------------------------------------------------------------------------------------------------

/** The streets, sidewalks, curbs, centre lines, corners, crosswalks and bridges (js/city-grid.js) */
export function groundBuilder() {
  return {
    name: 'ground',
    async build(region, cell) {
      const layers = await buildGroundLayers(region, { mergeCell: Infinity, streetSites: !!cell.priming });
      carveRoads(layers.carveStrips, 1);
      for (const piece of layers.raised) addRaisedSidewalk(piece, cell); // (the cell object: a later cell of the same square is another owner)
      return {
        objects: layers.meshes, colliders: layers.colliders, stats: layers.stats,
        dispose() { carveRoads(layers.carveStrips, -1); removeRaisedSidewalks(cell); }
      };
    }
  };
}

/** The markings of the drivable network (js/road-paint.js), draped on the terrain */
export function paintBuilder(network) {
  return {
    name: 'paint',
    async build(region) {
      await yieldNow();
      const holder = new THREE.Group();
      const mesh = buildRoadPaint(holder, network, region);
      if (!mesh) return { objects: [] };
      const flat = mesh.geometry;
      mesh.geometry = drapeOverlay(flat, { maxEdge: 16 });
      if (mesh.geometry !== flat) flat.dispose();
      mesh.removeFromParent();
      return { objects: [mesh] };
    }
  };
}

/** The railways' ballast and rails (js/trams.js) */
export function trackBuilder() {
  return {
    name: 'track',
    async build(region) {
      await yieldNow();
      return { objects: buildTrackBed(region) };
    }
  };
}

/** The car parks with their bays and parked cars (js/parking.js) */
export function parkingBuilder() {
  return {
    name: 'parking',
    async build(region) {
      await yieldNow();
      const holder = new THREE.Group();
      const parking = buildParking(holder, region);
      parking.group.removeFromParent();
      if (!parking.stats.lots) { parking.group.traverse((m) => { m.geometry?.dispose(); if (m.isInstancedMesh) m.dispose(); }); return { objects: [] }; }
      return { objects: [parking.group], colliders: parking.colliders, update: parking.update, dispose: parking.dispose };
    }
  };
}

export { WORLD_CELL, cellsAround };
export const streamedWorld = () => QUALITY.worldRadius > 0;
