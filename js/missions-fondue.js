import * as THREE from 'three/webgpu';
import { groundHeight, trodHeight, surfaceHeight } from './terrain.js';
import { setWorldCenter } from './quality.js';
import { t as tr } from './i18n.js';
import { logoImage, drawLogo } from './logos.js';
import { pointAt, riderSpeed } from './missions-data-snow.js';
import { runHeading } from './missions-data-sledge.js';
import { sledgeSetup, sledgeMount, sledgeUnmount, sledgeUpdate, sledgeAfter, sledgeToast } from './missions-sledge.js';
import { el, live, swallow, blip, makeCrowd, poseCrowd } from './missions-gastro.js';
import {
  STIR, stirPoint, stirLift, stirGauge, fondueStir, flaemmliParams, createTipsy, tipsyInput, tipsyRoll, driftInput, assistInput, effectWord, passShortcut,
  schlittelCourse, schlittelHeight, SCHLITTEL_START_S, SCHLITTEL_TRACK, SCHLITTEL_SNOW, LANE, KONGRESS_DOOR, SCHATZALP_ARRIVAL, FONDUE_TABLE
} from './missions-data-fondue.js';
import { DRIFT } from './missions-data-sledge.js';

// js/missions-fondue.js
// The runtime of the Drupal Mountain Camp's Fondue Night (js/missions-data-fondue.js has its definition and the pure
// logic; js/missions.js takes FONDUE_FEATURES into its FEATURES):
//   fondueNight — the camp's banner on the Kongresszentrum's south front and two flags at its entrance, a few of the
//                 camp waiting there; the cut up to the Schatzalp; the table on the terrace with the caquelon; the pot
//                 from above on a canvas, the fork drawn through it with the mouse or a finger (pointer events, the
//                 stroke handed to stirPoint); the cut to the top of the sled run and the ride on the horn sledge of
//                 js/missions-sledge.js (sledgeSetup / sledgeMount): the run's packed snow drawn as one smooth ribbon on
//                 the height the sledge rides, torches along it, the shortcuts' flags, tracks and snow walls; the drift's
//                 charge on the HUD's meter; a camera that follows the sledge's own track (never into the slope or the
//                 trees beside it); after a Flämmli with effect, late horns and a swaying view.
//   flaemmli    — the Flämmli itself is js/missions-gastro.js's (the Rot Liechtli's game, one round in the Stübli).
// Everything is built for the run and goes with its group and its cleanups: nothing of it stays at the Kongress.
// The logo is the camp's (assets/logos/drupal-mountain-camp.webp, see assets/logos/SOURCES.md); the banner is drawn
// here round it, in the colours of the camp's 2027 pictures.

const NAVY = '#16245a', BLUE = '#0678be', SKY = '#cfeaf7', LILAC = '#cdb8f5';
const LOGO = { file: 'drupal-mountain-camp.webp', aspect: 417 / 168 };
const PW = 420, PH = 420, POT = { x: 210, y: 204, r: 166 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const stage = (run) => run.def.objectives[run.index]?.id;

const STYLE = `
.fd-game{position:fixed;inset:0;z-index:38;display:flex;align-items:flex-start;justify-content:center;padding-top:196px;box-sizing:border-box;background:rgba(6,8,14,.45);font-family:Inter,system-ui,sans-serif;color:#fff}
.fd-game[hidden],.fd-veil[hidden]{display:none!important}
.fd-box{display:flex;flex-direction:column;gap:8px;align-items:center;max-width:calc(100vw - 16px)}
.fd-card{background:rgba(10,12,20,.8);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 14px;font-size:13px;font-weight:600;text-align:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);max-width:420px;box-sizing:border-box}
.fd-card b{font-size:18px}
.fd-game canvas{border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);touch-action:none;max-width:calc(100vw - 16px);background:#2a1b12;cursor:crosshair}
.fd-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.fd-btn{border:0;border-radius:999px;min-height:54px;padding:12px 22px;font:800 16px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#ffb84f,#e0761c);box-shadow:0 6px 18px rgba(224,118,28,.4);touch-action:manipulation;user-select:none;-webkit-user-select:none;cursor:pointer}
.fd-btn.sec{background:linear-gradient(180deg,#2c8fd0,${BLUE});box-shadow:0 6px 18px rgba(6,120,190,.4)}
.fd-btn:active{filter:brightness(1.2);transform:scale(.97)}
.fd-btn kbd{font:700 12px Inter,system-ui,sans-serif;opacity:.8;margin-left:8px;padding:2px 6px;border:1px solid rgba(255,255,255,.5);border-radius:5px}
body.touch-enabled .fd-btn kbd{display:none}
.fd-veil{position:fixed;inset:0;z-index:37;background:#05070c;opacity:0;transition:opacity .6s;pointer-events:none;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font:800 22px/1.3 Inter,system-ui,sans-serif;color:#fff;text-align:center}
.fd-veil.on{opacity:1}
body.fd-hold #touch-controls{display:none!important}
@media (max-height:500px){.fd-game{padding-top:8px}}
`;

// --- Small builders ---------------------------------------------------------------------------------------------------------
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex };
}
/** The camp's mountains: a pale line of peaks along the bottom, as on its pictures for 2027 */
function mountains(c, w, h, y0, colour) {
  const ridge = [0, 0.55, 0.06, 0.3, 0.12, 0.42, 0.2, 0.05, 0.27, 0.5, 0.36, 0.72, 0.45, 0.6, 0.52, 0.34, 0.6, 0.66, 0.7, 0.8, 0.8, 0.5, 0.88, 0.22, 0.95, 0.4, 1, 0.3];
  c.fillStyle = colour;
  c.beginPath(); c.moveTo(0, h);
  for (let i = 0; i < ridge.length; i += 2) c.lineTo(ridge[i] * w, y0 + ridge[i + 1] * (h - y0));
  c.lineTo(w, h); c.closePath(); c.fill();
}
/** The banner: the logo, the dates, the camp's line (the lettering alone until the logo's image is there) */
function drawBanner(c, w, h, img) {
  c.fillStyle = NAVY; c.fillRect(0, 0, w, h);
  mountains(c, w, h, h * 0.62, 'rgba(207,234,247,.22)');
  c.fillStyle = LILAC; c.fillRect(0, h - 14, w, 14);
  const lw = w * 0.36;
  if (img) drawLogo(c, img, LOGO.aspect, w * 0.04, h * 0.14, lw, h * 0.6);
  else { c.fillStyle = '#fff'; c.font = `900 ${h * 0.2}px Inter, Arial, sans-serif`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('MOUNTAIN', w * 0.05, h * 0.34); c.fillText('CAMP', w * 0.05, h * 0.56); }
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const x = w * 0.45;
  c.fillStyle = '#fff'; c.font = `900 ${h * 0.17}px Inter, Arial, sans-serif`;
  c.fillText('Drupal Mountain Camp', x, h * 0.32, w * 0.52);
  c.fillStyle = SKY; c.font = `700 ${h * 0.115}px Inter, Arial, sans-serif`;
  c.fillText('Davos · 2–4 March 2027 · 10 year edition', x, h * 0.5, w * 0.52);
  c.fillStyle = '#fff'; c.font = `italic 600 ${h * 0.1}px Inter, Arial, sans-serif`;
  c.fillText('Open Source on top of the world', x, h * 0.68, w * 0.52);
}
/** A beach flag's cloth: the logo up its length */
function drawFlag(c, w, h, img) {
  c.fillStyle = BLUE; c.fillRect(0, 0, w, h);
  mountains(c, w, h, h * 0.86, 'rgba(255,255,255,.25)');
  c.save();
  c.translate(w / 2, h * 0.44); c.rotate(-Math.PI / 2);
  if (img) drawLogo(c, img, LOGO.aspect, -h * 0.36, -w * 0.4, h * 0.72, w * 0.8);
  else { c.fillStyle = '#fff'; c.font = `900 ${w * 0.3}px Inter, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MOUNTAIN CAMP', 0, 0, h * 0.7); }
  c.restore();
}

/** The banner on the hall's south front left of its entrance, the two flags beside the door, a few of the camp */
function buildKongress(run) {
  const g = new THREE.Group();
  g.name = 'FondueKongress';
  // (the hall's south edge, js/landmark-buildings-data.js KONGRESS: (124.9, -505.6) → (170.2, -508.7), outward to +z;
  // the glazed entrance takes 0.32–0.62 of it, the banner hangs on the larch left of it)
  const ax = 124.9, az = -505.6, bx = 170.2, bz = -508.7, L = Math.hypot(bx - ax, bz - az);
  const ex = (bx - ax) / L, ez = (bz - az) / L, nx = -ez, nz = ex;
  const yaw = Math.atan2(nx, nz);
  const banner = canvasTexture(1536, 512, (c, w, h) => drawBanner(c, w, h, null));
  const flag = canvasTexture(256, 832, (c, w, h) => drawFlag(c, w, h, null));
  const f = 0.16, mx = ax + (bx - ax) * f + nx * 0.14, mz = az + (bz - az) * f + nz * 0.14;
  const y = surfaceHeight(KONGRESS_DOOR.x, KONGRESS_DOOR.z);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshBasicNodeMaterial({ map: banner.tex, color: 0xd8d8d8 }));
  sheet.position.set(mx, y + 4.6, mz);
  sheet.rotation.y = yaw;
  g.add(sheet);
  const poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d33, roughness: 0.6 });
  const clothMat = new THREE.MeshBasicNodeMaterial({ map: flag.tex, color: 0xd8d8d8, side: THREE.DoubleSide });
  for (const [x, z] of [[143.2, -501.6], [153.4, -502.3]]) {
    const fy = surfaceHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 3.6, 6).translate(0, 1.8, 0), poleMat);
    pole.position.set(x, fy, z);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.6).translate(0.42, 2.2, 0), clothMat);
    cloth.position.set(x, fy, z);
    cloth.rotation.y = yaw;
    g.add(pole, cloth);
  }
  logoImage(LOGO).then((img) => {
    if (run.disposed) return;
    drawBanner(banner.tex.image.getContext('2d'), 1536, 512, img); banner.tex.needsUpdate = true;
    drawFlag(flag.tex.image.getContext('2d'), 256, 832, img); flag.tex.needsUpdate = true;
  }).catch(() => {});
  run.group.add(g);
  // a few of the camp at the door, turned to whoever comes up the forecourt
  const people = new THREE.Group();
  people.position.set(KONGRESS_DOOR.x, y, KONGRESS_DOOR.z);
  const spots = [[-2.6, 0.9, 0.5], [-1.5, 0.2, 0.2], [1.9, 0.5, -0.3], [3.0, 1.2, -0.6]].map(([x, z, yawK], i) => ({ x, z, yaw: yawK, female: i % 2 === 1, figure: ['m04', 'f04', 'm02', 'f01'][i] })); // (the player's figures: js/player-figure.js)
  const crowd = makeCrowd(spots, people);
  run.group.add(people);
  return crowd;
}

/** The table on the terrace: the caquelon on its burner, the flame under it, three of the camp round it */
function buildTable(run) {
  const T = FONDUE_TABLE;
  const g = new THREE.Group();
  g.name = 'FondueTable';
  g.position.set(T.x, surfaceHeight(T.x, T.z), T.z);
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x7a5230, roughness: 0.8 });
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.5 });
  const red = new THREE.MeshStandardNodeMaterial({ color: 0xb3221c, roughness: 0.45 });
  const cheese = new THREE.MeshStandardNodeMaterial({ color: 0xf2d98a, roughness: 0.4, emissive: 0x3a2c0a });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 20).translate(0, 0.78, 0), wood);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.76, 8).translate(0, 0.38, 0), wood);
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 10).translate(0, 0.855, 0), iron);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.12, 16).translate(0, 0.97, 0), red);
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.01, 16).translate(0, 1.027, 0), cheese);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.035).translate(0.28, 1.0, 0), red);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 6).translate(0, 0.9, 0.13), new THREE.MeshBasicNodeMaterial({ color: 0x5aa8ff }));
  top.castShadow = pot.castShadow = true;
  g.add(top, leg, burner, pot, fill, handle, flame);
  const spots = [[-0.95, -0.25, 1.3], [0.2, -1.0, -0.2], [0.95, 0.35, -1.9]].map(([x, z, yaw], i) => ({ x, z, yaw, female: i === 1, figure: ['m04', 'f02', 'm02'][i] }));
  const crowd = makeCrowd(spots, g);
  run.group.add(g);
  return { crowd, flame };
}

/** Torches down the run, every 25 m on one side and the other: the poles and the flames, two instanced meshes */
function buildTorches(run, course, height) {
  const spots = [];
  for (let s = 12, k = 0; s < course.length - 4; s += 25, k++) {
    const p = pointAt(course.pts, s), h = runHeading(course, s, 3), side = k % 2 ? 1 : -1;
    const x = p.x + Math.cos(h) * (SCHLITTEL_TRACK.half + 1.1) * side, z = p.z - Math.sin(h) * (SCHLITTEL_TRACK.half + 1.1) * side;
    spots.push([x, height(x, z), z]);
  }
  const m = new THREE.Matrix4();
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5).translate(0, 0.65, 0), new THREE.MeshStandardNodeMaterial({ color: 0x3a2a1c, roughness: 0.8 }), spots.length);
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.42, 6).translate(0, 1.5, 0), new THREE.MeshBasicNodeMaterial({ color: 0xffa436 }), spots.length);
  spots.forEach(([x, y, z], i) => { m.makeTranslation(x, y - 0.05, z); poles.setMatrixAt(i, m); flames.setMatrixAt(i, m); });
  poles.frustumCulled = flames.frustumCulled = false;
  poles.name = 'FondueTorchPoles'; flames.name = 'FondueTorches';
  run.group.add(run.storage(poles), run.storage(flames));
}

// --- The pot from above ---------------------------------------------------------------------------------------------------------
const cheeseColour = (burn) => {
  const a = [246, 222, 140], b = [176, 112, 44], k = clamp((burn - 0.35) / 0.65, 0, 1);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
};
function drawPot(c, fd, g, now) {
  const { x: cx, y: cy, r: R } = POT;
  c.clearRect(0, 0, PW, PH);
  const wood = c.createLinearGradient(0, 0, 0, PH);
  wood.addColorStop(0, '#5c3d24'); wood.addColorStop(1, '#3c2616');
  c.fillStyle = wood; c.fillRect(0, 0, PW, PH);
  // the caquelon: its handle, the red rim, the cheese
  c.fillStyle = '#8f1b16'; c.beginPath(); c.roundRect(cx + R - 6, cy - 16, 70, 32, 12); c.fill();
  c.fillStyle = '#b3221c'; c.beginPath(); c.arc(cx, cy, R + 14, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#7d1612'; c.beginPath(); c.arc(cx, cy, R + 3, 0, Math.PI * 2); c.fill();
  const melt = c.createRadialGradient(cx - 30, cy - 40, 20, cx, cy, R);
  melt.addColorStop(0, '#fff3c2'); melt.addColorStop(1, cheeseColour(g.burn));
  c.fillStyle = melt; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  // it catches from the rim inwards
  if (g.burn > 0.45) {
    const k = (g.burn - 0.45) / 0.55;
    const ring = c.createRadialGradient(cx, cy, R * (1 - 0.5 * k), cx, cy, R);
    ring.addColorStop(0, 'rgba(90,45,10,0)'); ring.addColorStop(1, `rgba(70,32,6,${0.75 * k})`);
    c.fillStyle = ring; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  }
  for (const [u, v, s] of fd.bubbles) {
    const a = 0.2 + 0.3 * Math.sin(now * 3 + s * 20) ** 2;
    c.fillStyle = `rgba(255,255,235,${a})`; c.beginPath(); c.arc(cx + u * R * 0.85, cy + v * R * 0.85, 2 + s * 5, 0, Math.PI * 2); c.fill();
  }
  // the eight to follow, pale
  c.strokeStyle = 'rgba(120,80,20,.3)'; c.lineWidth = 5; c.setLineDash([10, 12]); c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, px = cx + Math.sin(a) * R * 0.68, py = cy + Math.sin(a) * Math.cos(a) * R * 0.68; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
  c.stroke(); c.setLineDash([]);
  // the fork's wake, fading
  const trail = fd.trail;
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i], age = now - b.t;
    if (age > 1.6 || b.gap) continue;
    c.strokeStyle = `rgba(255,250,225,${0.75 * (1 - age / 1.6)})`; c.lineWidth = 14 * (1 - age / 2.4);
    c.beginPath(); c.moveTo(cx + a.u * R, cy + a.v * R); c.lineTo(cx + b.u * R, cy + b.v * R); c.stroke();
  }
  // the fork with its bread
  const p = fd.fork;
  if (p) {
    const fx = cx + p.u * R, fy = cy + p.v * R;
    c.strokeStyle = '#d9dde3'; c.lineWidth = 5; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 74, fy - 96); c.stroke();
    c.strokeStyle = '#2c2c30'; c.lineWidth = 9; c.beginPath(); c.moveTo(fx + 60, fy - 78); c.lineTo(fx + 92, fy - 120); c.stroke();
    c.fillStyle = '#e8c98a'; c.beginPath(); c.roundRect(fx - 12, fy - 11, 24, 22, 6); c.fill();
    c.strokeStyle = '#b98a4a'; c.lineWidth = 2; c.stroke();
  }
  // the count, the message of the last stroke
  c.textAlign = 'center';
  c.font = '900 30px Inter, system-ui, sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(40,20,5,.7)'; c.lineWidth = 5;
  const count = `${Math.min(g.eights, STIR.goal)}/${STIR.goal}`;
  c.strokeText(count, 44, 44); c.fillText(count, 44, 44);
  if (fd.pop && fd.pop.t > 0) {
    c.font = '900 22px Inter, system-ui, sans-serif'; c.fillStyle = fd.pop.good ? '#ffe14f' : '#ff8f80';
    c.globalAlpha = Math.min(1, fd.pop.t * 2);
    c.strokeText(fd.pop.text, cx, 34, PW - 110); c.fillText(fd.pop.text, cx, 34, PW - 110);
    c.globalAlpha = 1;
  }
  // how close it is to catching
  const bx = 40, by = PH - 30, bw = PW - 80;
  c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.roundRect(bx, by, bw, 14, 7); c.fill();
  c.fillStyle = g.burn > 0.75 ? '#ff4b3e' : g.burn > 0.5 ? '#ffc21a' : '#3fd66b';
  c.beginPath(); c.roundRect(bx, by, Math.max(14, bw * clamp(g.burn, 0, 1)), 14, 7); c.fill();
  c.font = '700 12px Inter, system-ui, sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(tr('creamy'), bx, by - 6);
  c.textAlign = 'right'; c.fillText(tr('catching'), bx + bw, by - 6);
}
// --- The run's snow, the shortcuts ---------------------------------------------------------------------------------------
/** Packed snow with the runners' grooves: across the texture's width (u) the run's width, along it (v) 8 m */
function snowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#e6edf4'; c.fillRect(0, 0, 128, 256);
  let r = 7;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '150,170,195'},${0.06 + rnd() * 0.1})`; c.fillRect(rnd() * 128, rnd() * 256, 1 + rnd() * 3, 2 + rnd() * 8); }
  // (the grooves of the runners, a pair either side of the middle, and the shoulders a little rougher)
  for (const x of [44, 52, 76, 84]) { c.fillStyle = 'rgba(120,140,170,.16)'; c.fillRect(x, 0, 3, 256); }
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, 0, 14, 256); c.fillRect(114, 0, 14, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** A ribbon along a line: `at(i)` gives station i's point and its direction (x, z, h), `n` stations, `us` the offsets across */
function ribbon(n, us, at, height, lift, vScale) {
  const pos = new Float32Array(n * us.length * 3), uv = new Float32Array(n * us.length * 2), idx = [];
  let v = 0, px = null, pz = null;
  for (let i = 0; i < n; i++) {
    const { x, z, h } = at(i), lx = Math.cos(h), lz = -Math.sin(h);
    if (px !== null) v += Math.hypot(x - px, z - pz) / vScale;
    px = x; pz = z;
    us.forEach((u, j) => {
      const k = i * us.length + j, X = x + lx * u, Z = z + lz * u;
      pos[k * 3] = X; pos[k * 3 + 1] = height(X, Z) + lift; pos[k * 3 + 2] = Z;
      uv[k * 2] = (u - us[0]) / (us[us.length - 1] - us[0]); uv[k * 2 + 1] = v;
      if (i && j) { const a = k - us.length - 1, b = k - us.length, d = k - 1; idx.push(a, d, b, b, d, k); }
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/**
 * The run's snow as the sledge rides it (S.height): one ribbon along the smoothed line over the bench and the snow banks
 * beside it, so the bench's polygon of 13 m chords and its ledges are under it; the shortcuts' tracks down through the
 * forest; at each lane's top two flags and a sign at the run's edge, at its foot the snow wall on the run's far side.
 */
function buildSnow(run, course, height) {
  const tex = snowTexture();
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const half = SCHLITTEL_SNOW.flat + 1.6, us = [-half, -half + 0.8, -2.2, -1.1, 0, 1.1, 2.2, half - 0.8, half];
  const n = Math.ceil(course.length) + 1;
  const run1 = new THREE.Mesh(ribbon(n, us, (i) => { const s = Math.min(course.length, i), p = pointAt(course.pts, s); return { x: p.x, z: p.z, h: runHeading(course, s, 1.5) }; }, height, 0.05, 8), mat);
  run1.name = 'FondueSnowRun'; run1.receiveShadow = true; run1.frustumCulled = false;
  run.group.add(run1);
  const flagMat = new THREE.MeshBasicNodeMaterial({ color: 0xff7a1a, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d33, roughness: 0.6 });
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5).translate(0, 0.9, 0), cloth = new THREE.PlaneGeometry(0.5, 0.34).translate(0.27, 1.6, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.2, 6).translate(0, 0.6, 0), coneGeo = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
  const barkMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a3222, roughness: 0.9 });
  const needleMat = new THREE.MeshStandardNodeMaterial({ color: 0x1f3d26, roughness: 0.85 }), needleMat2 = new THREE.MeshStandardNodeMaterial({ color: 0x24462b, roughness: 0.85 });
  const snowMat = new THREE.MeshStandardNodeMaterial({ color: 0xeef3f8, roughness: 0.9 });
  for (const L of course.lanes) {
    const steps = Math.ceil(L.len / 1.5) + 3;
    const lane = new THREE.Mesh(ribbon(steps, [-L.half - 0.4, -L.half + 0.4, 0, L.half - 0.4, L.half + 0.4], (i) => {
      const t = -0.08 + (i / (steps - 1)) * 1.08;
      return { x: L.ax + L.ux * t * L.len, z: L.az + L.uz * t * L.len, h: Math.atan2(L.ux, L.uz) };
    }, height, 0.06, 8), mat);
    lane.name = 'FondueShortcut'; lane.receiveShadow = true; lane.frustumCulled = false;
    run.group.add(lane);
    // the flags either side of the way in
    for (const side of [1, -1]) {
      const t = 6 / L.len, x = L.ax + L.ux * t * L.len + L.uz * side * (L.half + 0.3), z = L.az + L.uz * t * L.len - L.ux * side * (L.half + 0.3);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(pole, poleMat), new THREE.Mesh(cloth, flagMat));
      g.position.set(x, height(x, z) - 0.05, z);
      g.rotation.y = Math.atan2(L.ux, L.uz) + Math.PI / 2;
      run.group.add(g);
    }
    // the sign at the run's edge before the way in, facing the sledges coming down
    const s = L.s0 - 16, p = pointAt(course.pts, s), h = runHeading(course, s, 3), e = L.side * (SCHLITTEL_TRACK.half + 0.9);
    const x = p.x + Math.cos(h) * e, z = p.z - Math.sin(h) * e;
    const board = canvasTexture(256, 128, (c, w, hh) => {
      c.fillStyle = '#ff7a1a'; c.fillRect(0, 0, w, hh);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 34px Inter, Arial, sans-serif'; c.fillText(tr('SHORTCUT'), w / 2, 40, w - 16);
      c.font = '900 60px Inter, Arial, sans-serif'; c.fillText(L.side > 0 ? '⬅' : '➡', w / 2, 92);
    });
    const sign = new THREE.Group();
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6).translate(0, 0.8, 0), poleMat);
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45).translate(0, 1.55, 0), new THREE.MeshBasicNodeMaterial({ map: board.tex, color: 0xd0d0d0, side: THREE.DoubleSide }));
    sign.add(sp, sb);
    sign.position.set(x, height(x, z) - 0.05, z);
    sign.rotation.y = h + Math.PI;
    run.group.add(sign);
    // the young spruces in the lane (its obstacles: js/missions-data-sledge.js laneStep), snow on their tiers
    for (const [x, z, , ht] of L.trees) {
      const tree = new THREE.Group();
      tree.add(new THREE.Mesh(trunkGeo, barkMat));
      for (let k = 0; k < 3; k++) {
        const r = (0.95 - k * 0.25) * ht / 3, y = ht * (0.25 + k * 0.22), cone = new THREE.Mesh(coneGeo, k % 2 ? needleMat : needleMat2);
        cone.scale.set(r, ht * 0.42, r); cone.position.y = y;
        const cap = new THREE.Mesh(coneGeo, snowMat);
        cap.scale.set(r * 0.82, ht * 0.18, r * 0.82); cap.position.y = y + ht * 0.2;
        tree.add(cone, cap);
      }
      tree.position.set(x, height(x, z) - 0.1, z);
      tree.rotation.y = x * 7.1;
      tree.traverse((m) => { m.castShadow = true; });
      run.group.add(tree);
    }
    // the snow wall at the foot: a rounded bank on the far side of the run below
    const wall = course.bends.find((b) => b.berm && Math.abs(b.s0 + LANE.wall[0] - L.s1) < 1);
    if (wall) {
      const st = Math.ceil((wall.s1 - wall.s0) / 1) + 1, off = wall.side * (SCHLITTEL_TRACK.half + SCHLITTEL_TRACK.netGap);
      const geo = ribbon(st, [-0.9, -0.45, 0, 0.45, 0.9].map((u) => off + u * wall.side), (i) => { const ss = wall.s0 + i, q = pointAt(course.pts, ss); return { x: q.x, z: q.z, h: runHeading(course, ss, 2) }; }, height, 0, 8);
      // (raised in the middle: a bank 0.8 m high, its ends sloping down into the snow)
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const row = Math.floor(i / 5), j = i % 5, end = Math.min(1, Math.min(row, st - 1 - row) / 3);
        pa.setY(i, pa.getY(i) + [0.05, 0.6, 0.85, 0.6, 0.05][j] * end);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.name = 'FondueSnowWall'; m.frustumCulled = false;
      run.group.add(m);
    }
  }
}

// --- The camera on the ride -----------------------------------------------------------------------------------------------
// The follow camera of js/cameras.js stands behind the sledge along its heading: in the hairpins of a run cut into the
// slope that is in the slope or among the trees beside the run, and the view goes dark or into a trunk. On the ride the
// camera follows the sledge's own track instead: it stands where the sledge was ~6.5 m back along the way it went (that
// ground is clear), 2.4 m over the snow there, and higher still where the slope between it and the sledge would cut the
// view (the inside of a hairpin), and looks at the sledge and a little ahead of it.
const CAM = { back: 6.5, up: 2.4, look: 4, ease: 6 };
function rideCamera(run, camera, dt) {
  const fd = run.fd, S = run.sl, sl = S.sl, r = sl.rider, trail = fd.trail3;
  const last = trail[trail.length - 1];
  if (!last || Math.hypot(r.x - last.x, r.z - last.z) > 0.5) {
    trail.push({ x: r.x, y: r.y, z: r.z });
    if (trail.length > 80) trail.shift();
  }
  // (the point ~CAM.back m back along the track; before there is that much track, straight behind)
  let need = CAM.back, bx = r.x - Math.sin(r.heading) * CAM.back, bz = r.z - Math.cos(r.heading) * CAM.back, by = r.y;
  for (let i = trail.length - 1, px = r.x, pz = r.z; i >= 0; i--) {
    const q = trail[i], d = Math.hypot(q.x - px, q.z - pz);
    if (d >= need) { const k = need / d; bx = px + (q.x - px) * k; bz = pz + (q.z - pz) * k; by = q.y; break; }
    need -= d; px = q.x; pz = q.z;
  }
  let cy = Math.max(by, S.height(bx, bz)) + CAM.up;
  const ty = r.y + 0.9;
  // (the slope between the camera and the sledge: the camera rises until it looks over it)
  for (let k = 0.2; k < 0.95; k += 0.15) {
    const x = bx + (r.x - bx) * k, z = bz + (r.z - bz) * k, g = Math.max(S.height(x, z), groundHeight(x, z)) + 0.6;
    const line = cy + (ty - cy) * k;
    if (g > line) cy += (g - line) / (1 - k);
  }
  const want = fd.camWant.set(bx, cy, bz);
  const sp = riderSpeed(r), vx = sp > 1 ? r.vx / sp : Math.sin(r.heading), vz = sp > 1 ? r.vz / sp : Math.cos(r.heading);
  const look = fd.camLook.set(r.x + vx * CAM.look, ty, r.z + vz * CAM.look);
  const pos = fd.camPos;
  if (!fd.camOn || pos.distanceTo(want) > 25) pos.copy(want);
  else pos.lerp(want, 1 - Math.exp(-dt * CAM.ease));
  fd.camOn = true;
  camera.position.copy(pos);
  camera.lookAt(look);
}

// --- The feature -----------------------------------------------------------------------------------------------------------
const fondueNight = {
  // (js/missions.js hides the game's own controls while this is true: at the pot; the Flämmli has its own, js/missions-gastro.js)
  ownControls: (run) => !!run.fd?.potOpen,
  setup(run) {
    const s = el('style'); s.textContent = STYLE; document.head.append(s);
    run.cleanups.push(() => { s.remove(); document.body.classList.remove('fd-hold'); });
    // the pot
    const game = el('div', 'fd-game'); game.hidden = true;
    const box = el('div', 'fd-box');
    const info = el('div', 'fd-card');
    const canvas = el('canvas');
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = PW * dpr; canvas.height = PH * dpr;
    const fit = () => { const ih = globalThis.innerHeight || 800, iw = globalThis.innerWidth || 800; canvas.style.width = `${Math.max(220, Math.min(PW, iw - 20, ih <= 500 ? ih - 70 : ih - 300))}px`; };
    fit();
    run.listen(window, 'resize', fit);
    const c2 = canvas.getContext('2d'); c2.scale(dpr, dpr);
    box.append(info, canvas);
    game.append(box);
    const veil = el('div', 'fd-veil'); veil.hidden = true;
    document.body.append(game, veil);
    run.cleanups.push(() => { game.remove(); veil.remove(); });

    const fd = run.fd = {
      game, info, canvas, ctx: c2, veil,
      potOpen: false, held: false, down: false, fork: null, trail: [], pop: null, seq: 0, clock: 0,
      cut: null, tipsy: null, rideT: 0, rolled: 0,
      trail3: [], camOn: false, camPos: new THREE.Vector3(), camWant: new THREE.Vector3(), camLook: new THREE.Vector3(),
      bubbles: Array.from({ length: 22 }, (_, i) => { const a = i * 2.399, r = Math.sqrt((i + 0.5) / 22); return [Math.cos(a) * r, Math.sin(a) * r, (i * 0.37) % 1]; }),
      kongress: buildKongress(run), table: buildTable(run)
    };
    // the fork: the pointer on the pot, in pot radii from its middle, kept inside the rim
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      let u = (((e.clientX - r.left) / r.width) * PW - POT.x) / POT.r, v = (((e.clientY - r.top) / r.height) * PH - POT.y) / POT.r;
      const d = Math.hypot(u, v);
      if (d > 0.94) { u *= 0.94 / d; v *= 0.94 / d; }
      return { u, v };
    };
    const move = (e) => {
      const p = at(e), g = run.state.stir;
      fd.fork = p;
      if (!fd.down || run.phase !== 'running' && run.phase !== 'ready') return;
      fd.trail.push({ ...p, t: fd.clock });
      if (fd.trail.length > 90) fd.trail.shift();
      const made = stirPoint(g, p.u, p.v, fd.clock);
      if (made) fondueNight.made(run, made);
    };
    run.listen(canvas, 'pointerdown', (e) => {
      if (!fd.potOpen) return;
      e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
      fd.down = true;
      fd.trail.push({ ...at(e), t: fd.clock, gap: true });
      move(e);
    });
    run.listen(canvas, 'pointermove', (e) => { if (fd.potOpen) move(e); });
    for (const ev of ['pointerup', 'pointercancel']) run.listen(canvas, ev, () => { fd.down = false; if (run.state?.stir) stirLift(run.state.stir); });

    // the sledge and its run, the player still on foot (js/missions-sledge.js)
    const course = schlittelCourse();
    const height = schlittelHeight(trodHeight, groundHeight);
    sledgeSetup(run, { course, arches: [[SCHLITTEL_START_S + 4, 'START · FONDUE NIGHT · SCHATZALP', 0x0678be], [-2, 'ZIEL · FINISH · DAVOS PLATZ', 0xd42a20]], mounted: false, height, track: SCHLITTEL_TRACK });
    buildSnow(run, course, height);
    buildTorches(run, course, height);
    run.sl.onEvent = (ev, sl) => fondueNight.rideEvent(run, ev, sl);
  },
  /** The ride's own events (js/missions-data-sledge.js stepSledge): the drift, its boost, the shortcuts. true: handled */
  rideEvent(run, ev, sl) {
    const S = run.sl, st = run.state;
    if (ev === 'boost') {
      const n = sl.boostLevel;
      sledgeToast(S.hud, tr(['Drift boost!', 'Big drift boost!', 'Mega drift boost!'][n - 1]), ['#7fd6ff', '#5ab8ff', '#b88cff'][n - 1], 1.1);
      blip(run, 'good');
      return true;
    }
    if (ev === 'spun') { sledgeToast(S.hud, tr('Spun round: no boost'), '#ffd27a', 1.2); return true; }
    if (ev === 'drift' || ev === 'straight' || ev === 'lane' || ev === 'wall') return true;
    if (ev === 'edge') { sledgeToast(S.hud, tr('Deep snow!'), '#ffd27a', 0.8); return true; }
    if (ev === 'shortcut') {
      if (st && sl.lastLane) passShortcut(st, sl.lastLane.s1);
      sledgeToast(S.hud, tr('Shortcut!'), '#7dff9a', 1.2);
      blip(run, 'good');
      return true;
    }
    // (the snow wall at a shortcut's foot catches the sledge: no net, no toast)
    if (ev === 'net' && !sl.lane && sl.proj && S.course.bends.some((b) => b.berm && sl.proj.s >= b.s0 && sl.proj.s <= b.s1)) return true;
    return false;
  },
  reset(run) {
    const fd = run.fd;
    sledgeUnmount(run);
    run.sl.inputFilter = null; run.sl.params = null;
    fondueNight.hold(run, false);
    fd.potOpen = fd.down = false;
    fd.game.hidden = true;
    fd.veil.hidden = true; fd.veil.classList.remove('on');
    fd.trail.length = 0; fd.fork = null; fd.pop = null; fd.seq = 0; fd.cut = null; fd.tipsy = null; fd.rideT = 0; fd.rolled = 0;
    fd.trail3.length = 0; fd.camOn = false;
  },
  teardown(run) {
    fondueNight.hold(run, false);
    run.fd.game.hidden = true;
  },
  /** The walker stands still at the table (the pot has the pointer and the keys) */
  hold(run, on) {
    const cm = run.hooks.controllerManager, fd = run.fd;
    if (on === fd.held) return;
    fd.held = on;
    document.body.classList.toggle('fd-hold', on);
    if (on) cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
    else if (!run.sl?.mounted) cm.personDriver = null;
  },
  made(run, what) {
    const fd = run.fd;
    const good = what === 'eight';
    const text = { eight: 'Smooth!', circle: 'It splits: cross the middle!', splash: 'Too wild!', slow: 'Too slow!', burnt: `Caught! +${STIR.burnMs / 1000} s` }[what];
    fd.pop = { text: tr(text), good, t: 1.4 };
    blip(run, good ? 'good' : what === 'burnt' ? 'bad' : 'pock');
    if (what === 'burnt') run.audio?.thump?.();
  },
  key(run, e) {
    if (run.fd.potOpen && (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Key') || e.code.startsWith('Arrow'))) swallow(e);
  },
  /** A cut: the veil closes, `jump` moves the player behind it, the veil opens again */
  startCut(run, text, jump) {
    const fd = run.fd;
    fd.cut = { t: 0, jumped: false, jump };
    fd.veil.textContent = tr(text);
    fd.veil.hidden = false;
    requestAnimationFrame(() => fd.veil.classList.add('on'));
  },
  update(run, ctx, dt) {
    const fd = run.fd, st = run.state, id = stage(run);
    fd.clock += dt;
    // (last frame's sway off again before the camera is placed: the chase camera eases on from where it stands)
    if (fd.rolled && ctx.camera) { ctx.camera.rotateZ(-fd.rolled); fd.rolled = 0; }
    if (run.sl.mounted) sledgeUpdate(run, ctx, dt);
    if (fd.cut) {
      const c = fd.cut;
      c.t += dt;
      if (!c.jumped && c.t > 0.7) { c.jumped = true; c.jump(); }
      if (c.t > 1.7) { fd.veil.classList.remove('on'); fd.cut = null; setTimeout(() => { if (!run.fd.cut) fd.veil.hidden = true; }, 650); }
    }
    if (!live(run)) return;
    // up to the Schatzalp: the Schatzalpbahn's ride as a cut, the player set down on the terrace's east end
    if (id === 'up' && !st.arrived && !fd.cut) {
      fondueNight.startCut(run, 'With the Schatzalpbahn up to the Schatzalp …', () => {
        const { x, z, heading } = SCHATZALP_ARRIVAL, hooks = run.hooks;
        if (hooks.world) setWorldCenter(x, z);
        hooks.teleportXZ(x, z, heading);
        run.lastPos.copy(hooks.controllerManager.getActiveEntity().position); // (the ride is no teleport)
        st.arrived = true;
      });
    }
    // the pot
    const stirring = id === 'stir';
    if (stirring && !fd.potOpen) { fd.potOpen = true; fd.game.hidden = false; fondueNight.hold(run, true); }
    if (!stirring && fd.potOpen) { fd.potOpen = false; fd.down = false; fd.game.hidden = true; }
    if (stirring && run.phase === 'running') { const ev = fondueStir(st, dt); if (ev) fondueNight.made(run, ev); }
    if (fd.pop) fd.pop.t -= dt;
    // to the sledges: a cut to the top of the run, onto the horn sledge (the Flämmli's effect with it)
    if ((id === 'upper' || id === 'village') && !st.riding && !fd.cut) {
      const k = st.effect || 0, word = effectWord(k);
      fondueNight.startCut(run, { none: 'The Flämmli went cold. To the sledges!', mild: 'A mild Flämmli. To the sledges!', good: 'A good Flämmli. To the sledges!', strong: 'A strong Flämmli. To the sledges!' }[word], () => {
        const hooks = run.hooks, S = run.sl, p0 = pointAt(S.course.pts, SCHLITTEL_START_S);
        fondueNight.hold(run, false);
        if (hooks.world) setWorldCenter(p0.x, p0.z);
        S.params = flaemmliParams(k);
        fd.tipsy = k > 0 ? createTipsy(k) : null;
        // (the keys' drift: S with A/D held at speed; then the Flämmli's late horns)
        S.inputFilter = (input, d) => { const i = assistInput(driftInput(input), S.sl, S.course); return fd.tipsy ? tipsyInput(i, d, fd.tipsy) : i; };
        sledgeMount(run, SCHLITTEL_START_S, { wait: true, hints: [[['A', 'D'], 'steer'], [['S'], 'brake · with A/D: drift, let go: boost'], [['W'], 'duck · push off']] });
        hooks.cameraSystem?.resetForTeleport?.();
        st.riding = true;
        fd.rideT = 0;
        fd.trail3.length = 0; fd.camOn = false;
        sledgeToast(S.hud, tr(k >= 0.45 ? 'The valley sways: steer early!' : 'W to go: the sledge keeps to the run by itself'), '#ffd27a', 3);
      });
    }
    if (st.riding) {
      fd.rideT += dt;
      const sl = run.sl.sl;
      if (sl) {
        st.onLane = !!sl.lane; st.shortcuts = sl.shortcuts; st.boosts = sl.boosts; st.trees = sl.trees;
        const s = sl.proj.s;
        st.laneAhead = !sl.lane && run.sl.course.lanes.some((L) => s > L.s0 - 70 && s < L.s0 + 2);
      }
    }
  },
  after(run, ctx, dt) {
    const fd = run.fd, st = run.state;
    // (over: the pot away, and a cut that was under way with its veil — `update` no longer runs to end it)
    const over = run.phase === 'done' || run.phase === 'aborted' || run.phase === 'failed';
    if (over && fd.potOpen) { fd.potOpen = false; fd.game.hidden = true; fondueNight.hold(run, false); }
    if (over && fd.cut) { fd.cut = null; fd.veil.classList.remove('on'); fd.veil.hidden = true; }
    sledgeAfter(run);
    // the people at the door and at the table (whichever is near)
    const near = (g) => Math.hypot(ctx.x - g.x, ctx.z - g.z) < 120;
    if (near(KONGRESS_DOOR)) poseCrowd(fd.kongress, dt);
    if (near(FONDUE_TABLE)) { poseCrowd(fd.table.crowd, dt); fd.table.flame.scale.y = 1 + 0.3 * Math.sin(fd.clock * 17); }
    if (fd.potOpen && st) {
      drawPot(fd.ctx, fd, st.stir, fd.clock);
      const v = stirGauge(st.stir);
      const line = `<b>${tr(v.text)}</b><br>${tr(v.hint)}`;
      if (fd.info._t !== line) { fd.info._t = line; fd.info.innerHTML = line; }
    }
    const S = run.sl, sl = S.sl;
    if (sl && st?.riding && (run.phase === 'running' || run.phase === 'done') && ctx.camera) {
      // the camera on the sledge's own track (the follow camera only, and not while the player turns it)
      const cs = run.hooks.cameraSystem;
      if (cs?.activePresetId === 'chase' && !cs.isDragging && !(cs.userOrbitTimer > 0)) rideCamera(run, ctx.camera, dt);
      else fd.camOn = false;
      // the drift's charge on the HUD's meter (where the tilt is otherwise)
      const hud = S.hud;
      if (sl.drift) {
        const c = sl.drift.charge, lv = DRIFT.levels, level = c >= lv[2] ? 3 : c >= lv[1] ? 2 : c >= lv[0] ? 1 : 0;
        hud.fill.style.width = `${Math.round(Math.min(1, c / lv[2]) * 100)}%`;
        hud.fill.style.background = ['#9fb3c8', '#7fd6ff', '#5ab8ff', '#b88cff'][level];
      }
      const label = hud.box.children[1], want = tr(sl.drift ? 'Drift' : 'Tilt');
      if (label && label.textContent !== want) label.textContent = want;
    } else fd.camOn = false;
    // after a Flämmli with effect the view sways (after the camera is placed for the frame, as js/missions-fx.js's shake)
    if (fd.tipsy && st?.riding && run.phase === 'running' && ctx.camera) {
      fd.rolled = tipsyRoll(fd.rideT, fd.tipsy.k) * Math.min(1, fd.rideT / 2);
      ctx.camera.rotateZ(fd.rolled);
      ctx.camera.updateMatrixWorld();
    } else if (fd.camOn) ctx.camera.updateMatrixWorld();
  }
};

export const FONDUE_FEATURES = { fondueNight };
