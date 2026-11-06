import { formatTime } from './missions-data.js';
import {
  SNAPSHOT_HZ, COUNTDOWN_MS, packSnapshot, unpackSnapshot, createInterpolator, electHost, offsetFromPings, releaseTime, standings,
  countdownText, displayName
} from './race-protocol.js';
import { joinRace } from './race-net.js';
import { createGhost, PLAYER_COLOURS } from './race-ghosts.js';

// js/race-session.js
// A race between players on one mission (first: the quad ride from Heldstab, js/missions-data-rural.js, any mission with
// `race: { gates, nextGate }` can follow). The session lives from the lobby (js/race-ui.js) over as many races as the host
// starts to the moment the player leaves. It joins the room (js/race-net.js), knows who is in it (the presence), who the
// host is (js/race-protocol.js electHost) and how far the host's clock is from this one (ping/pong). The host's "Start"
// names a moment on its clock; every client starts the mission at once (js/missions-manager.js start(id, { race })) and
// the run (js/missions.js) waits for released() instead of the first input, the car held at the start. While the run
// lives the session is its hooks.race: frame() each frame sends this player's vehicle (SNAPSHOT_HZ) and poses the
// others' ghosts (js/race-ghosts.js) from their snapshots; reportFinish/reportAbort tell the others and put the standings
// and the race's buttons into the run's end dialog; detach() when the run is torn down (a leave, unless the host just
// started the next race).

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const PING_SAMPLES = 6, PING_GAP_MS = 350;
const GRID_ACROSS = 1.4, GRID_BACK = 3.2; // m: the grid at the start, two abreast

export class RaceSession {
  /**
   * @param {object} o
   * @param {string} o.code the room's code (js/race-protocol.js makeCode)
   * @param {{ id: string, name: string }} o.me this player
   * @param {object} o.def the mission (with `race`)
   * @param {object} o.manager js/missions-manager.js MissionManager
   * @param {(id: string) => object|null} [o.getMission] the host's mission, should it differ
   */
  constructor({ code, me, def, manager, getMission = () => null }) {
    this.code = code;
    this.me = { id: me.id, name: displayName(me.name, me.id) };
    this.def = def;
    this.manager = manager;
    this.getMission = getMission;
    this.members = []; // (the presence state: { id, name, joinedAt, mission, phase })
    this.players = new Map(); // id -> { id, name, joinedAt, colour, interp, ghost, x, z, gate, total, penalty, aborted }
    this.listeners = new Set();
    this.net = null;
    this.hostId = null;
    this.offset = 0; // ms the host's clock is ahead of this one
    this.pings = [];
    this.releaseAt = null; // on this clock (Date.now())
    this.run = null;
    this.ui = null;
    this.restarting = false;
    this.left = false;
    this.phase = 'lobby'; // lobby | racing | left
    this.status = '';
    this.sendAt = 0;
    this.standingsAt = 0;
    this.shown = '';
  }

  /** fn(what, session): 'members', 'status', 'racing', 'ended', 'left', 'error' */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) { try { fn(what, this); } catch (error) { console.warn('[race] listener', error); } } }

  async join() {
    this.net = await joinRace(this.code, { id: this.me.id, name: this.me.name, mission: this.def.id, phase: 'lobby' }, {
      onPresence: (members) => this.onPresence(members),
      onEvent: (event, payload) => this.onEvent(event, payload),
      onStatus: (status) => { this.status = status; this.emit('status'); }
    });
    this.onPresence(this.net.members());
    return this;
  }

  get host() { return electHost(this.members); }
  get isHost() { return this.host === this.me.id; }
  get hostMember() { return this.members.find((m) => m.id === this.host) || null; }

  /** The name the others see (the lobby's field) */
  setName(name) {
    this.me.name = displayName(name, this.me.id);
    const p = this.players.get(this.me.id);
    if (p) p.name = this.me.name;
    this.net?.track({ name: this.me.name });
    this.refreshStandings(true);
  }

  // --- The room --------------------------------------------------------------------------------------------------------
  onPresence(members) {
    if (this.left) return;
    this.members = members;
    const present = new Set();
    for (const m of members) {
      present.add(m.id);
      const name = displayName(m.name, m.id);
      let p = this.players.get(m.id);
      if (!p) {
        p = { id: m.id, name, joinedAt: m.joinedAt || 0, colour: '', interp: createInterpolator(), ghost: null, x: NaN, z: NaN, gate: 0, total: null, penalty: 0, aborted: false };
        this.players.set(m.id, p);
      } else if (p.name !== name) { p.name = name; p.ghost?.setName(name); }
    }
    for (const [id, p] of this.players) if (!present.has(id)) { p.ghost?.dispose(); this.players.delete(id); }
    [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).forEach((p, i) => { p.colour = PLAYER_COLOURS[i % PLAYER_COLOURS.length]; });
    const host = this.host;
    if (host !== this.hostId) { this.hostId = host; this.measureOffset(); if (this.row) this.renderButtons(this.row); }
    if (this.run) this.syncGhosts();
    this.refreshStandings(true);
    this.emit('members');
  }

  /** A few pings to the host; the median of the answers is the offset (nothing to do for the host itself) */
  measureOffset() {
    this.pings = [];
    this.offset = 0;
    if (this.isHost || !this.net) return;
    let n = 0;
    const tick = () => {
      if (this.left || this.isHost || !this.net || n >= PING_SAMPLES) return;
      n++;
      this.net.send('ping', { from: this.me.id, sent: Date.now() });
      setTimeout(tick, PING_GAP_MS);
    };
    tick();
  }

  onEvent(event, p) {
    if (this.left || !p || typeof p !== 'object') return;
    switch (event) {
      case 'ping':
        if (this.isHost && p.from) this.net?.send('pong', { to: p.from, sent: p.sent, hostNow: Date.now() });
        break;
      case 'pong':
        if (p.to === this.me.id) { this.pings.push({ sent: p.sent, received: Date.now(), hostNow: p.hostNow }); this.offset = offsetFromPings(this.pings); }
        break;
      case 'start':
        if (Number.isFinite(p.at)) this.onStart(p.at, p.mission);
        break;
      case 'snap': {
        const pl = this.players.get(p.id), s = unpackSnapshot(p.s);
        if (pl && s && pl.id !== this.me.id) { pl.interp.push(s, performance.now()); pl.x = s.x; pl.z = s.z; pl.gate = s.gate; }
        break;
      }
      case 'finish': {
        const pl = this.players.get(p.id);
        if (pl && Number.isFinite(p.total)) { pl.total = p.total; pl.penalty = Number(p.penalty) || 0; pl.aborted = false; this.refreshStandings(true); }
        break;
      }
      case 'abort': {
        const pl = this.players.get(p.id);
        if (pl) { pl.aborted = true; this.refreshStandings(true); }
        break;
      }
      default:
    }
  }

  // --- A race ----------------------------------------------------------------------------------------------------------
  /** The host's button: the release in COUNTDOWN_MS, on the host's clock, told to everyone */
  startRace() {
    if (!this.net || this.left) return;
    const at = Date.now() + COUNTDOWN_MS;
    this.net.send('start', { from: this.me.id, at, mission: this.def.id });
    this.onStart(at, this.def.id);
  }

  onStart(at, missionId) {
    const def = (missionId && this.getMission(missionId)) || this.def;
    this.def = def;
    this.releaseAt = releaseTime(at, this.offset);
    for (const p of this.players.values()) { p.total = null; p.penalty = 0; p.aborted = false; p.gate = 0; p.interp = createInterpolator(); }
    this.phase = 'racing';
    this.restarting = true; // (the run before, if any, is torn down by the manager: not a leave)
    let run = null;
    try { run = this.manager.start(def.id, { race: this }); } finally { this.restarting = false; }
    if (!run) { this.emit('error'); return; }
    this.attach(run);
    run.start(); // (no intro: the countdown is the start)
    this.net?.track({ phase: 'racing' });
    this.emit('racing');
  }

  /** The run (js/missions.js) with this session as hooks.race: the ghosts into its group, the standings into its panel */
  attach(run) {
    this.run = run;
    this.shown = '';
    const list = el('ol', 'race-standings');
    list.setAttribute('aria-label', 'Standings');
    const menu = run.ui.panel.querySelector('.mission-menu');
    if (menu) run.ui.panel.insertBefore(list, menu); else run.ui.panel.append(list);
    const countdown = el('div', 'race-countdown');
    countdown.hidden = true;
    document.body.append(countdown);
    run.cleanups.push(() => countdown.remove());
    this.ui = { list, countdown, text: '' };
    this.resultsList = null;
    this.row = null;
    this.syncGhosts();
    this.refreshStandings(true);
  }

  syncGhosts() {
    if (!this.run) return;
    for (const p of this.players.values()) {
      if (p.id === this.me.id || p.ghost) continue;
      try { p.ghost = createGhost(this.run, { name: p.name, colour: p.colour }); } catch (error) { console.warn('[race] ghost', error); }
    }
  }

  /** js/missions.js: the stopwatch is armed by the countdown, not by the first input */
  released() { return Number.isFinite(this.releaseAt) && Date.now() >= this.releaseAt; }

  /** Every frame of the run, after its features: the hold at the start, the countdown, this player's snapshot, the ghosts, the standings */
  frame(run, ctx, dt, cm) {
    if (run !== this.run || !this.ui) return;
    const now = performance.now();
    const car = cm.entities.car;
    const live = run.phase === 'ready' || run.phase === 'running';
    if ((run.phase === 'loading' || run.phase === 'ready') && car) this.hold(run, car);
    const text = live || run.phase === 'loading' ? countdownText(this.releaseAt, Date.now()) : '';
    if (text !== this.ui.text) {
      this.ui.text = text;
      this.ui.countdown.textContent = text;
      this.ui.countdown.hidden = !text;
      this.ui.countdown.classList.toggle('is-go', text === 'Go!');
      if (text === 'Go!') run.audio?.thump?.();
    }
    if (live && car && now >= this.sendAt) {
      this.sendAt = now + 1000 / SNAPSHOT_HZ;
      this.net?.send('snap', { id: this.me.id, s: packSnapshot(this.snapshot(run, car, cm)) });
    }
    for (const p of this.players.values()) if (p.ghost) p.ghost.pose(p.interp.sample(now), dt, cm);
    if (now >= this.standingsAt) { this.standingsAt = now + 250; this.refreshStandings(false); }
  }

  /** The player's vehicle as the others should see it: the posed model (js/missions-work.js workVehicle.follow), the car's speed and steering */
  snapshot(run, car, cm) {
    const g = run.vehicle?.group;
    const x = car.position.x, z = car.position.z;
    const ground = cm.getGroundHeight(x, z, 'car');
    const gate = run.def.race?.nextGate?.(run.state, run.index) ?? 0;
    const me = this.players.get(this.me.id);
    if (me) { me.x = x; me.z = z; me.gate = gate; }
    return {
      x, z, hop: g ? g.position.y - ground : 0, heading: g ? g.rotation.y : car.heading, tilt: g ? g.rotation.x : 0, roll: g ? g.rotation.z : 0,
      speed: car.speed || 0, steer: car.steerAngle || 0, gate
    };
  }

  /** This player's place on the grid: 0, 1 side by side, 2, 3 the row behind (by the order of joining, the same on every client) */
  gridSlot() {
    const order = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    return Math.max(0, order.findIndex((p) => p.id === this.me.id));
  }

  /** Held on the grid until the release: no speed, back on the mark each frame (the controllers run before the mission) */
  hold(run, car) {
    const s = run.startXZ;
    if (!s) return;
    const start = run.resolveStart?.();
    const h = Number.isFinite(start?.heading) ? start.heading : car.heading;
    const slot = this.gridSlot();
    const across = (slot % 2 ? 1 : -1) * GRID_ACROSS, back = Math.floor(slot / 2) * GRID_BACK;
    car.speed = 0; car.vx = 0; car.vz = 0; car.angularVel = 0;
    car.position.x = s.x + Math.cos(h) * across - Math.sin(h) * back;
    car.position.z = s.z - Math.sin(h) * across - Math.cos(h) * back;
    car.heading = h;
    run.lastPos?.copy(car.position);
  }

  // --- The end ---------------------------------------------------------------------------------------------------------
  /** js/missions.js finish(), after its end dialog stands */
  reportFinish(run) {
    if (run !== this.run) return;
    const total = run.result?.total ?? run.elapsed, penalty = run.penaltyMs?.() || 0;
    const me = this.players.get(this.me.id);
    if (me) { me.total = total; me.penalty = penalty; me.aborted = false; }
    this.net?.send('finish', { id: this.me.id, total, penalty });
    this.decorateDialog(run);
  }

  /** js/missions.js abort() and a failed step, after the dialog stands */
  reportAbort(run) {
    if (run !== this.run) return;
    const me = this.players.get(this.me.id);
    if (me) me.aborted = true;
    this.net?.send('abort', { id: this.me.id });
    this.decorateDialog(run);
  }

  /** The standings and the race's buttons into the run's dialog (instead of Restart / All missions / Back) */
  decorateDialog(run) {
    const panel = run.ui.overlay?.querySelector('.mission-dialog');
    const row = panel?.querySelector('.mission-dialog-buttons');
    if (!panel || !row) return;
    const box = el('div', 'race-results');
    this.resultsList = el('ol', 'race-standings race-standings-dialog');
    this.resultsNote = el('p', 'mission-board-note');
    box.append(el('h3', 'mission-board-title', 'Race standings'), this.resultsList, this.resultsNote);
    panel.insertBefore(box, row);
    this.renderButtons(row);
    this.shown = '';
    this.refreshStandings(true);
    this.emit('ended');
  }

  renderButtons(row) {
    this.row = row;
    row.replaceChildren();
    const button = (label, onClick, secondary = false) => {
      const b = el('button', `mission-btn${secondary ? ' mission-btn-secondary' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };
    if (this.isHost) row.append(button('Race again', () => this.startRace()));
    row.append(button('Leave the race', () => this.manager.stop(), true));
  }

  /** The rows of the standings (js/race-protocol.js standings), rendered when they change */
  refreshStandings(force) {
    if (!this.ui && !this.resultsList) return;
    const gates = this.def.race?.gates || [];
    const rows = standings([...this.players.values()].map((p) => ({ id: p.id, name: p.name, colour: p.colour, x: p.x, z: p.z, gate: p.gate, total: p.total, aborted: p.aborted })), gates);
    const key = rows.map((r) => `${r.id}:${r.name}:${r.place}:${r.gate}:${r.total ?? ''}:${r.aborted ? 1 : 0}`).join('|');
    if (!force && key === this.shown) return;
    this.shown = key;
    const racing = rows.filter((r) => !Number.isFinite(r.total) && !r.aborted).length;
    const render = (list, dialog) => {
      list.replaceChildren(...rows.map((r) => {
        const li = el('li', `race-row${r.id === this.me.id ? ' is-me' : ''}${r.aborted ? ' is-out' : ''}`);
        li.style.setProperty('--c', r.colour || '#fff');
        const status = Number.isFinite(r.total) ? formatTime(r.total) : r.aborted ? 'Out' : dialog ? 'Still racing' : `${r.gate}/${gates.length}`;
        li.append(el('span', 'race-place', `${r.place}.`), el('span', 'race-name player-name', r.name), el('span', 'race-status', status));
        return li;
      }));
    };
    if (this.ui?.list) render(this.ui.list, false);
    if (this.resultsList) {
      render(this.resultsList, true);
      if (this.resultsNote) this.resultsNote.textContent = racing ? `${racing} still racing` : this.isHost ? 'Everyone is in. Race again?' : 'The host starts the next race.';
    }
  }

  /** js/missions.js dispose(): the run is gone (its group took the ghosts). Unless the next race is just starting, this is the leave */
  detach(run) {
    if (run !== this.run) return;
    for (const p of this.players.values()) p.ghost = null;
    this.run = null;
    this.ui = null;
    this.resultsList = null;
    this.resultsNote = null;
    this.row = null;
    if (!this.restarting) this.leave();
  }

  async leave() {
    if (this.left) return;
    this.left = true;
    this.phase = 'left';
    const net = this.net;
    this.net = null;
    for (const p of this.players.values()) { p.ghost?.dispose(); p.ghost = null; }
    this.emit('left');
    await net?.leave();
  }
}
