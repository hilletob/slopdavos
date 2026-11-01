import { WORLD_CELL, cellKey, cellsAround } from './world-cells.js';

// js/missions-manager.js
// The missions' manager (js/missions.js builds it): one mission run at a time, started, switched and stopped without
// reloading the page. The URL follows along (history.replaceState: ?mission=<id>, &night=1, ?mission=list), so that a
// link can be shared and a reload comes back to the same mission. No three.js and no DOM in here: the run, the list and
// the URL are handed in, so that tests/missions.test.mjs can drive the manager on its own.

/** ?mission=<id>[&night=1] -> { id, night }, or null when the URL asks for no mission */
export function parseMissionSearch(search) {
  const params = new URLSearchParams(search || '');
  const id = params.get('mission');
  return id ? { id, night: params.get('night') === '1' } : null;
}

/** The search string for a mission ('' for none): the other parameters of `search` are kept */
export function missionSearch(id, { night = false } = {}, search = '') {
  const params = new URLSearchParams(search || '');
  params.delete('mission');
  params.delete('night');
  if (id) params.set('mission', id);
  if (id && night) params.set('night', '1');
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Whether the streamed town (js/world-stream.js, the mobile profile) stands round (x, z): every cell within `radius`
 * exists, has nothing queued and all its builders' parts built. No streamer (the desktop builds everything): true.
 */
export function worldCellsReady(world, x, z, radius = 600) {
  if (!world || !world.cells) return true;
  const builders = world.builders?.length ?? 0;
  for (const { i, j } of cellsAround(x, z, radius, world.cell || WORLD_CELL)) {
    const cell = world.cells.get(cellKey(i, j));
    if (!cell || cell.pending.size || cell.parts.size < builders) return false;
  }
  return true;
}

export class MissionManager {
  /**
   * @param {object} o
   * @param {(id: string) => object|null} o.getMission the mission's definition
   * @param {(def: object, opts: { night: boolean }) => object} o.createRun a run: { active, update(...), dispose() }
   * @param {(note?: string|null) => void} o.showList / o.hideList the list of the missions
   * @param {(search: string) => void} o.setSearch the URL's search part ('' for the free game)
   */
  constructor({ getMission, createRun, showList = () => {}, hideList = () => {}, setSearch = () => {}, onError = () => {} }) {
    Object.assign(this, { getMission, createRun, _showList: showList, _hideList: hideList, setSearch, onError });
    this.run = null;
    this.listOpen = false;
  }

  /** A mission runs (js/main.js: the loop calls update() only then) */
  get active() { return !!this.run; }

  /** Starts the mission `id` (the one running is torn down first); unknown ids open the list with a note */
  start(id, { night = false } = {}) {
    const def = this.getMission(id);
    if (!def) { this.showList(`Unbekannte Mission „${id}“`); return null; }
    this._end();
    this._closeList();
    const nightRun = !!night && !!def.nightTime;
    try {
      this.run = this.createRun(def, { night: nightRun });
    } catch (error) {
      this.run = null;
      this.onError(error, id);
      this.setSearch(missionSearch(null));
      return null;
    }
    this.setSearch(missionSearch(id, { night: nightRun }));
    return this.run;
  }

  /** Back to the free game: the run torn down, the list closed, the URL without the mission */
  stop() {
    this._end();
    this._closeList();
    this.setSearch(missionSearch(null));
  }

  /** The list of the missions (the run, if any, ends: the list starts the next one) */
  showList(note = null) {
    this._end();
    this._closeList();
    this._showList(note);
    this.listOpen = true;
    this.setSearch(missionSearch('list'));
  }

  /** What the page was opened with: ?mission=list, ?mission=<id>[&night=1] or nothing */
  fromSearch(search) {
    const want = parseMissionSearch(search);
    if (!want) return null;
    if (want.id === 'list') { this.showList(); return null; }
    return this.start(want.id, { night: want.night });
  }

  update(...args) {
    if (this.run) this.run.update(...args);
  }

  _end() {
    const run = this.run;
    this.run = null;
    if (!run) return;
    try { run.dispose(); } catch (error) { this.onError(error, 'dispose'); }
  }

  _closeList() {
    if (!this.listOpen) return;
    this.listOpen = false;
    this._hideList();
  }
}
