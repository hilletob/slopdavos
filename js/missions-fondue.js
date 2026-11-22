import * as THREE from 'three/webgpu';
import { groundHeight, trodHeight, surfaceHeight } from './terrain.js';
import { setWorldCenter } from './quality.js';
import { t as tr } from './i18n.js';
import { logoImage, drawLogo } from './logos.js';
import { pointAt } from './missions-data-snow.js';
import { runHeading } from './missions-data-sledge.js';
import { sledgeSetup, sledgeMount, sledgeUnmount, sledgeUpdate, sledgeAfter, sledgeToast } from './missions-sledge.js';
import { el, live, swallow, blip, makeCrowd, poseCrowd } from './missions-gastro.js';
import {
  STIR, stirPoint, stirLift, stirGauge, fondueStir, chooseFlaemmli, flaemmliParams, createTipsy, tipsyInput, tipsyRoll,
  schlittelCourse, schlittelHeight, SCHLITTEL_START_S, SCHLITTEL_TRACK, KONGRESS_DOOR, SCHATZALP_ARRIVAL, FONDUE_TABLE
} from './missions-data-fondue.js';

// js/missions-fondue.js
// The runtime of the Drupal Mountain Camp's Fondue Night (js/missions-data-fondue.js has its definition and the pure
// logic; js/missions.js takes FONDUE_FEATURES into its FEATURES):
//   fondueNight — the camp's banner on the Kongresszentrum's south front and two flags at its entrance, a few of the
//                 camp waiting there; the cut up to the Schatzalp; the table on the terrace with the caquelon; the pot
//                 from above on a canvas, the fork drawn through it with the mouse or a finger (pointer events, the
//                 stroke handed to stirPoint); the Flämmli's two buttons; the cut to the top of the sled run and the
//                 ride on the horn sledge of js/missions-sledge.js (sledgeSetup / sledgeMount), with torches along the
//                 run and, after a Flämmli with effect, late horns and a swaying view.
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
  const spots = [[-2.6, 0.9, 0.5], [-1.5, 0.2, 0.2], [1.9, 0.5, -0.3], [3.0, 1.2, -0.6]].map(([x, z, yawK], i) => ({ x, z, yaw: yawK, female: i % 2 === 1 }));
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
  const spots = [[-0.95, -0.25, 1.3], [0.2, -1.0, -0.2], [0.95, 0.35, -1.9]].map(([x, z, yaw], i) => ({ x, z, yaw, female: i === 1 }));
  const crowd = makeCrowd(spots, g);
  run.group.add(g);
  return { crowd, flame };
}

/** Torches down the run, every 25 m on one side and the other: the poles and the flames, two instanced meshes */
function buildTorches(run, course) {
  const spots = [];
  for (let s = 12, k = 0; s < course.length - 4; s += 25, k++) {
    const p = pointAt(course.pts, s), h = runHeading(course, s, 3), side = k % 2 ? 1 : -1;
    const x = p.x + Math.cos(h) * (SCHLITTEL_TRACK.half + 1.1) * side, z = p.z - Math.sin(h) * (SCHLITTEL_TRACK.half + 1.1) * side;
    spots.push([x, trodHeight(x, z), z]);
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
/** The Flämmli on its card: the cup, the schnapps alight on top */
function drawCup(c, now) {
  c.clearRect(0, 0, 200, 150);
  for (let k = 0; k < 3; k++) {
    const w = 26 - k * 7, h = 44 - k * 10 + Math.sin(now * (9 + k * 3) + k) * 5;
    c.fillStyle = ['rgba(60,130,255,.55)', 'rgba(120,180,255,.75)', 'rgba(230,240,255,.9)'][k];
    c.beginPath(); c.moveTo(100 - w, 62); c.quadraticCurveTo(100 + Math.sin(now * 7 + k) * 6, 62 - h * 1.5, 100 + w, 62); c.closePath(); c.fill();
  }
  c.fillStyle = '#f4f1ea'; c.beginPath(); c.moveTo(58, 60); c.lineTo(142, 60); c.lineTo(132, 122); c.quadraticCurveTo(100, 134, 68, 122); c.closePath(); c.fill();
  c.strokeStyle = '#f4f1ea'; c.lineWidth = 9; c.beginPath(); c.arc(146, 86, 15, -Math.PI / 2, Math.PI / 2); c.stroke();
  c.fillStyle = '#4a2c16'; c.beginPath(); c.ellipse(100, 61, 40, 7, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d9d4c8'; c.beginPath(); c.ellipse(100, 134, 62, 9, 0, 0, Math.PI * 2); c.fill();
}

// --- The feature -----------------------------------------------------------------------------------------------------------
const fondueNight = {
  // (js/missions.js hides the game's own controls while this is true: at the pot and at the Flämmli)
  ownControls: (run) => !!(run.fd?.potOpen || run.fd?.cupOpen),
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
    // the Flämmli
    const cup = el('div', 'fd-game'); cup.hidden = true;
    const cupBox = el('div', 'fd-box');
    const cupCanvas = el('canvas'); cupCanvas.width = 200; cupCanvas.height = 150; cupCanvas.style.cssText = 'width:200px;background:#1a1410;cursor:default';
    const cupInfo = el('div', 'fd-card');
    const row = el('div', 'fd-row');
    const withBtn = el('button', 'fd-btn'); withBtn.type = 'button';
    const withoutBtn = el('button', 'fd-btn sec'); withoutBtn.type = 'button';
    row.append(withBtn, withoutBtn);
    cupBox.append(cupCanvas, cupInfo, row);
    cup.append(cupBox);
    const veil = el('div', 'fd-veil'); veil.hidden = true;
    document.body.append(game, cup, veil);
    run.cleanups.push(() => { game.remove(); cup.remove(); veil.remove(); });

    const fd = run.fd = {
      game, info, canvas, ctx: c2, cup, cupCanvas, cupCtx: cupCanvas.getContext('2d'), cupInfo, withBtn, withoutBtn, veil,
      potOpen: false, cupOpen: false, held: false, down: false, fork: null, trail: [], pop: null, seq: 0, clock: 0,
      cut: null, tipsy: null, rideT: 0, rolled: 0,
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
    run.listen(withBtn, 'click', () => fondueNight.choose(run, true));
    run.listen(withoutBtn, 'click', () => fondueNight.choose(run, false));

    // the sledge and its run, the player still on foot (js/missions-sledge.js)
    const course = schlittelCourse();
    sledgeSetup(run, { course, arches: [[SCHLITTEL_START_S + 4, 'START · FONDUE NIGHT · SCHATZALP', 0x0678be], [-2, 'ZIEL · FINISH · DAVOS PLATZ', 0xd42a20]], mounted: false, height: schlittelHeight(trodHeight, groundHeight), track: SCHLITTEL_TRACK });
    buildTorches(run, course);
  },
  reset(run) {
    const fd = run.fd;
    sledgeUnmount(run);
    run.sl.inputFilter = null; run.sl.params = null;
    fondueNight.hold(run, false);
    fd.potOpen = fd.cupOpen = fd.down = false;
    fd.game.hidden = fd.cup.hidden = true;
    fd.veil.hidden = true; fd.veil.classList.remove('on');
    fd.trail.length = 0; fd.fork = null; fd.pop = null; fd.seq = 0; fd.cut = null; fd.tipsy = null; fd.rideT = 0; fd.rolled = 0;
  },
  teardown(run) {
    fondueNight.hold(run, false);
    run.fd.game.hidden = run.fd.cup.hidden = true;
  },
  /** The walker stands still at the table (the pot and the cup have the pointer and the keys) */
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
  choose(run, withEffect) {
    if (!run.fd.cupOpen || run.phase !== 'running') return;
    if (chooseFlaemmli(run.state, withEffect)) blip(run, withEffect ? 'fwoosh' : 'good');
  },
  key(run, e) {
    const fd = run.fd;
    if (fd.cupOpen && !e.repeat && (e.code === 'KeyF' || e.code === 'KeyG')) { swallow(e); fondueNight.choose(run, e.code === 'KeyF'); return; }
    if ((fd.potOpen || fd.cupOpen) && (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Key') || e.code.startsWith('Arrow'))) swallow(e);
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
    // the Flämmli
    const choosing = id === 'flaemmli';
    if (choosing && !fd.cupOpen) { fd.cupOpen = true; fd.cup.hidden = false; fondueNight.hold(run, true); }
    if (!choosing && fd.cupOpen) { fd.cupOpen = false; fd.cup.hidden = true; }
    // to the sledges: a cut to the top of the run, onto the horn sledge
    if ((id === 'upper' || id === 'village') && !st.riding && !fd.cut) {
      fondueNight.startCut(run, st.choice === 'tipsy' ? 'A Flämmli with effect. To the sledges!' : 'A Flämmli without effect. To the sledges!', () => {
        const hooks = run.hooks, S = run.sl, p0 = pointAt(S.course.pts, SCHLITTEL_START_S);
        fondueNight.hold(run, false);
        if (hooks.world) setWorldCenter(p0.x, p0.z);
        S.params = flaemmliParams(st.choice);
        fd.tipsy = st.choice === 'tipsy' ? createTipsy() : null;
        S.inputFilter = fd.tipsy ? (input, d) => tipsyInput(input, d, fd.tipsy) : null;
        sledgeMount(run, SCHLITTEL_START_S, { wait: true });
        hooks.cameraSystem?.resetForTeleport?.();
        st.riding = true;
        fd.rideT = 0;
        if (fd.tipsy) sledgeToast(S.hud, tr('The valley sways: steer early!'), '#ffd27a', 2.6);
      });
    }
    if (st.riding) fd.rideT += dt;
  },
  after(run, ctx, dt) {
    const fd = run.fd, st = run.state;
    // (over: the pot and the cup away, and a cut that was under way with its veil — `update` no longer runs to end it)
    const over = run.phase === 'done' || run.phase === 'aborted' || run.phase === 'failed';
    if (over && (fd.potOpen || fd.cupOpen)) { fd.potOpen = fd.cupOpen = false; fd.game.hidden = fd.cup.hidden = true; fondueNight.hold(run, false); }
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
    if (fd.cupOpen) {
      drawCup(fd.cupCtx, fd.clock);
      const line = tr('A Kafi with a schnapps alight on top. With effect: the sledge runs faster, but the horns answer late and the valley sways. Without: all as it is.');
      if (fd.cupInfo._t !== line) {
        fd.cupInfo._t = line; fd.cupInfo.textContent = line;
        fd.withBtn.innerHTML = `${tr('With effect')}<kbd>F</kbd>`; fd.withoutBtn.innerHTML = `${tr('Without effect')}<kbd>G</kbd>`;
      }
    }
    // after a Flämmli with effect the view sways (after the camera is placed for the frame, as js/missions-fx.js's shake)
    if (fd.tipsy && st?.riding && run.phase === 'running' && ctx.camera) {
      fd.rolled = tipsyRoll(fd.rideT) * Math.min(1, fd.rideT / 2);
      ctx.camera.rotateZ(fd.rolled);
      ctx.camera.updateMatrixWorld();
    }
  }
};

export const FONDUE_FEATURES = { fondueNight };
