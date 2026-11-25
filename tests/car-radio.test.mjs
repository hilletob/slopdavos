import assert from 'node:assert/strict';
import test from 'node:test';
import { CarRadio, RADIO_STATIONS, RADIO_MODES } from '../js/car-radio.js';

// js/car-radio.js: the stations stepped through, the stream held only while it can be heard

function fakeElement() {
  const listeners = {};
  return {
    log: [], src: '', paused: true,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
    play() { this.paused = false; this.log.push(`play ${this.src}`); return Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ''; },
    load() { this.log.push('load'); }
  };
}
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function make({ mode = 'car', stored } = {}) {
  const el = fakeElement();
  const state = { mode, changes: 0 };
  const audio = { enabled: true, context: null };
  const storage = fakeStorage(stored ? { 'davos-radio': stored } : {});
  const radio = new CarRadio({ audio, mode: () => state.mode, onChange: () => state.changes++, storage, createElement: () => el, direct: true });
  return { radio, el, state, audio, storage };
}
const rest = (radio) => { radio.holdUntil = 0; clearTimeout(radio.timer); radio.sync(); };

test('the stations are https streams with unique ids; the car, the groomer, the helicopter and the bike have a radio, the paraglider by `also`', () => {
  assert.equal(new Set(RADIO_STATIONS.map((s) => s.id)).size, RADIO_STATIONS.length);
  for (const s of RADIO_STATIONS) assert.match(s.url, /^https:\/\//, s.id);
  for (const m of ['car', 'snowcat', 'helicopter', 'cyclist']) assert.ok(RADIO_MODES.has(m), m);
  assert.ok(!RADIO_MODES.has('person') && !RADIO_MODES.has('rhb'));
  let gliding = false;
  const radio = new CarRadio({ mode: () => 'person', also: () => gliding, storage: fakeStorage(), createElement: fakeElement, direct: true });
  assert.equal(radio.available(), false);
  gliding = true;
  assert.equal(radio.available(), true, 'under the wing');
});

test('on from the start, on Radio Grischa; I switches it off and on again, and the switch is kept', () => {
  const { radio, el, storage } = make();
  assert.equal(RADIO_STATIONS[0].id, 'grischa');
  assert.equal(radio.on, true);
  assert.equal(radio.station, RADIO_STATIONS[0]);
  radio.sync();
  assert.deepEqual(el.log, [`play ${RADIO_STATIONS[0].url}`]);
  el.fire('playing');
  radio.toggle();
  assert.equal(radio.on, false);
  assert.equal(radio.status, 'off');
  assert.equal(el.paused, true);
  assert.equal(storage.m.get('davos-radio-off'), '1');
  const again = new CarRadio({ mode: () => 'car', storage, createElement: fakeElement, direct: true });
  assert.equal(again.on, false, 'kept off');
  radio.toggle();
  assert.equal(radio.station, RADIO_STATIONS[0], 'the station stayed');
  assert.equal(el.paused, false);
  assert.equal(storage.m.has('davos-radio-off'), false);
});

test('the stations are stepped through round the dial, both ways; the stream waits for the key to rest', () => {
  const { radio, el, storage } = make();
  radio.sync();
  el.fire('playing');
  radio.step(1);
  assert.equal(radio.station, RADIO_STATIONS[1]);
  assert.equal(el.paused, true, 'the old station is gone at once');
  radio.sync();
  assert.equal(el.log.filter((l) => l.startsWith('play')).length, 1, 'not while the key may still step on');
  radio.step(1);
  rest(radio);
  assert.equal(el.log.at(-1), `play ${RADIO_STATIONS[2].url}`);
  assert.equal(storage.m.get('davos-radio'), RADIO_STATIONS[2].id);
  radio.step(-1); radio.step(-1); radio.step(-1);
  assert.equal(radio.station, RADIO_STATIONS.at(-1), 'round the dial');
  radio.step(1);
  assert.equal(radio.station, RADIO_STATIONS[0]);
  radio.toggle();
  radio.step(1);
  assert.equal(radio.on, true, 'stepping switches it on');
  clearTimeout(radio.timer);
});

test('the logo\'s click goes through the stations, then to off, then to the first one again', () => {
  const { radio } = make();
  const seen = [];
  for (let i = 0; i < RADIO_STATIONS.length + 2; i++) { radio.cycle(); seen.push(radio.station?.id || 'off'); }
  assert.deepEqual(seen, [...RADIO_STATIONS.slice(1).map((s) => s.id), 'off', RADIO_STATIONS[0].id, RADIO_STATIONS[1].id]);
  clearTimeout(radio.timer);
});

test('the dial hisses between two stations and the hiss ends when the station is there', () => {
  const made = [];
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = (kind) => { const n = { kind, gain: param(), frequency: param(), Q: param(), connect(to) { return to; }, disconnect() {}, start() { n.started = true; }, stop() { n.stopped = true; } }; n.context = context; made.push(n); return n; };
  const context = { state: 'running', currentTime: 0, sampleRate: 100, destination: {},
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createBufferSource: () => node('noise'), createOscillator: () => node('osc'),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), createMediaElementSource: () => node('element') };
  const el = fakeElement();
  let mode = 'car';
  const radio = new CarRadio({ audio: { enabled: true, context }, mode: () => mode, storage: fakeStorage(), createElement: () => el, direct: false });
  radio.sync();
  assert.ok(radio.hiss, 'tuning in');
  assert.equal(made.filter((n) => n.kind === 'osc').length, 0, 'no whistle: nobody turned the dial');
  el.fire('playing');
  assert.equal(radio.hiss, null);
  radio.step(1);
  assert.ok(radio.hiss);
  assert.equal(made.filter((n) => n.kind === 'osc').length, 1, 'the dial whistles');
  const noise = made.filter((n) => n.kind === 'noise').length;
  radio.step(1);
  assert.equal(made.filter((n) => n.kind === 'noise').length, noise, 'one hiss while stepping on');
  mode = 'person';
  radio.sync();
  assert.equal(radio.hiss, null, 'not on foot');
  clearTimeout(radio.timer);
});

test('the kept station comes on in a vehicle only, and the stream is let go on foot, muted or hidden', () => {
  const { radio, el, state, audio } = make({ mode: 'person', stored: 'srf3' });
  assert.equal(radio.station.id, 'srf3');
  radio.sync();
  assert.deepEqual(el.log, []);
  state.mode = 'car';
  radio.sync();
  assert.equal(el.log.at(-1), `play ${radio.station.url}`);
  el.fire('playing');
  radio.sync();
  assert.equal(el.log.length, 1, 'held, not started again');
  audio.enabled = false;
  radio.sync();
  assert.equal(el.paused, true);
  assert.equal(el.log.at(-1), 'load');
  audio.enabled = true;
  state.mode = 'snowcat';
  radio.sync();
  assert.equal(el.paused, false);
  state.mode = 'person';
  radio.sync();
  assert.equal(el.paused, true);
  assert.equal(radio.on, true, 'the choice stays');
});

test('a station without a signal says so and is tried again later', () => {
  const { radio, el } = make({ stored: 'grischa' });
  radio.sync();
  el.fire('error');
  assert.equal(radio.status, 'error');
  const plays = el.log.filter((l) => l.startsWith('play')).length;
  radio.sync();
  assert.equal(el.log.filter((l) => l.startsWith('play')).length, plays, 'not at once');
  radio.retryAt = 0;
  radio.sync();
  assert.equal(el.log.filter((l) => l.startsWith('play')).length, plays + 1);
});

test('a game held still (the guest gate) lets the stream go, and neither a tap nor a step brings it back', () => {
  const { radio, el } = make();
  radio.sync();
  assert.equal(el.paused, false);
  radio.hold();
  assert.equal(el.paused, true);
  assert.equal(radio.playing, null);
  radio.step(1);
  rest(radio);
  radio.sync();
  assert.equal(el.paused, true, 'no stream while held');
});
