import { KEYS } from './storage-keys.js';
// js/car-radio.js
// The radio (a prototype): real stations as live streams while the player sits in a vehicle that has a radio. It is on
// from the start, on Radio Grischa; a click on the station's logo in the speed cluster (js/hud-radio.js) goes on
// to the next station and after the last one to off, with the hiss of a dial between two stations until the next one
// is there. The station and the switch are kept (localStorage). Out of the vehicle, with the sound muted (N) or the tab hidden the stream is let go altogether (a
// live stream is not paused: the element drops its source and tunes in anew), so nothing is downloaded that nobody
// hears.
//
// The stations are the SRG's public streams and Radio Grischa, all MP3 over HTTPS with CORS headers (checked
// 2026-11-21), so the element can be led through the game's AudioContext: the volume is a GainNode, which is what
// works on iOS too (Safari ignores an element's `volume`). ?radio=direct plays the element by itself instead (should a
// browser stay silent behind the context; no hiss then).

const STORE = KEYS.radio; // the station's id
const STORE_OFF = KEYS.radioOff; // '1': switched off
const VOLUME = 0.5;
const TUNE_MS = 350; // stepping through the stations: the stream starts once the key rests
const HISS = 0.11; // the dial's noise between two stations
const HISS_MIN_MS = 450; // (heard even when the next station is there at once)
const RETRY_MS = 8000; // a station without a signal is tried again

const srg = (path) => `https://stream.srg-ssr.ch/srgssr/${path}/mp3/128`;
/** `short`: the touch button's face and the speed cluster's badge; `logo`: a file of assets/logos/radio/ shown there
 *  instead (js/hud-radio.js) */
export const RADIO_STATIONS = [
  { id: 'grischa', name: 'Radio Grischa', short: 'Grischa', url: 'https://stream.radiogrischa.ch/radiogrischa/mp3_128', logo: 'grischa.svg' },
  { id: 'srf3', name: 'Radio SRF 3', short: 'SRF 3', url: srg('srf3'), logo: 'srf3.svg' },
  { id: 'virus', name: 'Radio SRF Virus', short: 'Virus', url: srg('srfvirus'), logo: 'virus.svg' },
  { id: 'pop', name: 'Radio Swiss Pop', short: 'Swiss Pop', url: srg('rsp'), logo: 'swiss-pop.svg' }
];

/** The travel modes with a radio: the car's and the groomer's own, the Rega helicopter's headset, and on the bike
 *  an earphone (the paraglider, no mode of its own, comes in by `also`) */
export const RADIO_MODES = new Set(['car', 'snowcat', 'helicopter', 'cyclist']);

export class CarRadio {
  /** audio: the game's CityAudioSystem (its context and its mute); mode(): the travel mode now; also(): the radio is
   *  there whatever the mode (under the paraglider); onChange(): the label or the state changed (the key bar and the
   *  touch button follow) */
  constructor({ audio = null, mode = () => '', also = () => false, onChange = () => {}, stations = RADIO_STATIONS, storage = globalThis.localStorage, createElement = null, direct = null } = {}) {
    this.audio = audio;
    this.mode = mode;
    this.also = also;
    this.onChange = onChange;
    this.stations = stations;
    this.storage = storage;
    this.createElement = createElement || (() => new Audio());
    this.direct = direct ?? (typeof location !== 'undefined' && new URLSearchParams(location.search).get('radio') === 'direct');
    this.index = 0; // the chosen station (the first one, Radio Grischa, until another is)
    this.enabled = true; // the switch
    this.playing = null; // the station whose stream the element holds
    this.status = 'off'; // 'off' | 'tuning' | 'on' | 'error'
    this.holdUntil = 0;
    this.retryAt = 0;
    this.el = null;
    this.gain = null;
    this.timer = null;
    this.hiss = null; // { source, gain, since } while the dial hisses
    try {
      this.index = Math.max(0, this.stations.findIndex((s) => s.id === this.storage?.getItem(STORE)));
      this.enabled = this.storage?.getItem(STORE_OFF) !== '1';
    } catch { /* Private browsing. */ }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.sync());
  }

  /** The station the radio is set to; null: switched off */
  get station() { return this.enabled ? this.stations[this.index] || null : null; }
  get on() { return this.enabled; }
  available() { return RADIO_MODES.has(this.mode()) || !!this.also(); }

  save() {
    try {
      this.storage?.setItem(STORE, this.stations[this.index].id);
      if (this.enabled) this.storage?.removeItem(STORE_OFF); else this.storage?.setItem(STORE_OFF, '1');
    } catch { /* Storage is optional. */ }
  }

  /** On and off; the station stays */
  toggle() {
    this.enabled = !this.enabled;
    this.save();
    this.stop();
    this.onChange();
    this.sync();
  }

  /** The next station (dir -1: the one before), round the dial; switches the radio on */
  step(dir = 1) {
    const n = this.stations.length;
    this.index = (this.index + (dir < 0 ? -1 : 1) + n) % n;
    this.enabled = true;
    this.save();
    this.stop(true);
    if (this.wanted()) this.hissOn(true);
    this.holdUntil = Date.now() + TUNE_MS;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), TUNE_MS + 10);
    this.onChange();
  }

  /** The logo's click: the next station, off after the last one, and from off the first one again */
  cycle() {
    if (!this.enabled) { this.index = this.stations.length - 1; this.step(1); }
    else if (this.index + 1 >= this.stations.length) this.toggle();
    else this.step(1);
  }

  /** Whether a stream should run now, and which */
  wanted() {
    if (!this.on || !this.available() || this.audio?.enabled === false) return null;
    if (typeof document !== 'undefined' && document.hidden) return null;
    return this.station;
  }

  /** Brings the stream in line with what is wanted; cheap, called every frame and on every change */
  sync() {
    const want = this.wanted();
    const now = Date.now();
    if (!want && this.hiss) this.hissOff(true); // (out of the vehicle while the dial was turning)
    if (want && now < this.holdUntil) return;
    if (want === this.playing) {
      if (want && this.status === 'error' && now >= this.retryAt) { this.stop(); this.start(want); }
      return;
    }
    this.stop();
    if (want) this.start(want);
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.onChange();
  }

  element() {
    if (this.el) return this.el;
    const el = this.el = this.createElement();
    el.preload = 'none';
    el.addEventListener('playing', () => {
      if (!this.playing) return;
      this.fade(VOLUME, 0.4, this.hissOff());
      this.setStatus('on');
    });
    const tuning = () => { if (this.playing && this.status === 'on') this.setStatus('tuning'); };
    el.addEventListener('waiting', tuning); // (not 'stalled': a live stream fires it while it plays, and no 'playing' follows)
    el.addEventListener('error', () => this.fail());
    el.addEventListener('ended', () => this.fail()); // (a live stream that ends has been cut off)
    return el;
  }

  /** The element behind the game's context (once): its volume is a gain, on iOS the only one there is */
  route(el) {
    const context = this.direct ? null : this.audio?.context;
    if (!context || this.gain) return;
    try {
      this.gain = context.createGain();
      this.gain.gain.value = 0;
      context.createMediaElementSource(el).connect(this.gain).connect(context.destination);
      // (a direct start before the context was there left the element's volume at 0; from here the gain is the volume)
      try { el.volume = 1; } catch { /* iOS: the volume is the device's. */ }
    } catch (error) {
      console.warn('[radio] playing without the audio context', error);
      this.gain = null;
      this.direct = true;
    }
  }

  /** The station's volume towards `value` within `seconds`, starting `delay` seconds from now */
  fade(value, seconds, delay = 0) {
    if (this.gain) {
      const t = this.gain.context.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(value, t + delay, seconds / 3);
    } else if (this.el) {
      try { this.el.volume = value; } catch { /* iOS: the volume is the device's. */ }
    }
  }

  start(station) {
    const el = this.element();
    // (before the source: a cross-origin element without CORS would come out of the context silent)
    if (!this.direct && this.audio?.context) el.crossOrigin = 'anonymous';
    this.route(el);
    this.playing = station;
    this.setStatus('tuning');
    this.hissOn();
    this.fade(0, 0.01);
    el.src = station.url;
    const played = el.play();
    played?.catch?.((error) => {
      if (this.playing !== station) return;
      if (error?.name === 'NotAllowedError') this.awaitGesture(); // (the browser wants a tap or a key first)
      else if (error?.name !== 'AbortError') this.fail();
    });
  }

  /** Lets the stream go; `hissing`: the dial is being turned, its noise goes on */
  stop(hissing = false) {
    this.dropGesture?.();
    if (!hissing) this.hissOff(true);
    if (!this.playing) { if (!this.on && this.status !== 'off') this.setStatus('off'); return; }
    this.playing = null;
    this.fade(0, 0.01);
    const el = this.el;
    el.pause();
    el.removeAttribute('src');
    el.load(); // (lets the connection go)
    this.setStatus(this.on ? 'tuning' : 'off');
  }

  fail() {
    if (!this.playing) return;
    this.retryAt = Date.now() + RETRY_MS;
    this.hissOff(true);
    this.setStatus('error');
  }

  /** The dial's noise: band-limited hiss with a crackle in it, and with `whistle` the short falling tone of a dial
   *  that is being turned. Needs the game's context (none in the direct mode) */
  hissOn(whistle = false) {
    const context = this.direct ? null : this.audio?.context;
    if (!context || context.state !== 'running') return;
    const t = context.currentTime;
    if (!this.hiss) {
      if (!this.noise) {
        const buffer = this.noise = context.createBuffer(1, Math.floor(context.sampleRate * 1.5), context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.0015 ? 3 : 0.8);
      }
      const source = context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1700;
      band.Q.value = 0.45;
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(HISS, t, 0.02);
      source.connect(band).connect(gain).connect(context.destination);
      source.start(t, Math.random());
      this.hiss = { source, gain, since: Date.now() };
    }
    if (whistle) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const from = 1800 + Math.random() * 1600;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(from * 0.25, t + 0.3);
      gain.gain.setValueAtTime(0.018, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(context.destination);
      osc.start(t);
      osc.stop(t + 0.32);
      osc.onended = () => gain.disconnect();
    }
  }

  /** Ends the noise, `now` or once it has been heard for a moment; returns the seconds until then (the station
   *  fades in after them) */
  hissOff(now = false) {
    const hiss = this.hiss;
    if (!hiss) return 0;
    this.hiss = null;
    const context = hiss.gain.context;
    const delay = now ? 0 : Math.max(0, HISS_MIN_MS - (Date.now() - hiss.since)) / 1000;
    const t = context.currentTime + delay;
    hiss.gain.gain.setTargetAtTime(0, t, now ? 0.02 : 0.08);
    try { hiss.source.stop(t + 0.5); } catch { /* Already stopped. */ }
    hiss.source.onended = () => hiss.gain.disconnect();
    return delay;
  }

  awaitGesture() {
    this.hissOff(true);
    if (typeof document === 'undefined' || this.dropGesture) return;
    const retry = () => { this.dropGesture?.(); this.playing = null; this.sync(); };
    // (pointerup and click too: a finger's pointerdown is no user activation, on iOS the play() would be refused again)
    document.addEventListener('pointerup', retry);
    document.addEventListener('click', retry);
    this.dropGesture = () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('pointerup', retry);
      document.removeEventListener('click', retry);
      document.removeEventListener('keydown', retry);
      this.dropGesture = null;
    };
    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
  }
}
