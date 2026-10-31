import * as THREE from 'three/webgpu';
import { abs, cameraPosition, clamp, distance, float, fract, max, mix, mx_noise_float, normalViewGeometry, positionView, positionWorld, smoothstep, step, texture, uniform, vec2, vec3 } from 'three/tsl';
import { winter } from './season.js';
import { QUALITY } from './quality.js';

// The groom map: where the player's snow groomer (js/snowcat.js, the tiller lowered with F) has prepared the snow, and
// the snow clock that wears the pistes and the Loipen down between two groomings.
//
// The snow clock counts "skier hours" (S): the hours of a ski day the slopes have been ridden. It runs while it is
// winter, RATE times faster than real time (default 20: a whole ski day of 8 h wears off in 24 min of play). The
// pistes and the Loipen were last groomed at pisteBase / loipeBase (uniforms, in S); their wear is
// (snowClock - groomed) / FULL_DAY: 0 fresh corduroy, 1 a ridden-out evening piste. The start state follows the time of
// day (js/lighting.js presets, WEAR_AT): the night shift grooms everything by 23:00, at 13:30 the runs have had 4.5 h
// of skiers, at 17:45 and 19:15 the whole day.
//
// The player's own grooming is kept twice:
//  - as segments on the CPU (x, z of both ends, the S they were groomed at, the pass): up to MAX_SEGMENTS (one per
//    ~0.5 m of tiller travel: ~40 km), so that a track survives driving away and coming back;
//  - rasterised into a camera-centred window (SIZE² texels of TEXEL m: 256 m square, 128 m on the mobile profile) in an
//    RGBA8 DataTexture that the terrain, piste and Loipe shaders sample: R the signed offset across the pass from its
//    centre line (±UENC: the band of ±UMAX and a ring around it, so that the filtered offset stays continuous at its
//    edge), G coverage, B the S of the grooming (relative to `epoch`, SPAN skier hours in 8 bit, ~6 min a
//    step), A the pass (the newest pass's inside overwrites older passes, its edge berm only bare snow). The window is
//    re-centred (and re-rasterised from the segments) when the camera strays a quarter of it from its centre.
// No draw call at all: the texture is written on the CPU and uploaded (a few times a second, only while grooming or
// after re-centring). It is 1 texel until the first grooming (no memory used before that).

export const TILLER_HALF = 2.15; // m (js/snowcat.js TILLER.half: the tiller is 4.3 m wide)
const TILLER_BACK = 3.3; // m behind the groomer's centre (the finisher mat)
export const UMAX = 3.0; // the stored band: the tiller plus the low berm it leaves along both edges
const UENC = 3.5; // the offset's range in the R channel (the band and a ring around it)
const TEXEL = 0.25;
const SIZE = QUALITY.mobile ? 512 : 1024; // (1 MB on the mobile profile, 4 MB else)
const EXTENT = SIZE * TEXEL;
const SPAN = 24; // skier hours in the B channel
const MAX_SEGMENTS = 80000;
const STEP = 0.5; // m of tiller travel per segment
const UPLOAD_INTERVAL = 0.2; // s
export const FULL_DAY = 8; // skier hours: a fully ridden piste
export const WEAR_AT = { golden: 7.5, midday: 4.5, twilight: 8, midnight: 0 };
let RATE = 20;

// --- Uniforms --------------------------------------------------------------------------------------------------------
export const snowClock = uniform(SPAN / 2);
export const pisteBase = uniform(SPAN / 2 - WEAR_AT.golden);
export const loipeBase = uniform(SPAN / 2 - WEAR_AT.golden);
const epoch = uniform(0);
const origin = uniform(new THREE.Vector2(-1e6, -1e6));
const invExtent = uniform(1 / EXTENT);

function makeTexture(data, size) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
let groomTexture = makeTexture(new Uint8Array(4), 1);
const textureNodes = [];

// --- Shader side ---------------------------------------------------------------------------------------------------
/** The groom map under the fragment: { cover (0-1), u (m across the pass), s (S groomed), inside (the tiller's width,
 *  soft edged, 0-1), berm (the low wall just outside its edges, 0-1) } */
export function groomSample() {
  const st = positionWorld.xz.sub(origin).mul(invExtent);
  const node = texture(groomTexture, st);
  textureNodes.push(node);
  const within = step(0.001, st.x).mul(step(st.x, 0.999)).mul(step(0.001, st.y)).mul(step(st.y, 0.999));
  const cover = smoothstep(0.02, 0.45, node.g).mul(within).mul(winter);
  const u = node.r.mul(2).sub(1).mul(UENC);
  const au = abs(u);
  const s = node.b.mul(SPAN).add(epoch);
  const inside = smoothstep(TILLER_HALF + 0.04, TILLER_HALF - 0.08, au).mul(cover);
  // The berm: a low wall from the edge out to ~0.6 m, steep towards the track, flat away from it
  const berm = smoothstep(TILLER_HALF - 0.05, TILLER_HALF + 0.12, au).mul(smoothstep(TILLER_HALF + 0.75, TILLER_HALF + 0.2, au)).mul(cover);
  return { cover, u, au, s, inside, berm };
}

/** Wear (0 fresh .. ~1.5) of snow groomed at skier hour `s` */
export const wearSince = (s, full = FULL_DAY) => clamp(snowClock.sub(s).div(full), 0, 1.5);

/** A view-space normal (for a material's normalNode) bumped by a height field `h` (m) over the surface: Mikkelsen's
 *  surface-gradient bump mapping from screen-space derivatives (so `h` may be any node: uv-based patterns too) */
export function bumpedNormal(h) {
  const p = positionView, n = normalViewGeometry;
  const sx = p.dFdx(), sy = p.dFdy();
  const r1 = sy.cross(n), r2 = n.cross(sx);
  const det = sx.dot(r1);
  const grad = det.sign().mul(r1.mul(h.dFdx()).add(r2.mul(h.dFdy())));
  return det.abs().mul(n).sub(grad).normalize();
}

/** The terrain's snow (season.js snowyGround) with the player's freshly groomed tracks on it: packed snow combed into
 *  corduroy along the pass (fading with the snow's age and with distance), a sharp edge and the berm's shadow line. */
export function groomedGround(colour) {
  const g = groomSample();
  // (the mobile profile, js/quality.js simpleMaterials: the tracks in plain packed snow, no cord, scuffs or berm edge)
  if (QUALITY.simpleMaterials) return mix(colour, vec3(0.62, 0.64, 0.67), g.inside);
  const wear = wearSince(g.s);
  const fresh = smoothstep(0.35, 0.0, wear);
  const dist = distance(positionWorld, cameraPosition);
  const fine = mx_noise_float(positionWorld.xz.mul(1.1)).mul(0.5).add(0.5);
  // (as the pistes: packed snow just below the tone mapper's shoulder, so that the cord shows in a hint of blue grey)
  const packed = mix(vec3(0.61, 0.63, 0.66), vec3(0.645, 0.66, 0.685), fine);
  const ridge = abs(fract(g.u.div(0.12)).sub(0.5)).mul(2);
  // (faded out with distance into its mean shade: the combed stripe still reads from afar)
  const cord = mix(float(0.45), ridge, smoothstep(45, 8, dist)).mul(0.34).mul(fresh);
  // Worn: the cord gone, footprints and the odd ski track in it
  const scuff = smoothstep(0.55, 0.85, mx_noise_float(positionWorld.xz.mul(vec2(2.2, 0.6))).mul(0.5).add(0.5)).mul(smoothstep(0.1, 0.6, wear)).mul(0.18);
  const track = mix(packed, vec3(0.36, 0.41, 0.5), max(cord, scuff));
  // The edge: a crisp shadow line where the berm rises; its top a little brighter than the snow around
  const edge = smoothstep(0.22, 0.0, abs(g.au.sub(TILLER_HALF + 0.05))).mul(g.cover).mul(smoothstep(900, 60, dist));
  let out = mix(colour, track, g.inside);
  out = mix(out, out.mul(1.08), g.berm.mul(0.6));
  out = mix(out, vec3(0.42, 0.47, 0.56), edge.mul(mix(float(0.55), float(0.3), smoothstep(0.2, 1.0, wear))));
  return out;
}

/** The roughness of groomed snow (packed: a touch smoother) over the terrain's `roughness` */
export const groomedRoughness = (roughness) => mix(float(roughness), float(0.82), groomSample().inside);

// --- CPU side --------------------------------------------------------------------------------------------------------
class GroomMap {
  constructor() {
    this.segs = new Float32Array(0); // [ax, az, bx, bz, s, pass] per segment
    this.count = 0;
    this.data = null; // the window's texels (null until the first grooming)
    this.ox = 0; this.oz = 0; // the window's corner (world x, z)
    this.dirty = false;
    this.sinceUpload = 0;
    this.last = null; // the tiller's last stamped point
    this.pass = 0;
    this.passLength = 0;
    this.presetId = null;
    this.grooming = false;
  }

  get stats() {
    return { segments: this.count, cpuBytes: this.segs.byteLength, gpuBytes: this.data ? this.data.byteLength : 4, size: this.data ? SIZE : 1, texel: TEXEL, rate: RATE, clock: snowClock.value, pisteWear: (snowClock.value - pisteBase.value) / FULL_DAY, grooming: this.grooming };
  }

  // The time of day's wear (lighting presets)
  setTimeOfDay(presetId) {
    this.presetId = presetId;
    const hours = WEAR_AT[presetId] ?? WEAR_AT.golden;
    pisteBase.value = snowClock.value - hours;
    loipeBase.value = snowClock.value - hours;
  }

  /** Time-lapse: `hours` skier hours pass for every groomed surface */
  age(hours) {
    snowClock.value += hours;
    this.rebase();
    return this.stats;
  }

  /** Everything freshly groomed */
  fresh() {
    pisteBase.value = loipeBase.value = snowClock.value;
    return this.stats;
  }

  setRate(rate) { RATE = rate; return RATE; }

  // Keeps the B channel's span over the clock (older groomings clamp to the epoch: by then fully worn anyway)
  rebase(force = false) {
    if (!force && snowClock.value - epoch.value < SPAN - 2) return;
    epoch.value = snowClock.value - SPAN / 2;
    if (this.data) this.rasterAll();
  }

  allocate(cx, cz) {
    this.data = new Uint8Array(SIZE * SIZE * 4);
    const t = makeTexture(this.data, SIZE);
    for (const node of textureNodes) node.value = t;
    const old = groomTexture;
    groomTexture = t;
    setTimeout(() => old.dispose(), 1000);
    this.recentre(cx, cz);
  }

  recentre(cx, cz) {
    this.ox = Math.round((cx - EXTENT / 2) / TEXEL) * TEXEL;
    this.oz = Math.round((cz - EXTENT / 2) / TEXEL) * TEXEL;
    origin.value.set(this.ox, this.oz);
    this.rasterAll();
  }

  rasterAll() {
    this.data.fill(0);
    const s = this.segs, x0 = this.ox - UENC, z0 = this.oz - UENC, x1 = this.ox + EXTENT + UENC, z1 = this.oz + EXTENT + UENC;
    for (let i = 0; i < this.count; i++) {
      const k = i * 6;
      if (Math.max(s[k], s[k + 2]) < x0 || Math.min(s[k], s[k + 2]) > x1 || Math.max(s[k + 1], s[k + 3]) < z0 || Math.min(s[k + 1], s[k + 3]) > z1) continue;
      this.raster(s[k], s[k + 1], s[k + 2], s[k + 3], s[k + 4], s[k + 5]);
    }
    this.dirty = true;
  }

  // One segment of a pass into the window: texels within UMAX of it (its ends stretched by EXT so that the segments
  // of a bending pass overlap)
  raster(ax, az, bx, bz, s, pass) {
    const EXT = 0.45;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) return;
    const ux = dx / L, uz = dz / L;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - UENC - EXT - this.ox) / TEXEL));
    const i1 = Math.min(SIZE - 1, Math.ceil((Math.max(ax, bx) + UENC + EXT - this.ox) / TEXEL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - UENC - EXT - this.oz) / TEXEL));
    const j1 = Math.min(SIZE - 1, Math.ceil((Math.max(az, bz) + UENC + EXT - this.oz) / TEXEL));
    if (i0 > i1 || j0 > j1) return;
    const sb = Math.max(0, Math.min(255, Math.round(((s - epoch.value) / SPAN) * 255)));
    const pb = (pass % 254) + 1;
    const d = this.data;
    for (let j = j0; j <= j1; j++) {
      const rz = this.oz + (j + 0.5) * TEXEL - az;
      for (let i = i0; i <= i1; i++) {
        const rx = this.ox + (i + 0.5) * TEXEL - ax;
        const t = rx * ux + rz * uz;
        if (t < -EXT || t > L + EXT) continue;
        const u = ux * rz - uz * rx; // + to the right of the direction of travel (x east, z south)
        const au = Math.abs(u);
        if (au > UENC) continue;
        const k = (j * SIZE + i) * 4;
        const old = Math.abs((d[k] / 255) * 2 - 1) * UENC;
        if (au > UMAX) {
          // A ring just outside the band, uncovered (G = 0), so that the filtered offset and time stay continuous
          // up to the band's edge: only on texels no band covers
          if (d[k + 1] || (d[k + 3] && au >= old)) continue;
        } else if (d[k + 1]) {
          // The same pass: the texel keeps the nearer centre line. Another pass: the new one's inside overwrites it,
          // the new one's berm leaves it as it was
          if (d[k + 3] === pb ? au >= old : au > TILLER_HALF) continue;
        }
        d[k] = Math.round((u / UENC * 0.5 + 0.5) * 255);
        d[k + 1] = au > UMAX ? 0 : Math.max(1, Math.round(Math.min(1, (UMAX - au) / 0.5) * 255)); // (soft towards the band's edge)
        d[k + 2] = sb;
        d[k + 3] = pb;
      }
    }
    this.dirty = true;
  }

  addSegment(ax, az, bx, bz) {
    if (this.count >= MAX_SEGMENTS) {
      // The oldest quarter goes
      const drop = MAX_SEGMENTS / 4;
      this.segs.copyWithin(0, drop * 6, this.count * 6);
      this.count -= drop;
    }
    if ((this.count + 1) * 6 > this.segs.length) {
      const grown = new Float32Array(Math.min(MAX_SEGMENTS, Math.max(1024, this.count * 2)) * 6);
      grown.set(this.segs.subarray(0, this.count * 6));
      this.segs = grown;
    }
    const k = this.count * 6, s = snowClock.value;
    this.segs.set([ax, az, bx, bz, s, this.pass], k);
    this.count++;
    if (!this.data) this.allocate(bx, bz);
    this.raster(ax, az, bx, bz, s, this.pass);
  }

  /** Per frame: the clock, the time of day, the groomer's tiller, the window around the camera, the upload */
  update(dt, cameraPos, controllers, presetId) {
    if (presetId && presetId !== this.presetId) this.setTimeOfDay(presetId);
    if (winter.value > 0) snowClock.value += (dt * RATE) / 3600;
    this.rebase();

    const cat = controllers?.entities?.snowcat;
    const lift = cat?.model?.tillerLift?.value ?? 1;
    this.grooming = !!cat && controllers.activeMode === 'snowcat' && winter.value > 0.5 && lift < 0.03 && cat.speed > 0.3;
    if (this.grooming) {
      const x = cat.position.x - Math.sin(cat.heading) * TILLER_BACK, z = cat.position.z - Math.cos(cat.heading) * TILLER_BACK;
      if (!this.last) {
        this.last = { x, z };
        this.pass++;
        this.passLength = 0;
      } else {
        const d = Math.hypot(x - this.last.x, z - this.last.z);
        if (d > 30) this.last = null; // teleported
        else if (d >= STEP) {
          this.addSegment(this.last.x, this.last.z, x, z);
          this.last = { x, z };
          // A long pass in parts (a pass crossing itself: the newer part lies on top)
          if ((this.passLength += d) > 120) { this.pass++; this.passLength = 0; }
        }
      }
    } else this.last = null;

    if (this.data && cameraPos) {
      const cx = this.ox + EXTENT / 2, cz = this.oz + EXTENT / 2;
      if (Math.abs(cameraPos.x - cx) > EXTENT / 4 || Math.abs(cameraPos.z - cz) > EXTENT / 4) this.recentre(cameraPos.x, cameraPos.z);
    }
    this.sinceUpload += dt;
    if (this.dirty && this.sinceUpload >= UPLOAD_INTERVAL) {
      groomTexture.needsUpdate = true;
      this.dirty = false;
      this.sinceUpload = 0;
    }
    this.hook();
  }

  // Debug hooks on window.__slopdavos (set up by main.js once the first frame is through)
  hook() {
    const w = typeof window !== 'undefined' ? window.__slopdavos : null;
    if (!w || w.snowAge) return;
    w.groomMap = this;
    w.snowAge = (hours) => this.age(hours);
    w.snowFresh = () => this.fresh();
    w.snowRate = (rate) => this.setRate(rate);
  }
}

export const groomMap = new GroomMap();
