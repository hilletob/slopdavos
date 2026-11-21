import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attribute, vertexColor } from 'three/tsl';
import { PersonCrowd, PersonRig } from './pedestrians.js';
import { surfaceHeight } from './terrain.js';
import { t as tr, getLanguage } from './i18n.js';
import { QUALITY } from './quality.js';
import {
  QUIZ, GIGI, QUIZ_BOTS, quizHandoff, pickQuestions, seenQuestions, noteQuestions, tableSeats, createRound, roundPhase, lockGuess, cutWaiting,
  hasGuessed, guessOf, questionResult, tableStandings, gigiLine, parseGuess, formatNumber
} from './missions-data-quiz.js';

// js/missions-quiz.js
// The runtime of "Gigi's guessing round" (js/missions-data-quiz.js has the questions, the points, the regulars and the
// round's clock): js/missions.js merges QUIZ_FEATURES into its features.
//  - quiz: the umbrella bar beside Bolgen Plaza (the umbrella, the barrel table, the glasses), Gigi and the four
//    regulars standing round it, and the card over the view: Gigi's line, the question, the time left, the field for
//    the number, the seats with a tick for everyone who has guessed, and at the reveal the guesses on a line with the
//    answer, the points and the table's standing.
// The table is either this run's own (a lone player and the regulars: made when the player steps up) or a session with
// other players (js/quiz-session.js through quizHandoff: the round and its clock are the session's, the player sits
// from the start). Both are driven by Date.now() against the round's start: the card shows where the clock says the
// round stands, whatever the frame rate.
// The card's texts are translated here at each render (tr), numbers written as the language does: the observer of
// js/i18n.js leaves the card alone (.player-name on its root), the names in it stay as typed.

const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = () => document.body.classList.contains('touch-enabled') || matchMedia('(pointer: coarse)').matches;
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
const ME_COLOUR = '#f5c542';
// The reveal's beats (ms into it): the guesses drop onto the line, the roll, the answer and the points, the table
const R_IN = 1500, R_DRUM = 3600, R_TABLE = 7200;

const STYLE = `
.gq{position:fixed;left:50%;bottom:calc(var(--keybar-clear,54px) + 6px);transform:translateX(-50%);z-index:40;width:min(660px,calc(100vw - 16px));max-height:calc(100vh - 150px);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:16px;background:rgba(10,12,20,.86);border:2px solid rgba(245,197,66,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 10px 34px rgba(0,0,0,.45);font-family:Inter,system-ui,sans-serif;color:#fff;font-variant-numeric:tabular-nums}
.gq[hidden],.gq [hidden]{display:none!important}
.gq-gigi{display:flex;gap:10px;align-items:flex-start}
.gq-face{flex:none;width:38px;height:38px;border-radius:50%;background:#d9261c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:900 18px Inter,system-ui,sans-serif}
.gq-say{flex:1;min-width:0}
.gq-who{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#f5c542;font-weight:800}
.gq-who span{color:rgba(255,255,255,.55);font-weight:600;text-transform:none;letter-spacing:0}
.gq-line{margin:2px 0 0;font-size:14px;line-height:1.35;color:rgba(255,255,255,.92)}
.gq-kicker{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.gq-kicker b{color:#f5c542}
.gq-question{margin:3px 0 0;font-size:22px;line-height:1.3;font-weight:800}
.gq-time{display:flex;align-items:center;gap:10px}
.gq-clock{flex:none;width:46px;height:46px;border-radius:50%;background:#f5c542;color:#14161f;display:flex;align-items:center;justify-content:center;font:900 22px Inter,system-ui,sans-serif;box-shadow:0 0 0 4px rgba(245,197,66,.22)}
.gq-time.is-late .gq-clock{background:#ff5a5a;color:#fff;box-shadow:0 0 0 4px rgba(255,90,90,.28)}
.gq-clock.is-beat{animation:gq-beat .5s}
.gq-timer{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden}
.gq-timer i{display:block;height:100%;background:linear-gradient(90deg,#ffb347,#f5c542);transform-origin:left center}
.gq-time.is-late .gq-timer i{background:#ff5a5a}
.gq-main.is-new .gq-question{animation:gq-zoom .55s cubic-bezier(.2,1.4,.4,1)}
.gq-main.is-new .gq-kicker{animation:gq-slide .4s both}
.gq-x2{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#f5c542;color:#14161f;font-weight:900;animation:gq-wobble 1.6s ease-in-out infinite}
.gq-form{display:flex;gap:8px;align-items:center}
.gq-input{flex:1;min-width:0;padding:10px 12px;font:800 22px Inter,system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.28);border-radius:10px;outline:none;font-variant-numeric:tabular-nums}
.gq-input:focus{border-color:#f5c542}
.gq-unit{flex:none;max-width:38%;font-size:13px;color:rgba(255,255,255,.75)}
.gq-ok{flex:none;border:0;border-radius:10px;padding:12px 18px;font:800 16px Inter,system-ui,sans-serif;color:#14161f;background:#f5c542;touch-action:manipulation}
.gq-ok:disabled{opacity:.45}
.gq-mine{font-size:15px;font-weight:700}
.gq-mine b{font-size:20px;color:#f5c542}
.gq-mine span{color:rgba(255,255,255,.6);font-weight:600}
.gq-seats{display:flex;flex-wrap:wrap;gap:6px}
.gq-seat{position:relative;display:flex;align-items:center;gap:6px;padding:6px 10px 6px 8px;border-radius:10px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.12);border-left:5px solid var(--c,#fff);font-size:13px;font-weight:700;max-width:100%;transition:background .25s,color .25s,border-color .25s}
.gq-seat em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14ch}
.gq-seat u{display:none;text-decoration:none;flex:none;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);box-sizing:border-box;font-size:11px;line-height:13px;text-align:center;color:transparent}
.gq-seats.is-asking .gq-seat u{display:block}
.gq-seats.is-asking .gq-seat:not(.is-in) u{animation:gq-think 1.2s ease-in-out infinite}
.gq-seat.is-in{background:var(--c,#7ee787);border-color:var(--c,#7ee787);color:#14161f;animation:gq-pop .5s cubic-bezier(.2,1.6,.4,1)}
.gq-seat.is-in u{background:#14161f;border-color:#14161f;color:#fff;font-weight:900}
.gq-seat.is-me{box-shadow:0 0 0 2px #f5c542}
.gq-count{font-size:12px;color:rgba(255,255,255,.65)}
.gq-count.is-all{color:#7ee787;font-weight:700}
.gq-axis{position:relative;height:50px;margin:4px 10px 0}
.gq-axis::before{content:'';position:absolute;left:-10px;right:-10px;top:30px;height:3px;border-radius:2px;background:rgba(255,255,255,.3)}
.gq-dot{position:absolute;top:22px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:var(--c,#fff);border:2px solid rgba(10,12,20,.9);box-sizing:border-box;animation:gq-drop .55s cubic-bezier(.3,1.5,.5,1) backwards;animation-delay:calc(var(--i,0)*110ms)}
.gq-dot.is-me{width:22px;height:22px;margin-left:-11px;top:19px;border-color:#fff;z-index:2}
.gq-scan{position:absolute;top:2px;bottom:2px;width:4px;margin-left:-2px;border-radius:2px;background:#f5c542;box-shadow:0 0 14px #f5c542;z-index:3;animation:gq-scan .7s ease-in-out infinite alternate}
.gq-mark{position:absolute;top:0;bottom:2px;width:4px;margin-left:-2px;border-radius:2px;background:#f5c542;box-shadow:0 0 16px #f5c542;z-index:3;animation:gq-land .45s cubic-bezier(.2,1.8,.4,1)}
.gq-mark::after{content:'';position:absolute;left:50%;top:22px;width:26px;height:26px;margin:-5px 0 0 -13px;border-radius:50%;border:3px solid #f5c542;animation:gq-ring .9s ease-out both}
.gq-ends{display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-top:-2px}
.gq-answer{text-align:center;font:900 30px Inter,system-ui,sans-serif;color:#f5c542;line-height:1.1;animation:gq-zoom .6s cubic-bezier(.2,1.6,.4,1)}
.gq-answer small{font-size:15px;font-weight:700;color:rgba(255,255,255,.8)}
.gq-drum{text-align:center;font:900 30px Inter,system-ui,sans-serif;color:rgba(255,255,255,.85);line-height:1.1;animation:gq-shake .18s linear infinite}
.gq-reveal{display:flex;flex-direction:column;gap:6px}
.gq-reveal[data-stage=table] .gq-axis,.gq-reveal[data-stage=table] .gq-ends,.gq-reveal[data-stage=table] .gq-answer{display:none}
.gq-list li{animation:gq-slide .4s both;animation-delay:calc(var(--i,0)*90ms)}
.gq-list li.is-best{background:rgba(245,197,66,.2);box-shadow:inset 0 0 0 1px rgba(245,197,66,.6)}
.gq-board{position:relative}
.gq-brow{position:absolute;left:0;right:0;top:0;height:27px;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:0 8px;border-radius:7px;border-left:4px solid var(--c,#fff);background:rgba(255,255,255,.07);font-size:13.5px;transform:translateY(calc(var(--to)*31px));animation:gq-move .9s .8s cubic-bezier(.3,1.25,.5,1) backwards}
.gq-brow.is-me{background:rgba(245,197,66,.2);font-weight:800}
.gq-brow .n{min-width:1.5em;color:rgba(255,255,255,.6)}
.gq-brow .who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gq-brow .who small{color:rgba(255,255,255,.5);font-weight:500}
.gq-brow .d{font-size:11px;font-weight:900;animation:gq-slide .4s 1.7s both}
.gq-brow .d.up{color:#7ee787}.gq-brow .d.down{color:#ff7a7a}
.gq-brow .plus{font-size:11.5px;font-weight:800;color:#7ee787;animation:gq-plus 2.2s .2s both}
.gq-brow .p{min-width:5.4em;text-align:right;color:#f5c542;font-weight:800}
.gq-wait{display:inline-flex;gap:4px;margin-left:8px;vertical-align:middle}
.gq-wait i{width:7px;height:7px;border-radius:50%;background:#f5c542;animation:gq-bounce 1s ease-in-out infinite}
.gq-wait i:nth-child(2){animation-delay:.15s}.gq-wait i:nth-child(3){animation-delay:.3s}
.gq-confetti{position:fixed;left:50%;top:38%;width:0;height:0;z-index:60;pointer-events:none}
.gq-confetti i{position:absolute;width:9px;height:14px;border-radius:2px;background:var(--c);animation:gq-fly 1.9s cubic-bezier(.1,.7,.3,1) both;animation-delay:var(--d)}
.gq-podium{display:flex;align-items:flex-end;justify-content:center;gap:8px;height:150px;margin:4px 0 2px}
.gq-pod{flex:1;max-width:130px;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:13px;font-weight:800;text-align:center}
.gq-pod .who{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;animation:gq-slide .4s both;animation-delay:calc(var(--d) + .7s)}
.gq-pod .pts{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.7);animation:gq-slide .4s both;animation-delay:calc(var(--d) + .8s)}
.gq-pod .bar{width:100%;height:var(--h);border-radius:8px 8px 0 0;background:var(--c,#fff);color:#14161f;font:900 26px Inter,system-ui,sans-serif;display:flex;align-items:flex-start;justify-content:center;padding-top:6px;box-sizing:border-box;transform-origin:bottom;animation:gq-grow .8s cubic-bezier(.2,1.2,.4,1) both;animation-delay:var(--d)}
.gq-pod.is-me .bar{box-shadow:0 0 0 3px #f5c542}
@keyframes gq-beat{0%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes gq-zoom{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes gq-slide{0%{transform:translateX(-14px);opacity:0}100%{transform:none;opacity:1}}
@keyframes gq-wobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg) scale(1.08)}}
@keyframes gq-think{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes gq-pop{0%{transform:scale(.8)}60%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes gq-drop{0%{transform:translateY(-34px);opacity:0}100%{transform:none;opacity:1}}
@keyframes gq-scan{0%{left:2%}100%{left:98%}}
@keyframes gq-land{0%{transform:scaleY(2.2);opacity:.3}100%{transform:none;opacity:1}}
@keyframes gq-ring{0%{transform:scale(.3);opacity:1}100%{transform:scale(2.4);opacity:0}}
@keyframes gq-shake{0%,100%{transform:translateX(-1.5px)}50%{transform:translateX(1.5px)}}
@keyframes gq-move{0%{transform:translateY(calc(var(--from)*31px))}100%{transform:translateY(calc(var(--to)*31px))}}
@keyframes gq-plus{0%{opacity:0;transform:translateY(6px)}15%,70%{opacity:1;transform:none}100%{opacity:0}}
@keyframes gq-bounce{0%,100%{transform:none;opacity:.5}50%{transform:translateY(-5px);opacity:1}}
@keyframes gq-fly{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--x),var(--y)) rotate(var(--r));opacity:0}}
@keyframes gq-grow{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.gq *,.gq-podium *{animation:none!important}}
.gq-head{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.gq-rows{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px;font-size:13.5px}
.gq-rows li{display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:7px;border-left:3px solid var(--c,#fff)}
.gq-rows li.is-me{background:rgba(245,197,66,.14);font-weight:800}
.gq-rows .n{min-width:1.5em;color:rgba(255,255,255,.55)}
.gq-rows .who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gq-rows .who small{color:rgba(255,255,255,.5);font-weight:500}
.gq-rows .g{color:rgba(255,255,255,.85)}
.gq-rows .p{min-width:5.2em;text-align:right;color:#f5c542;font-weight:800}
.gq-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#f5c542;margin-left:6px}
.gq-table{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.14)}
.gq-table .gq-rows li{border-left-color:var(--c,#fff)}
.gq-verdict{margin:0;font-size:14px;line-height:1.35}
.gq-verdict b{color:#f5c542}
body.gq-seated .gta-prompt,body.gq-seated .touch-use,body.gq-seated .mission-prompt{display:none!important}
body.gq-seated #touch-controls{display:none!important}
@media (max-width:820px),(pointer:coarse){.gq{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 58px);max-height:calc(100vh - 66px);padding:10px 12px;gap:8px}.gq-question{font-size:18px}.gq-clock{width:40px;height:40px;font-size:19px}.gq-answer,.gq-drum{font-size:24px}.gq-line{font-size:13px}}
.gq.is-spare{backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(10,12,20,.93)}
@media (max-height:500px){.gq{top:calc(env(safe-area-inset-top,0px) + 4px);max-height:calc(100vh - 8px);z-index:46;gap:6px}.gq-gigi{display:none}.gq-question{font-size:15px}.gq-input{font-size:18px;padding:7px 10px}}
`;

// --- The umbrella bar ---------------------------------------------------------------------------------------------------
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  const count = g.attributes.position.count, c = new THREE.Color(col), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const cyl = (rt, rb, h, y, col, seg = 14, x = 0, z = 0) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return paint(g, col); };

const box = (w, h, d, x, y, z, col, ry = 0, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return paint(g, col); };
/** A rod from a to b ([x, y, z]) */
function rod(a, b, r, col) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return paint(g, col);
}
/** A barrel as a standing table with glasses, at (x, z) on the ground height y */
function barrel(parts, x, y, z, glasses = 3) {
  parts.push(cyl(0.34, 0.3, 1.02, y + 0.51, 0x7a4a26, 12, x, z), cyl(0.36, 0.36, 0.05, y + 0.3, 0x2c2c30, 12, x, z), cyl(0.36, 0.36, 0.05, y + 0.75, 0x2c2c30, 12, x, z), cyl(0.62, 0.62, 0.06, y + 1.06, 0x9b6a3a, 20, x, z));
  for (let i = 0; i < glasses; i++) {
    const a = (i / glasses) * Math.PI * 2 + 0.4 + x;
    parts.push(cyl(0.035, 0.03, 0.11, y + 1.145, i % 3 ? 0x5a3a22 : 0xe9e2d0, 8, x + Math.sin(a) * 0.4, z + Math.cos(a) * 0.4));
  }
}

/** The umbrella bar, at the table's place on the ground: the umbrella over the barrel table with the glasses on it, behind
 *  it the bar's hut with its sign, chains of lights from the umbrella's tip to four posts, pennants, a ski rack, a fire
 *  bowl, two more barrels, a bench and the loudspeaker. Everything stands on the ground where it is (the meadow slopes) */
function buildBar(run) {
  const t = QUIZ.table;
  const base = surfaceHeight(t.x, t.z);
  const gy = (x, z) => surfaceHeight(t.x + x, t.z + z) - base;
  const group = new THREE.Group();
  group.name = 'GigiBar';
  group.position.set(t.x, base, t.z);
  const parts = [], glow = [];
  barrel(parts, 0, 0, 0, 6);
  parts.push(
    cyl(0.04, 0.05, 3.1, 1.55, 0xd8d8dc, 8), // the umbrella's pole, through the table
    cyl(0.5, 0.7, 0.12, 0.06, 0x3a3a40, 12) // its foot
  );
  // the umbrella: eight panels, yellow and white by turns
  for (let i = 0; i < 8; i++) {
    const g = new THREE.ConeGeometry(2.5, 0.85, 1, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4);
    g.translate(0, 3.0, 0);
    parts.push(paint(g, i % 2 ? 0xf7f4ea : 0xf5c542));
  }
  parts.push(cyl(0.06, 0.02, 0.2, 3.5, 0xd8d8dc, 6));

  // the hut behind Gigi: the counter, the back wall with the bottles, the roof, the loudspeaker
  const hz = -4.6, hy = gy(0, hz);
  parts.push(
    box(3.4, 1.05, 0.7, 0, hy + 0.52, hz + 0.5, 0x6b4526), box(3.7, 0.07, 0.95, 0, hy + 1.09, hz + 0.5, 0xa9773f),
    box(3.4, 2.5, 0.12, 0, hy + 1.25, hz - 0.7, 0x5a3a20), box(0.12, 2.5, 1.5, -1.7, hy + 1.25, hz, 0x5a3a20), box(0.12, 2.5, 1.5, 1.7, hy + 1.25, hz, 0x5a3a20),
    box(4.1, 0.1, 2.4, 0, hy + 2.62, hz + 0.1, 0x3b2a1c, 0, 0.16), box(4.1, 0.14, 2.4, 0, hy + 2.72, hz + 0.1, 0xf4f6f8, 0, 0.16), // the roof, snow on it
    box(3.0, 0.05, 0.25, 0, hy + 1.75, hz - 0.5, 0xa9773f),
    box(0.42, 0.6, 0.36, 1.35, hy + 1.43, hz + 0.5, 0x18181c), cyl(0.13, 0.13, 0.02, hy + 1.5, 0x55555c, 12, 1.35, hz + 0.69)
  );
  for (let i = 0; i < 9; i++) parts.push(cyl(0.045, 0.055, 0.3, hy + 1.93, [0x2e7d4f, 0x8a4b1e, 0xd9d2c0, 0xb3261e][i % 4], 8, -1.2 + i * 0.3, hz - 0.5));
  for (let i = 0; i < 4; i++) parts.push(cyl(0.035, 0.03, 0.11, hy + 1.18, i % 2 ? 0x5a3a22 : 0xe9e2d0, 8, -1.1 + i * 0.5, hz + 0.55));

  // chains of lights from the umbrella's tip to four posts, pennants between the front posts
  const posts = [[-4.0, -3.0], [4.0, -3.0], [-4.2, 3.0], [4.2, 3.0]].map(([x, z]) => [x, gy(x, z), z]);
  const chain = (a, b, sag, bulbs) => {
    let prev = a;
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const k = i / n, pt = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
      parts.push(rod(prev, pt, 0.008, 0x1c1c20));
      if (bulbs && i < n) { const g = new THREE.SphereGeometry(0.055, 6, 5); g.translate(pt[0], pt[1] - 0.06, pt[2]); glow.push(paint(g, [0xffd27a, 0xffe9b8, 0xffb347][i % 3])); }
      prev = pt;
    }
  };
  for (const [x, y, z] of posts) {
    parts.push(cyl(0.045, 0.06, 3.0, y + 1.5, 0x4a3524, 6, x, z));
    chain([0, 3.55, 0], [x, y + 2.95, z], 0.35, true);
  }
  chain([posts[0][0], posts[0][1] + 2.95, posts[0][2]], [posts[1][0], posts[1][1] + 2.95, posts[1][2]], 0.3, true);
  for (const [a, b] of [[posts[0], posts[2]], [posts[1], posts[3]]]) {
    chain([a[0], a[1] + 2.95, a[2]], [b[0], b[1] + 2.95, b[2]], 0.3, false);
    for (let i = 1; i < 12; i++) { // (pennants: Graubünden's blue, white and yellow, a red one between)
      const k = i / 12;
      parts.push(box(0.02, 0.24, 0.2, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + 2.95 - 0.3 * 4 * k * (1 - k) - 0.14, a[2] + (b[2] - a[2]) * k, [0x1f6fd0, 0xf7f4ea, 0xf5c542, 0xd9261c][i % 4]));
    }
  }

  // the ski rack on the left: a rail on two posts, skis leaning on it
  const rx = -4.6, rz = -0.4, ry = gy(rx, rz);
  parts.push(cyl(0.04, 0.04, 1.2, ry + 0.6, 0x4a3524, 6, rx, rz - 1.1), cyl(0.04, 0.04, 1.2, ry + 0.6, 0x4a3524, 6, rx, rz + 1.1), box(0.06, 0.06, 2.4, rx, ry + 1.15, rz, 0x4a3524));
  for (let i = 0; i < 8; i++) parts.push(box(0.02, 1.75, 0.085, rx + 0.16, ry + 0.86, rz - 0.95 + i * 0.27 + (i % 2 ? -0.06 : 0), [0xd9261c, 0xd9261c, 0x1f6fd0, 0x1f6fd0, 0x2aa775, 0x2aa775, 0xf5c542, 0xf5c542][i], 0, 0));

  // the fire bowl on the right, a bench by it; two more barrels
  const fx = 3.5, fz = 0.9, fy = gy(fx, fz);
  parts.push(cyl(0.5, 0.3, 0.22, fy + 0.5, 0x26262a, 12, fx, fz));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; parts.push(rod([fx + Math.sin(a) * 0.42, fy, fz + Math.cos(a) * 0.42], [fx + Math.sin(a) * 0.25, fy + 0.45, fz + Math.cos(a) * 0.25], 0.025, 0x26262a)); }
  for (let i = 0; i < 4; i++) parts.push(box(0.09, 0.09, 0.6, fx, fy + 0.62, fz, 0x4a2c14, i * 0.8, 0.25));
  const bx = 5.0, by = gy(bx, fz);
  parts.push(box(0.4, 0.06, 1.7, bx, by + 0.46, fz, 0x9b6a3a), box(0.34, 0.44, 0.08, bx, by + 0.22, fz - 0.7, 0x6b4526), box(0.34, 0.44, 0.08, bx, by + 0.22, fz + 0.7, 0x6b4526));
  barrel(parts, -3.1, gy(-3.1, 1.9), 1.9, 3);
  barrel(parts, 3.2, gy(3.2, -2.3), -2.3, 2);

  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  // what shines by itself: the bulbs, the fire (it flickers: js after()). On the mobile profile they are drawn with the
  // bar's own material, one pipeline instead of two (what that saves on a phone is not measured): every vertex has
  // aGlow, 0 on the bar and 1 on the bulbs and the flames, and the material emits its vertex colour by it, so they shine
  // at night there too. The sign is left out there
  const shine = (g, v) => { if (QUALITY.mobile) g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; };
  if (QUALITY.mobile) mat.emissiveNode = vertexColor().mul(attribute('aGlow', 'float'));
  const mesh = new THREE.Mesh(shine(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), 0), mat);
  mesh.castShadow = true; mesh.receiveShadow = false;
  group.add(mesh);
  const lit = QUALITY.mobile ? mat : new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(shine(mergeGeometries(glow), 1), lit));
  const flames = [];
  for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(0.2 - i * 0.045, 0.6 - i * 0.1, 7); g.translate(0, 0.3 - i * 0.05, 0); flames.push(paint(g, [0xff6a1a, 0xff9d2e, 0xffd76a][i])); }
  const flame = new THREE.Mesh(shine(mergeGeometries(flames), 1), lit);
  flame.position.set(fx, fy + 0.62, fz);
  group.add(flame);
  group.userData.flame = flame;
  // the sign over the hut's roof
  if (!QUALITY.mobile) try {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 160;
    const c = canvas.getContext('2d');
    c.fillStyle = '#14161f'; c.fillRect(0, 0, 768, 160);
    c.strokeStyle = '#f5c542'; c.lineWidth = 10; c.strokeRect(5, 5, 758, 150);
    c.fillStyle = '#f5c542'; c.font = '900 92px Anton, Impact, "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('GIGI’S STAMMTISCH', 384, 86, 720);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshBasicNodeMaterial({ map: tex }));
    sign.position.set(0, hy + 3.2, hz + 1.25);
    group.add(sign);
    parts.length = 0;
    run.cleanups.push(() => tex.dispose());
  } catch (error) { console.warn('[quiz] sign', error); }
  run.group.add(group);
  return group;
}

/** Gigi and the regulars round the table (the side towards the start stays free for the player) */
function buildPeople(run) {
  const t = QUIZ.table;
  const ground = (_owner, x, z) => surfaceHeight(x, z);
  const spots = [
    { key: 'gigi', a: Math.PI, r: 1.25, look: { seed: 0.42, hair: 0.85, girth: 1.04 } },
    ...QUIZ_BOTS.map((b, i) => ({ key: b.id, a: Math.PI + [-0.95, 0.95, -1.9, 1.9][i], r: 1.3, look: { seed: (0.17 + i * 0.6180339) % 1, female: b.id === 'bot-seraina', hair: [0.05, 0.3, 0.9, 0.2][i], girth: [1.1, 1.14, 0.98, 1.02][i] } }))
  ].map((s) => {
    const x = t.x + Math.sin(s.a) * s.r, z = t.z + Math.cos(s.a) * s.r;
    return { ...s, x, z, yaw: Math.atan2(t.x - x, t.z - z) };
  });
  // (ski jackets: the instructors' red, blue, yellow, green; dark ski trousers)
  const crowd = new PersonCrowd(spots.length, { farDistance: 1e9, castShadow: false, dress: { casual: true, coat: [0xd9261c, 0x1f6fd0, 0xf2b01e, 0x2aa775], coatF: [0xd9261c, 0x8c5a7a, 0x1f6fd0, 0xf2b01e], legs: [0x1c1e26, 0x23252e], legsF: [0x1c1e26, 0x23252e] } });
  for (const m of crowd.meshes) run.group.add(m);
  const people = spots.map((s) => {
    const rig = new PersonRig({ scale: 1, ...s.look });
    rig.reset(s.x, s.z, s.yaw, ground);
    return { ...s, rig };
  });
  return { crowd, people, ground };
}
function posePeople(p, dt) {
  p.crowd.begin();
  for (const q of p.people) { q.rig.update(dt, q.x, q.z, q.yaw, p.ground); p.crowd.add(q.rig, 0); }
  p.crowd.end();
}

// --- The walker waits at the table -----------------------------------------------------------------------------------
function holdWalker(run, on) {
  const cm = run.hooks.controllerManager;
  const g = run._gq;
  if (on) {
    if (g.held) return;
    g.held = { had: 'personDriver' in cm, prev: cm.personDriver };
    document.body.classList.add('gq-seated');
    cm.personDriver = (dt, m) => { m.entities.person.speed = 0; };
  } else if (g.held) {
    const h = g.held;
    g.held = null;
    document.body.classList.remove('gq-seated');
    if (h.had) cm.personDriver = h.prev ?? null; else delete cm.personDriver;
    run.hooks.cameraSystem?.resetForTeleport?.(); // (the view was the table's: back behind the player)
  }
}
/** The view while the player is at the table: from behind them onto Gigi and the regulars, held clear of the card (at the
 *  bottom of a desk's screen: the table in the upper half; at the top of a phone's: in the lower) */
function tableView(run) {
  const cam = run.hooks.cameraSystem?.camera;
  if (!cam) return;
  const t = QUIZ.table, y = surfaceHeight(t.x, t.z);
  const cardOnTop = matchMedia('(max-width:820px),(pointer:coarse)').matches;
  cam.position.set(t.x + 1.3, y + 2.6, t.z + 7);
  cam.up.set(0, 1, 0);
  cam.lookAt(t.x, y + (cardOnTop ? 3.0 : -0.5), t.z);
  cam.updateMatrixWorld();
}

/** Small sounds on the city's mix (silent when the sound is off): a guess is in ('in'), the player's own is locked
 *  ('lock'), the last seconds ('tick'), the roll before the answer ('drum'), the answer, the best guess ('win') */
function blip(run, kind) {
  const a = run.hooks.audio;
  if (!a || !a.enabled || !a.context || a.context.state !== 'running' || !a.mix) return;
  const ctx = a.context, t0 = ctx.currentTime;
  const tone = (freq, at, len, level, type = 'sine') => {
    const gain = ctx.createGain();
    gain.connect(a.mix);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0 + at);
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(level, t0 + at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(gain); o.start(t0 + at); o.stop(t0 + at + len + 0.03);
  };
  if (kind === 'in') tone(520, 0, 0.1, 0.12);
  else if (kind === 'lock') { tone(660, 0, 0.09, 0.3); tone(990, 0.08, 0.14, 0.3); }
  else if (kind === 'tick') tone(1200, 0, 0.05, 0.14, 'square');
  else if (kind === 'drum') { for (let at = 0, gap = 0.16; at < (R_DRUM - R_IN) / 1000 - 0.1; at += gap, gap = Math.max(0.05, gap * 0.9)) tone(150, at, 0.07, 0.22, 'triangle'); }
  else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.28, 'triangle'));
  else { tone(660, 0, 0.12, 0.3, 'triangle'); tone(990, 0.1, 0.24, 0.3, 'triangle'); }
}

/** A burst of paper from the middle of the screen (the best guess, the round's winner) */
function confetti(run) {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const box = el('div', 'gq-confetti');
  const colours = ['#f5c542', '#3fd6ff', '#ff7eb6', '#7ee787', '#c3a6ff', '#fb923c'];
  for (let i = 0; i < 36; i++) {
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260;
    const p = el('i');
    p.style.cssText = `--c:${colours[i % colours.length]};--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d * 0.7 + 160).toFixed(0)}px;--r:${(Math.random() * 900 - 450).toFixed(0)}deg;--d:${(Math.random() * 0.15).toFixed(2)}s`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2300);
  run.cleanups.push(() => box.remove());
}
/** (a CSS animation of the class, played again) */
function kick(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

// --- A lone player's table ----------------------------------------------------------------------------------------------
function localTable() {
  const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const qids = pickQuestions(seed, seenQuestions());
  noteQuestions(qids);
  const me = { id: 'me', name: '' };
  const round = createRound({ seed, qids, startAt: Date.now(), seats: tableSeats([{ id: me.id, name: '', colour: ME_COLOUR }], { solo: true }), solo: true });
  return {
    me, round, solo: true,
    guess(qi, value) { const now = Date.now(); if (!lockGuess(round, me.id, qi, value, now)) return false; cutWaiting(round, now); return true; },
    sendGuesses() {}
  };
}

// --- The card -----------------------------------------------------------------------------------------------------------
function buildCard(run) {
  const style = el('style');
  style.textContent = STYLE;
  document.head.append(style);
  const card = el('div', 'gq player-name'); // (.player-name: translated here, not by the observer)
  card.classList.toggle('is-spare', QUALITY.mobile); // (no backdrop blur on the mobile profile: blurred anew over the 3D picture with every animation)
  card.hidden = true;
  card.setAttribute('role', 'group');
  const gigi = el('div', 'gq-gigi');
  const say = el('div', 'gq-say');
  const who = el('div', 'gq-who'), line = el('p', 'gq-line');
  say.append(who, line);
  gigi.append(el('div', 'gq-face', 'G'), say);
  const main = el('div', 'gq-main');
  const kicker = el('div', 'gq-kicker'), question = el('p', 'gq-question');
  main.append(kicker, question);
  const time = el('div', 'gq-time'), clock = el('div', 'gq-clock'), timer = el('div', 'gq-timer'), bar = el('i');
  timer.append(bar);
  time.append(clock, timer);
  const form = el('form', 'gq-form');
  form.noValidate = true;
  const input = el('input', 'gq-input');
  Object.assign(input, { type: 'text', inputMode: 'numeric', autocomplete: 'off', spellcheck: false, maxLength: 16, enterKeyHint: 'done' });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  const unit = el('span', 'gq-unit'), ok = el('button', 'gq-ok', 'OK');
  ok.type = 'submit';
  form.append(input, unit, ok);
  const mine = el('div', 'gq-mine');
  const reveal = el('div', 'gq-reveal');
  const axisBox = el('div', 'gq-axis'), dots = el('span'), mark = el('span'), ends = el('div', 'gq-ends'), big = el('div'), head = el('div', 'gq-head'), list = el('ol', 'gq-rows gq-list'), board = el('div', 'gq-board');
  axisBox.append(dots, mark);
  reveal.append(axisBox, ends, big, head, list, board);
  const seats = el('div', 'gq-seats'), count = el('div', 'gq-count');
  card.append(gigi, main, time, form, mine, reveal, seats, count);
  document.body.append(card);
  run.cleanups.push(() => { card.remove(); style.remove(); });
  return { card, who, line, main, kicker, question, time, clock, timer, bar, dots, mark, ends, big, head, list, board, seatNodes: new Map(), seatKey: '', form, input, unit, ok, mine, reveal, seats, count, shown: {} };
}
/** innerHTML / textContent set only when it changes (the card is re-rendered every frame) */
function put(ui, key, node, html, asText = false) {
  if (ui.shown[key] === html) return;
  ui.shown[key] = html;
  if (asText) node.textContent = html; else node.innerHTML = html;
}

/** The guesses and the answer on a line: where a value sits, 0..1 (log scale when the guesses are far apart) */
function axis(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  if (!(hi > lo)) return { at: () => 0.5, lo, hi };
  const log = lo > 0 && hi / lo > 12;
  const f = log ? Math.log : (v) => v;
  const a = f(lo), b = f(hi);
  return { at: (v) => 0.04 + 0.92 * ((f(v) - a) / (b - a)), lo, hi };
}

function seatName(table, seat) {
  if (seat.id === table.me.id) return seat.name || tr('You');
  return seat.name;
}

/** The seats as tiles, kept from frame to frame (a tile pops when its player's guess comes in); how many have guessed */
function syncSeats(ui, table, round, asking, qi, t) {
  const key = `${round.seed}|${getLanguage()}|${round.seats.map((seat) => `${seat.id}:${seatName(table, seat)}`).join('|')}`;
  if (ui.seatKey !== key) {
    ui.seatKey = key;
    ui.seatNodes = new Map();
    ui.seats.replaceChildren(...round.seats.map((seat) => {
      const node = el('span', `gq-seat${seat.id === table.me.id ? ' is-me' : ''}`);
      node.style.setProperty('--c', seat.colour || '#fff');
      node.append(el('em', null, seatName(table, seat)), el('u', null, '✓'));
      ui.seatNodes.set(seat.id, node);
      return node;
    }));
  }
  ui.seats.classList.toggle('is-asking', asking);
  let inCount = 0;
  for (const seat of round.seats) {
    const isIn = asking && hasGuessed(round, seat, qi, t);
    if (isIn) inCount++;
    const node = ui.seatNodes.get(seat.id);
    node.classList.toggle('is-in', isIn);
    const title = asking ? tr(isIn ? 'has guessed' : 'still thinking') : '';
    if (node.title !== title) node.title = title;
  }
  return inCount;
}

function render(run, now) {
  const g = run._gq, ui = g.ui, table = g.table, round = table.round;
  const lang = getLanguage();
  const num = (v, q) => formatNumber(v, lang, { year: !!q?.year });
  const p = roundPhase(round, now);
  const qi = p.q, q = round.questions[qi];
  const n = round.questions.length;
  const mySeat = round.seats.find((s) => s.id === table.me.id) || null;
  const myGuess = mySeat ? round.guesses.get(mySeat.id)[qi] : null;
  const since = QUIZ.revealMs - p.left; // (ms into the reveal)
  const stage = p.phase !== 'reveal' ? '' : since < R_IN ? 'in' : since < R_DRUM ? 'drum' : since < R_TABLE ? 'answer' : 'table';
  const rows = p.phase === 'reveal' ? questionResult(round, qi) : null;
  const mineRow = rows?.find((r) => r.id === table.me.id) || null;

  // Gigi
  put(ui, 'who', ui.who, `${esc(GIGI.name)} <span>· ${esc(tr(GIGI.role))}</span>`);
  let line = '';
  if (p.phase === 'lead') line = gigiLine('welcome', round.seed);
  else if (p.phase === 'ask' || p.phase === 'guess') line = GIGI.ask[Math.min(qi, GIGI.ask.length - 1)];
  else if (stage === 'in') line = 'The guesses are in …';
  else if (stage === 'drum') line = 'And the answer is …';
  else {
    const kind = !mineRow ? 'arosa' : mineRow.guess === null ? 'none' : mineRow.place === 1 ? 'best' : mineRow.place === rows.length ? 'worst' : 'mid';
    line = stage === 'answer' ? gigiLine(kind, round.seed, qi) : gigiLine('arosa', round.seed, qi);
  }
  put(ui, 'line', ui.line, tr(line), true);

  // the question (it jumps in when it is new)
  const asking = p.phase === 'ask' || p.phase === 'guess';
  if (p.phase === 'lead') {
    put(ui, 'kicker', ui.kicker, esc(tr('Gigi’s table')));
    put(ui, 'question', ui.question, tr('Three questions, one number each. Type your guess and press Enter.'), true);
  } else {
    const double = QUIZ.weights[qi] > 1 ? ` <b class="gq-x2">×2 · ${esc(tr('counts double'))}</b>` : '';
    put(ui, 'kicker', ui.kicker, `${esc(fill(tr('Question {n} of {m}'), { n: qi + 1, m: n }))}${double}`);
    put(ui, 'question', ui.question, tr(q.text), true);
  }
  const shownQ = `${round.seed}:${p.phase === 'lead' ? 'lead' : qi}`;
  if (g.shownQ !== shownQ) { g.shownQ = shownQ; kick(ui.main, 'is-new'); }

  // the time left: the clock counts the seconds down (the last three before the first question too), the bar runs out
  const counting = p.phase === 'guess' || (p.phase === 'lead' && p.left <= 3000);
  ui.time.hidden = !(asking || counting);
  if (asking || counting) {
    const k = p.phase === 'guess' ? Math.max(0, p.left / QUIZ.guessMs) : p.phase === 'ask' ? 1 - p.left / QUIZ.askMs : 0;
    ui.bar.style.transform = `scaleX(${k.toFixed(3)})`;
    ui.timer.style.visibility = p.phase === 'lead' ? 'hidden' : '';
    const late = p.phase === 'guess' && p.left < 5000;
    ui.time.classList.toggle('is-late', late);
    const secs = counting ? Math.max(1, Math.ceil(p.left / 1000)) : '';
    put(ui, 'clock', ui.clock, counting ? String(secs) : '…', true);
    const beat = `${shownQ}:${secs}`;
    if (g.beat !== beat) {
      g.beat = beat;
      if (late || p.phase === 'lead') { kick(ui.clock, 'is-beat'); if (p.phase === 'lead' || (mySeat && myGuess === null)) blip(run, 'tick'); }
    }
  }

  // the guess: the field, then what was locked in
  const canType = asking && !!mySeat && myGuess === null;
  ui.form.hidden = !canType;
  if (canType) {
    put(ui, 'unit', ui.unit, tr(q.unit || ''), true);
    if (ui.input.placeholder !== tr('Your guess')) ui.input.placeholder = tr('Your guess');
    const valid = parseGuess(ui.input.value) !== null;
    if (ui.ok.disabled === valid) ui.ok.disabled = !valid;
    if (g.focusFor !== `${round.seed}:${qi}`) { // (a new question: an empty field, the cursor in it on a desk)
      g.focusFor = `${round.seed}:${qi}`;
      ui.input.value = '';
      if (!isTouch()) { try { ui.input.focus({ preventScroll: true }); } catch { /* */ } }
    }
  } else if (document.activeElement === ui.input) ui.input.blur();
  const unitText = q?.unit ? ` ${esc(tr(q.unit))}` : '';
  let mine = '';
  if (p.phase !== 'lead' && mySeat) {
    if (myGuess !== null) mine = `${esc(tr('Your guess'))}: <b>${num(myGuess, q)}</b>${unitText}${asking ? ` <span>· ${esc(tr('locked in'))}</span><span class="gq-wait"><i></i><i></i><i></i></span>` : ''}`;
    else if (p.phase === 'reveal') mine = `<span>${esc(tr('No guess from you'))}</span>`;
  } else if (p.phase !== 'lead' && !mySeat) mine = `<span>${esc(tr('You are watching this round'))}</span>`;
  if (stage === 'table') mine = '';
  ui.mine.hidden = !mine;
  put(ui, 'mine', ui.mine, mine);

  // the seats: who has guessed
  const showSeats = p.phase !== 'reveal';
  ui.seats.hidden = !showSeats;
  ui.count.hidden = !asking;
  if (showSeats) {
    const inCount = syncSeats(ui, table, round, asking, qi, p.t);
    if (asking) {
      const all = inCount === round.seats.length;
      put(ui, 'count', ui.count, all ? tr('Everyone has guessed') : fill(tr('{n} of {m} have guessed'), { n: inCount, m: round.seats.length }), true);
      ui.count.classList.toggle('is-all', all);
      if (g.inCount !== `${qi}:${inCount}`) { if (g.inCount !== undefined && inCount > 0) blip(run, 'in'); g.inCount = `${qi}:${inCount}`; }
    }
  }

  // the reveal: the guesses drop onto the line, a roll, the answer and the points, then the table moves
  ui.reveal.hidden = p.phase !== 'reveal';
  if (p.phase === 'reveal') {
    const guesses = rows.filter((r) => r.guess !== null);
    const ax = axis([...guesses.map((r) => r.guess), q.answer]); // (the answer's place is in the scale from the start: the dots do not jump)
    const key = `${round.seed}:${qi}`;
    if (ui.reveal.dataset.stage !== stage) ui.reveal.dataset.stage = stage;
    put(ui, 'dots', ui.dots, `<!--${key}-->${guesses.map((r, i) => `<span class="gq-dot${r.id === table.me.id ? ' is-me' : ''}" style="left:${(ax.at(r.guess) * 100).toFixed(2)}%;--c:${esc(r.colour)};--i:${i}"></span>`).join('')}`);
    const shown = stage === 'answer' || stage === 'table';
    put(ui, 'mark', ui.mark, stage === 'drum' ? `<!--${key}--><span class="gq-scan"></span>` : shown ? `<!--${key}--><span class="gq-mark" style="left:${(ax.at(q.answer) * 100).toFixed(2)}%"></span>` : '');
    put(ui, 'ends', ui.ends, shown ? `<span>${num(ax.lo, q)}</span><span>${num(ax.hi, q)}</span>` : '<span>&nbsp;</span>');
    put(ui, 'big', ui.big, stage === 'drum' ? '<div class="gq-drum">? ? ?</div>' : stage === 'answer' ? `<!--${key}--><div class="gq-answer">${num(q.answer, q)}<small>${unitText}</small></div>` : '');
    ui.head.hidden = !shown;
    put(ui, 'head', ui.head, stage === 'table' ? fill(tr('The table after question {n}'), { n: qi + 1 }) : tr('The answer'), true);
    ui.list.hidden = stage !== 'answer';
    ui.board.hidden = stage !== 'table';
    if (stage === 'answer') {
      put(ui, 'list', ui.list, `<!--${key}-->${rows.map((r, i) => `<li class="${r.id === table.me.id ? 'is-me' : ''}${r.place === 1 && r.guess !== null ? ' is-best' : ''}" style="--c:${esc(r.colour)};--i:${i}"><span class="n">${r.place}.</span><span class="who">${esc(seatName(table, r))}</span><span class="g">${r.guess === null ? esc(tr('no guess')) : num(r.guess, q)}</span><span class="p">+${num(r.points)}</span></li>`).join('')}`);
    } else if (stage === 'table') {
      // the standing: every row starts where it stood before this question and slides to its new place, the points count up
      const before = tableStandings(round, qi), after = tableStandings(round, qi + 1);
      const was = new Map(before.map((r, i) => [r.id, { i, place: r.place, points: r.points }]));
      put(ui, 'board', ui.board, `<!--${key}-->${after.map((r, i) => {
        const w = was.get(r.id) || { i, place: r.place, points: 0 };
        const moved = qi > 0 ? w.place - r.place : 0;
        const delta = moved > 0 ? `<span class="d up">▲${moved}</span>` : moved < 0 ? `<span class="d down">▼${-moved}</span>` : '';
        const plus = r.points > w.points ? `<span class="plus">+${num(r.points - w.points)}</span>` : '';
        return `<div class="gq-brow${r.id === table.me.id ? ' is-me' : ''}" style="--c:${esc(r.colour)};--from:${w.i};--to:${i}"><span class="n">${r.place}.</span><span class="who">${esc(seatName(table, r))}${r.role ? ` <small>${esc(tr(r.role))}</small>` : ''}</span>${delta}${plus}<span class="p"><span class="gq-cnt" data-a="${w.points}" data-b="${r.points}">${num(w.points)}</span> ${esc(tr('pts'))}</span></div>`;
      }).join('')}`);
      const height = `${after.length * 31 - 4}px`;
      if (ui.board.style.height !== height) ui.board.style.height = height;
      const k = Math.min(1, Math.max(0, (since - R_TABLE - 700) / 1200)), ease = 1 - (1 - k) ** 3;
      for (const c of ui.board.querySelectorAll('.gq-cnt')) {
        const a = Number(c.dataset.a), b = Number(c.dataset.b), text = num(Math.round(a + (b - a) * ease));
        if (c.textContent !== text) c.textContent = text;
      }
    }
    if (g.stage !== `${qi}:${stage}`) {
      g.stage = `${qi}:${stage}`;
      if (stage === 'drum') blip(run, 'drum');
      else if (stage === 'answer') {
        const best = !!mineRow && mineRow.guess !== null && mineRow.place === 1;
        blip(run, best ? 'win' : 'answer');
        if (best) confetti(run);
      }
    }
  }
  return p;
}

/** The table's standing and Gigi's last word in the run's end dialog; at a table with other players its buttons too */
function decorateEnd(run) {
  const g = run._gq, table = g.table;
  const panel = run.ui.overlay?.querySelector('.mission-dialog');
  const row = panel?.querySelector('.mission-dialog-buttons');
  if (!panel || !row || !table) return;
  const rows = tableStandings(table.round);
  const mine = rows.find((r) => r.id === table.me.id);
  const last = rows[rows.length - 1];
  const box = el('div', 'gq-table');
  const verdict = el('p', 'gq-verdict');
  const kind = !mine ? 'placed' : mine.place === 1 ? 'won' : mine.id === last.id ? 'pays' : 'placed';
  verdict.append(el('b', null, `${GIGI.name}: `), el('span', null, gigiLine(kind, table.round.seed)));
  const list = el('ol', 'gq-rows');
  for (const r of rows) {
    const li = el('li', r.id === table.me.id ? 'is-me' : '');
    li.style.setProperty('--c', r.colour || '#fff');
    const who = el('span', 'who');
    if (r.id === table.me.id && !r.name) who.append(el('span', null, 'You'));
    else who.append(el('span', 'player-name', r.name));
    if (r.id === last.id) who.append(el('span', 'gq-tag', 'pays the round'));
    li.append(el('span', 'n', `${r.place}.`), who, el('span', 'p', `${r.points} pts`));
    list.append(li);
  }
  // the podium: third, second, first rise one after the other
  const podium = el('div', 'gq-podium');
  for (const [place, h, d] of [[2, 84, 0.7], [1, 112, 1.4], [3, 60, 0.1]]) {
    const r = rows[place - 1];
    if (!r) continue;
    const pod = el('div', `gq-pod${r.id === table.me.id ? ' is-me' : ''}`);
    pod.style.cssText = `--c:${r.colour || '#fff'};--h:${h}px;--d:${d}s`;
    const who = r.id === table.me.id && !r.name ? el('span', 'who', 'You') : el('span', 'who player-name', r.name);
    pod.append(who, el('span', 'pts', `${r.points} pts`), el('div', 'bar', String(place)));
    podium.append(pod);
  }
  box.append(el('h3', 'mission-board-title', 'The table'), podium, list, verdict);
  if (mine?.place === 1) { confetti(run); blip(run, 'win'); }
  panel.insertBefore(box, row);
  if (table.solo) return;
  // (with other players: the host starts the next round for everyone, no restart of one's own)
  const note = el('p', 'mission-dialog-note');
  box.append(note);
  const renderButtons = () => {
    if (!row.isConnected) return;
    row.replaceChildren();
    const button = (label, onClick, secondary = false) => { const b = el('button', `mission-btn${secondary ? ' mission-btn-secondary' : ''}`, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
    if (table.isHost) row.append(button('Another round', () => table.start()));
    row.append(button('Leave the table', () => run.hooks.missions?.stop(), true));
    note.textContent = table.isHost ? '' : 'The host starts the next round.';
    note.hidden = table.isHost;
  };
  renderButtons();
  g.offMembers?.();
  g.offMembers = table.on((what) => { if (what === 'members') renderButtons(); });
}

const QUIZ_FEATURE = {
  setup(run) {
    const session = quizHandoff.table; // (a table with other players: js/quiz-session.js started this run)
    quizHandoff.table = null;
    const g = run._gq = { session, table: session, ui: buildCard(run), held: null, scored: null, decorated: false };
    try { g.bar = buildBar(run); g.people = buildPeople(run); } catch (error) { console.warn('[quiz] the umbrella bar could not be built', error); }
    const submit = (e) => {
      e?.preventDefault();
      const t = g.table;
      if (!t) return;
      const value = parseGuess(g.ui.input.value);
      if (value === null) { g.ui.input.focus(); return; }
      const p = roundPhase(t.round, Date.now());
      if (t.guess(p.q, value)) { g.ui.input.value = ''; g.ui.input.blur(); blip(run, 'lock'); }
    };
    run.listen(g.ui.form, 'submit', submit);
    // (the field takes numbers and their separators only; the game's keys never see what is typed in it)
    run.listen(g.ui.input, 'input', () => { const v = g.ui.input.value.replace(/[^\d\s'’.,]/g, ''); if (v !== g.ui.input.value) g.ui.input.value = v; });
    run.listen(g.ui.input, 'keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') g.ui.input.blur(); });
    run.listen(window, 'languagechange', () => { g.ui.shown = {}; });
    run.actions([[['0–9'], 'your guess'], [['Enter'], 'lock it in']].map(([kbd, label]) => ({ kind: 'hint', kbd, label, when: () => !!g.held })));
    run.cleanups.push(() => { holdWalker(run, false); g.offMembers?.(); });
  },
  reset(run) {
    const g = run._gq;
    holdWalker(run, false);
    g.table = g.session || null; // (a lone player's table is laid anew when they step up)
    g.decorated = false;
    g.sent = null;
    g.ui.shown = {};
    g.ui.card.hidden = true;
    if (g.session) {
      run.state.seated = true;
      // (a restart after the round was scored: nothing to win until the host starts the next)
      if (g.scored === g.session.round?.seed) run.state.game = { done: false, progress: 1, text: 'The host starts the next round.', score: 0, idle: true };
    }
  },
  teardown(run) {
    const g = run._gq;
    holdWalker(run, false);
    g.offMembers?.();
    g.session?.detach(run);
  },
  ownControls: (run) => !!run._gq?.held,
  key(run, e) {
    const g = run._gq;
    if (!g?.held) return;
    // (at the table: a digit goes into the field, the walker's keys do nothing)
    if (/^(Digit|Numpad)\d$/.test(e.code) && !g.ui.form.hidden) { g.ui.input.focus(); return; }
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
  },
  after(run, ctx, dt) {
    const g = run._gq;
    if (!g) return;
    if (g.bar?.userData.flame) { const f = g.bar.userData.flame, w = performance.now() / 1000; f.scale.set(1 + Math.sin(w * 13) * 0.12, 1 + Math.sin(w * 9.1) * 0.18 + Math.sin(w * 23) * 0.08, 1 + Math.cos(w * 11) * 0.12); }
    if (g.people) { try { posePeople(g.people, dt); } catch (error) { console.warn('[quiz] people', error); g.people = null; } }
    const live = run.phase === 'ready' || run.phase === 'running';
    if (run.phase === 'done') {
      g.ui.card.hidden = true;
      holdWalker(run, false);
      if (!g.decorated) { g.decorated = true; try { decorateEnd(run); } catch (error) { console.warn('[quiz] end', error); } }
      return;
    }
    if (!live || run.state.game?.idle) { g.ui.card.hidden = true; return; }
    // the player steps up: a lone player's table is laid; with other players the round is running already
    if (!g.table) {
      if (run.index < 1) { g.ui.card.hidden = true; return; }
      g.table = localTable();
    }
    if (!g.held) {
      holdWalker(run, true);
      if (g.session) { // (everyone is set down at the start: over to the table's free side)
        const t = QUIZ.table;
        run.hooks.teleportXZ?.(t.x + 0.5, t.z + 1.9, Math.atan2(-0.5, -1.9));
        run.lastPos?.copy(run.hooks.controllerManager.getActiveEntity().position);
      }
    }
    const table = g.table, round = table.round, now = Date.now();
    tableView(run);
    g.ui.card.hidden = false;
    const p = render(run, now);
    // (the guessing time is up: this player's guesses once more, should a message have been lost)
    if (p.phase === 'reveal' && g.sent !== `${round.seed}:${p.q}`) { g.sent = `${round.seed}:${p.q}`; table.sendGuesses(); }
    const rows = tableStandings(round, p.phase === 'done' ? round.questions.length : p.phase === 'reveal' && QUIZ.revealMs - p.left >= R_DRUM ? p.q + 1 : p.q);
    const mine = rows.find((r) => r.id === table.me.id);
    const done = p.phase === 'done';
    const n = round.questions.length;
    run.state.game = {
      done, score: mine?.points ?? 0, place: mine?.place ?? rows.length, seats: rows.length, pays: !!mine && mine.id === rows[rows.length - 1].id,
      progress: done ? 1 : (p.q + (p.phase === 'reveal' ? 1 : p.phase === 'guess' ? 0.5 : 0)) / n,
      text: p.phase === 'lead' ? 'Gigi takes a sip' : `Question ${Math.min(p.q + 1, n)} of ${n}`,
      hint: (p.phase === 'ask' || p.phase === 'guess') && mine && round.guesses.get(table.me.id)[p.q] === null ? 'Type a number and press Enter' : null
    };
    if (done) g.scored = round.seed;
  }
};

export const QUIZ_FEATURES = { quiz: QUIZ_FEATURE };
