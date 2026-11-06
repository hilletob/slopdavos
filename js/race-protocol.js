// js/race-protocol.js
// The pure logic of a race between players (js/race-session.js runs it, js/race-net.js carries it over Supabase Realtime):
// the room code, the snapshots a player sends of their vehicle and how a receiver plays them back (a short delay, then
// interpolation between the two snapshots either side of the moment, a little extrapolation when they stop coming),
// which player is the host (the one who joined first), the clock offset to the host from ping/pong round trips, the
// standings (finished by time, then racing by the gates passed and the way to the next, then those who dropped out)
// and the countdown's text. No DOM, no three.js, no network in here: tests/race.test.mjs drives it on its own.

export const SNAPSHOT_HZ = 8; // (Supabase's free plan allows ~100 messages a second a project: 4 players at 8 Hz use a third)
export const COUNTDOWN_MS = 4000; // from the host's "Start" to the release
export const PLAYBACK_DELAY_MS = 150; // how far behind the newest snapshot a ghost is shown (room for a late one)
export const MAX_EXTRAPOLATE_MS = 300; // after that a ghost stands still until snapshots come again
export const MAX_PLAYERS = 4;

// --- The room code ---------------------------------------------------------------------------------------------------
// (no 0/O or 1/I: read out over a table, typed on a phone)
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
const CODE_SHAPE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function makeCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.min(CODE_ALPHABET.length - 1, Math.floor(random() * CODE_ALPHABET.length))];
  return code;
}
/** What was typed or pasted, as a code: upper case, only the alphabet's characters, the first CODE_LENGTH of them */
export const cleanCode = (value) => String(value ?? '').trim().toUpperCase().replace(new RegExp(`[^${CODE_ALPHABET}]`, 'g'), '').slice(0, CODE_LENGTH);
export const codeFits = (code) => CODE_SHAPE.test(code);

// --- The snapshots ---------------------------------------------------------------------------------------------------
// A player's vehicle as the others see it: where it stands (x, z), how high over the ground (the quad's hops), which way
// it points and how it leans, its speed and steering (for the wheels), the next gate (for the standings). Sent as a
// short array of rounded numbers, so a snapshot is ~60 bytes.
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
export const SNAPSHOT_FIELDS = ['x', 'z', 'hop', 'heading', 'tilt', 'roll', 'speed', 'steer', 'gate'];

export function packSnapshot(s) {
  return [r2(s.x), r2(s.z), r2(s.hop), r3(s.heading), r3(s.tilt), r3(s.roll), r2(s.speed), r3(s.steer), Math.max(0, Math.floor(Number(s.gate) || 0))];
}

/** The array back as an object, or null for anything that is not a snapshot (another client's bug or an older version) */
export function unpackSnapshot(a) {
  if (!Array.isArray(a) || a.length < SNAPSHOT_FIELDS.length) return null;
  const s = {};
  for (let i = 0; i < SNAPSHOT_FIELDS.length; i++) {
    const v = a[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    s[SNAPSHOT_FIELDS[i]] = v;
  }
  return s;
}

const TAU = Math.PI * 2;
/** From angle a to b the short way round, `k` of the way */
export function lerpAngle(a, b, k) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * k;
}

/**
 * The playback of one remote player's snapshots. push(snapshot, receivedAt) as they come (receivedAt: the receiver's own
 * clock in ms; the senders' clocks never meet). sample(now) gives the pose to show at `now`: the one PLAYBACK_DELAY_MS ago,
 * interpolated between the snapshots either side; past the newest, extrapolated along its heading at its speed for at
 * most MAX_EXTRAPOLATE_MS (`stale: true` once that is used up). null before the first snapshot.
 */
export function createInterpolator({ delay = PLAYBACK_DELAY_MS, maxExtrapolate = MAX_EXTRAPOLATE_MS, keep = 2000 } = {}) {
  const buffer = [];
  const pose = (s) => ({ x: s.x, z: s.z, hop: s.hop, heading: s.heading, tilt: s.tilt, roll: s.roll, speed: s.speed, steer: s.steer, gate: s.gate, stale: false });
  const between = (a, b, k) => ({
    x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, hop: a.hop + (b.hop - a.hop) * k,
    heading: lerpAngle(a.heading, b.heading, k), tilt: a.tilt + (b.tilt - a.tilt) * k, roll: a.roll + (b.roll - a.roll) * k,
    speed: a.speed + (b.speed - a.speed) * k, steer: a.steer + (b.steer - a.steer) * k, gate: b.gate, stale: false
  });
  return {
    push(snapshot, receivedAt) {
      if (!snapshot) return;
      const last = buffer[buffer.length - 1];
      if (last && receivedAt <= last.at) receivedAt = last.at + 1; // (two in one tick: keep the order they came in)
      buffer.push({ ...snapshot, at: receivedAt });
      while (buffer.length > 2 && buffer[0].at < receivedAt - keep) buffer.shift();
    },
    sample(now) {
      if (!buffer.length) return null;
      const t = now - delay;
      if (t <= buffer[0].at) return pose(buffer[0]);
      for (let i = 1; i < buffer.length; i++) {
        const a = buffer[i - 1], b = buffer[i];
        if (b.at >= t) return between(a, b, (t - a.at) / (b.at - a.at || 1));
      }
      const last = buffer[buffer.length - 1];
      const over = t - last.at;
      const ahead = Math.min(over, maxExtrapolate) / 1000;
      const p = pose(last);
      p.x += Math.sin(last.heading) * last.speed * ahead;
      p.z += Math.cos(last.heading) * last.speed * ahead;
      p.stale = over > maxExtrapolate;
      return p;
    },
    get latest() { return buffer.length ? buffer[buffer.length - 1] : null; },
    get size() { return buffer.length; }
  };
}

// --- The players -----------------------------------------------------------------------------------------------------
/** The host: whoever has been in the room longest (the same answer on every client, from the presence state). null: nobody */
export function electHost(members) {
  let host = null;
  for (const m of members || []) {
    if (!m?.id) continue;
    if (!host || m.joinedAt < host.joinedAt || (m.joinedAt === host.joinedAt && m.id < host.id)) host = m;
  }
  return host ? host.id : null;
}

/**
 * How far the host's clock is ahead of this one (ms), from ping/pong pairs { sent, received, hostNow } (sent/received
 * on this clock, hostNow the host's when it answered): the median of the samples, each assuming a symmetric trip.
 */
export function offsetFromPings(pairs) {
  const offsets = (pairs || []).filter((p) => Number.isFinite(p?.sent) && Number.isFinite(p?.received) && Number.isFinite(p?.hostNow) && p.received >= p.sent)
    .map((p) => p.hostNow - (p.sent + (p.received - p.sent) / 2)).sort((a, b) => a - b);
  if (!offsets.length) return 0;
  const mid = offsets.length >> 1;
  return offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2;
}

/** The release on this clock from the host's `at` (its clock) and the offset to it */
export const releaseTime = (at, offset) => at - offset;

/**
 * The standings: [{ ...player, place, dist }]. Finished first, by their time; then those racing, by the gates passed and
 * then the way to the next; then those who dropped out. players: [{ id, name, x, z, gate, total (ms or null), aborted }],
 * gates: [{ x, z }] in the order driven (the finish last).
 */
export function standings(players, gates) {
  const rows = (players || []).map((p) => {
    const g = gates?.[Math.min(p.gate || 0, (gates?.length || 1) - 1)];
    const dist = g && Number.isFinite(p.x) && Number.isFinite(p.z) ? Math.hypot(g.x - p.x, g.z - p.z) : Infinity;
    return { ...p, dist };
  });
  const group = (p) => (Number.isFinite(p.total) ? 0 : p.aborted ? 2 : 1);
  rows.sort((a, b) => {
    const ga = group(a), gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) return a.total - b.total || String(a.id).localeCompare(String(b.id));
    if (ga === 1) return (b.gate || 0) - (a.gate || 0) || a.dist - b.dist || String(a.id).localeCompare(String(b.id));
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

/** "3", "2", "1", "Go!" and then nothing; before the last five seconds "Get ready" */
export function countdownText(releaseAt, now) {
  if (!Number.isFinite(releaseAt)) return '';
  const left = releaseAt - now;
  if (left > 5000) return 'Get ready';
  if (left > 0) return String(Math.ceil(left / 1000));
  if (left > -900) return 'Go!';
  return '';
}

/** A guest's id for the room: random, kept for the tab (a reload joins again as the same player) */
export function guestId(storage, random = Math.random) {
  const KEY = 'slopdavos-race-guest';
  try {
    const kept = storage?.getItem(KEY);
    if (kept && /^g-[a-z0-9]{8,}$/.test(kept)) return kept;
  } catch { /* (storage off) */ }
  let id = 'g-';
  while (id.length < 12) id += Math.floor(random() * 36).toString(36);
  try { storage?.setItem(KEY, id); } catch { /* */ }
  return id;
}

/** A name to show for a player: what they typed, within 3 to 20 characters, else "Player" and the end of the id */
export function displayName(name, id) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (clean.length >= 3) return clean;
  return `Player ${String(id ?? '').slice(-4).toUpperCase() || '?'}`;
}
