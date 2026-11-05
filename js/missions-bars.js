import * as THREE from 'three/webgpu';
import { rollHairstyle } from './pedestrians.js';
import { t, setLocalizedText } from './i18n.js';
import { raiseArm } from './missions-fun.js';
import { el, clamp, live, swallow, gameKey, addStyle, paint, box, cyl, solid, meshOf, textPlane, glow, makeCrowd, poseCrowd, Room, blip, flashPop } from './missions-gastro.js';
import {
  NAGELN, NAGELN_RIVALS, NAGELN_LINEUPS, createNageln, nagelnStep, nagelnPress, nagelnGauge, nagelnScore,
  BARISTA, DRINKS, RUSH, REGULARS, TABLE_FOLK, STATIONS, STATION_INFO, drinkById, createBarista, baristaStep, baristaAction, baristaPick, baristaGauge, baristaScore
} from './missions-data-bars.js';

// js/missions-bars.js
// The runtime of the two bar missions (js/missions-data-bars.js has their definitions and the games' pure logic):
// js/missions.js merges BARS_FEATURES into its features. The rooms float above their doors like js/missions-gastro.js's
// (its Room, geometry helpers, crowd, sounds and HUD style are reused here), with one merged geometry per room.
//  - nageln: the Tijuana Bar's stump in the middle of the view, the nails standing out of it at their real depth, one
//    hammer going to whoever's turn it is, the gauge and one button in the HUD.
//  - barista: the Kaffeeklatsch from behind the counter, a queue of people who really walk up and leave, one button for
//    each station, the regulars gossiping at their tables.
// The speech bubbles are a few DOM nodes pinned over people's heads. Everything is built on entry and disposed with the run.

const setLoc = (node, s) => { if (node._src !== s) { node._src = s; setLocalizedText(node, s); } };

const STYLE = `
.br-bubble{position:fixed;left:0;top:0;z-index:38;max-width:min(240px,46vw);padding:6px 10px;border-radius:12px;background:#fffdf5;color:#221a10;font:600 12.5px/1.25 Inter,system-ui,sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.4);pointer-events:none;will-change:transform}
.br-bubble[hidden]{display:none!important}
.br-bubble b{display:block;font-size:10.5px;font-weight:800;color:#a2482c}
.br-chips{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:5px}
.br-row{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;width:min(560px,calc(100vw - 12px))}
.br-row[hidden],.br-temp[hidden]{display:none!important}
.br-row.picks{grid-template-columns:repeat(3,1fr)}
.br-row .gs-top{font-size:12px;justify-content:center}
.br-row .gs-top.on{background:#e8913a;border-color:#ffd9a8;color:#201000;box-shadow:0 0 14px rgba(232,145,58,.7)}
.br-row .gs-top:disabled{opacity:.38}
.br-tickets{display:flex;gap:5px;justify-content:center;margin-top:5px;flex-wrap:wrap}
.br-ticket{flex:0 1 auto;min-width:64px;padding:3px 7px 4px;border-radius:8px;background:rgba(255,255,255,.12);font-size:11.5px;font-weight:700}
.br-ticket.front{background:#ffe14f;color:#201a00}
.br-ticket i{display:block;height:4px;margin-top:3px;border-radius:2px;background:#3fbf6b;transform-origin:left}
.br-temp{font:800 15px Inter,system-ui,sans-serif;margin-top:4px}
@media (max-width:520px){.br-row .gs-top{font-size:11px;min-height:46px}.br-bubble{font-size:11.5px}}
`;
function addBarsStyle(run) {
  addStyle(run);
  const s = el('style');
  s.textContent = STYLE;
  document.head.append(s);
  run.cleanups.push(() => s.remove());
}

// --- Speech bubbles over people's heads ------------------------------------------------------------------------------
const _v = new THREE.Vector3();
class Bubbles {
  constructor(run, count = 3) {
    this.items = Array.from({ length: count }, () => {
      const node = el('div', 'br-bubble'), name = el('b'), text = el('span');
      node.append(name, text);
      node.hidden = true;
      document.body.append(node);
      run.cleanups.push(() => node.remove());
      return { node, name, text, person: null, left: 0 };
    });
  }
  clear() { for (const b of this.items) { b.person = null; b.left = 0; b.node.hidden = true; } }
  say(person, who, text, ttl = 3.4) {
    // the person's own bubble if they have one, else the free one, else the one nearest its end
    const free = this.items.find((b) => b.person === person) || this.items.find((b) => !b.person) || this.items.reduce((a, b) => (b.left < a.left ? b : a));
    free.person = person; free.left = ttl;
    setLoc(free.name, who);
    setLoc(free.text, text);
    free.node.hidden = false;
  }
  /** Pins each bubble over its person's head (`origin`: the room's origin) */
  update(dt, camera, origin) {
    const W = window.innerWidth, H = window.innerHeight, top = H > W ? 122 : 64;
    // (the mission panel stays readable: a bubble that would cover it goes below it)
    const panel = this.items.some((b) => b.person) ? document.querySelector('.panel.mission')?.getBoundingClientRect() : null;
    for (const b of this.items) {
      if (!b.person) continue;
      b.left -= dt;
      if (b.left <= 0) { b.person = null; b.node.hidden = true; continue; }
      _v.set(origin.x + b.person.x, origin.y + 1.86, origin.z + b.person.z).project(camera);
      if (_v.z > 1) { b.node.style.visibility = 'hidden'; continue; }
      b.node.style.visibility = '';
      const bw = b.node.offsetWidth, bh = b.node.offsetHeight;
      const x = clamp((_v.x + 1) * 0.5 * W - bw / 2, 6, W - bw - 6);
      let y = clamp((1 - _v.y) * 0.5 * H - bh - 4, top, H - bh - 6);
      if (panel && x < panel.right && x + bw > panel.left && y < panel.bottom) y = panel.bottom + 6;
      b.node.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  }
}
/** Hands the game's new chat lines to `say(line)`, oldest first */
function drainChat(g, st, say) {
  if (g.chatSeq === st.chatSeen) return;
  for (const c of g.chats) if (c.seq > st.chatSeen) say(c);
  st.chatSeen = g.chatSeq;
}
/** A person walks towards (tx, tz) at a stroll, and turns to `face` when there */
function stroll(p, tx, tz, dt, face, speed = 1.5) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.03) { p.x = tx; p.z = tz; p.yaw = face; return; }
  const step = Math.min(d, speed * dt);
  p.x += (dx / d) * step; p.z += (dz / d) * step;
  p.yaw = Math.atan2(dx, dz);
}
const lookOf = (hairRoll, female) => ({ ...rollHairstyle(hairRoll, female) });

// =====================================================================================================================
// 1. Nageln in the Tijuana Bar
// =====================================================================================================================
const STUMP_TOP = 0.82, NAIL_CM = 0.035, NAIL_R = 0.27, RIG_R = 0.98; // (a cm of nail is drawn this long: 5 cm must read at a metre)
const STRIKE_ANGLE = -0.385, RAISED_ANGLE = 1.13;
const lerp = (a, b, k) => a + (b - a) * k;
/** The angle round the stump (0: towards the camera) of a player: you at 0, the others spread over the far side */
const stumpAngle = (i, n) => (i === 0 ? 0 : lerp(1.45, 4.83, n > 2 ? (i - 1) / (n - 2) : 0.5));

function buildTijuana(group, parts) {
  const W = 8, D = 7, H = 2.9, hw = W / 2, hd = D / 2;
  const WALL = 0x8a3b24, DARK = 0x241510, WOOD = 0x4a2a18;
  const room = [
    box(W, 0.1, D, 0, -0.05, 0, 0x2b1a12),
    box(W, H, 0.2, 0, H / 2, -hd - 0.1, WALL), box(W, H, 0.2, 0, H / 2, hd + 0.1, WALL),
    box(0.2, H, D, -hw - 0.1, H / 2, 0, 0x246b6b), box(0.2, H, D, hw + 0.1, H / 2, 0, 0x246b6b),
    box(W, 0.2, D, 0, H + 0.1, 0, 0x120a07),
    // the painted band along the walls, the posters
    box(W, 0.14, 0.02, 0, 1.0, -hd + 0.01, 0xe2b13c), box(W, 0.07, 0.02, 0, 0.84, -hd + 0.01, 0x246b6b),
    box(0.02, 0.14, D, -hw + 0.01, 1.0, 0, 0xe2b13c), box(0.02, 0.14, D, hw - 0.01, 1.0, 0, 0xe2b13c),
    box(0.03, 0.86, 0.6, -hw + 0.02, 1.8, -1.4, 0x1c1c22), box(0.03, 0.66, 0.5, -hw + 0.02, 1.75, 0.2, 0xd9a22b),
    box(0.03, 0.8, 0.56, hw - 0.02, 1.8, -1.5, 0xa61c2c), box(0.03, 0.64, 0.5, hw - 0.02, 1.75, 0.3, 0x18181c),
    // the bar along the back wall, its top, the back bar with shelves
    box(5.6, 1.04, 0.62, -0.4, 0.52, -2.35, WOOD), box(5.7, 0.05, 0.74, -0.4, 1.06, -2.35, 0x6a4128),
    box(5.6, 2.2, 0.2, -0.4, 1.1, -hd + 0.14, DARK), box(5.4, 0.03, 0.22, -0.4, 1.3, -hd + 0.3, 0x7a5230), box(5.4, 0.03, 0.22, -0.4, 1.72, -hd + 0.3, 0x7a5230),
    // the stump: bark, its pale cut top with the rings, roots
    cyl(0.5, 0.56, STUMP_TOP, 0, STUMP_TOP / 2, 0, 0x4d3420, 16), cyl(0.495, 0.495, 0.012, 0, STUMP_TOP, 0, 0xb48d5e, 18), cyl(0.36, 0.36, 0.012, 0, STUMP_TOP + 0.002, 0, 0xa37d50, 16), cyl(0.2, 0.2, 0.012, 0, STUMP_TOP + 0.004, 0, 0xb48d5e, 14),
    box(0.3, 0.07, 0.14, 0.56, 0.035, 0.15, 0x4d3420), box(0.14, 0.07, 0.3, -0.2, 0.035, 0.58, 0x4d3420), box(0.3, 0.07, 0.14, -0.55, 0.035, -0.25, 0x4d3420),
    // the beer on the stump's rim, a high table
    cyl(0.038, 0.034, 0.13, 0.33, STUMP_TOP + 0.07, 0.3, 0xe0a428, 10), cyl(0.04, 0.04, 0.025, 0.33, STUMP_TOP + 0.14, 0.3, 0xfdf6e0, 10),
    cyl(0.38, 0.38, 0.04, 2.75, 1.05, -0.9, 0x6a4128, 14), cyl(0.05, 0.05, 1.05, 2.75, 0.52, -0.9, 0x201410, 8), cyl(0.2, 0.26, 0.03, 2.75, 0.015, -0.9, 0x201410, 10)
  ];
  // the old nails in the stump's top, and bottles
  for (let i = 0; i < 26; i++) { const a = i * 2.399963, r = 0.08 + 0.4 * Math.sqrt(i / 26); room.push(cyl(0.012, 0.012, 0.008, Math.sin(a) * r, STUMP_TOP + 0.01, Math.cos(a) * r, 0x3a3a40, 6)); }
  const bottleCols = [0x2e6b2a, 0x7a3b12, 0xd8c47a, 0x3a1a0a, 0xa8d0e0, 0x5a1020];
  for (let i = 0; i < 28; i++) { const shelf = i % 2, x = -2.9 + (i >> 1) * 0.36; room.push(cyl(0.035, 0.045, 0.27, x, 1.44 + shelf * 0.42, -hd + 0.3, bottleCols[i % 6], 6)); }
  group.add(solid(room));
  // the neon over the bar and the lamp over the stump
  const sign = textPlane('TIJUANA BAR', 2.8, 0.42, { bg: '#120808', fg: '#ffb12b' });
  sign.position.set(-0.4, 2.42, -hd + 0.26);
  group.add(sign);
  const rock = textPlane('ROCK’N’ROLL', 1.5, 0.3, { bg: '#1a1a22', fg: '#ff4a5e' });
  rock.position.set(2.9, 2.3, -hd + 0.04);
  group.add(rock);
  group.add(solid([cyl(0.14, 0.2, 0.12, 0, 2.2, 0, 0x201410, 12), box(0.015, 0.6, 0.015, 0, 2.55, 0, 0x111111)]));
  const halo = glow(2.4, 2.4, 0xffb868, 0.2);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, STUMP_TOP + 0.02, 0);
  group.add(halo);
  const barGlow = glow(3.6, 1.1, 0xff9a30, 0.16);
  barGlow.position.set(-0.4, 2.4, -hd + 0.3);
  group.add(barGlow);
  // the nails: one geometry; yours has a gold head
  const nailGeo = paint(new THREE.CylinderGeometry(0.0075, 0.004, 0.28, 7).translate(0, -0.14, 0), 0xffffff);
  const headGeo = paint(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 10), 0xffffff);
  const nailMat = new THREE.MeshBasicNodeMaterial({ color: 0xb6bcc4, vertexColors: true });
  const goldMat = new THREE.MeshBasicNodeMaterial({ color: 0xffcf40, vertexColors: true });
  parts.nails = Array.from({ length: 5 }, (_, i) => {
    const nail = new THREE.Group();
    nail.add(meshOf(nailGeo, nailMat), meshOf(headGeo, i === 0 ? goldMat : nailMat));
    group.add(nail);
    return nail;
  });
  // the hammer: a handle along +x from the hand, the head with its narrow wedge pointing down (local -y)
  const hammer = solid([
    box(0.36, 0.022, 0.022, 0.18, 0, 0, 0x9b7342),
    box(0.04, 0.09, 0.04, 0.36, 0.022, 0, 0x8d939b),
    paint(new THREE.ConeGeometry(0.03, 0.06, 4).rotateX(Math.PI).rotateY(Math.PI / 4).translate(0.36, -0.052, 0), 0xb7bdc5)
  ]);
  hammer.rotation.order = 'YZX';
  hammer.visible = false;
  group.add(hammer);
  parts.hammer = hammer;
}

const BYSTANDERS = [
  { x: -3.0, z: -1.5, yaw: 1.0, female: false, hairRoll: 0.2 },
  { x: 2.45, z: -0.45, yaw: -2.5, female: true, hairRoll: 0.01 },
  { x: 3.0, z: -1.45, yaw: -0.5, female: true, hairRoll: 0.4 }
];
const RIVAL_IDS = Object.keys(NAGELN_RIVALS);
// (the rivals not at the stump this game lean on the bar)
const BENCH = [{ x: -2.0, z: -1.6 }, { x: -1.0, z: -1.6 }, { x: 0.4, z: -1.6 }, { x: 1.4, z: -1.6 }];

const nageln = {
  // (js/missions.js hides the game's own controls while this is true: inside the bar; the walk to the door keeps them)
  ownControls: (run) => !!run.ng?.room,
  setup(run) {
    addBarsStyle(run);
    const hud = el('div', 'gs-hud');
    hud.hidden = true;
    const pop = el('div', 'gs-pop');
    const card = el('div', 'gs-card');
    const line = el('div'), chips = el('div', 'br-chips'), label = el('div');
    const gauge = el('div', 'gs-gauge'), zone = el('span', 'gs-zone'), needle = el('span', 'gs-needle');
    gauge.append(zone, needle);
    card.append(line, chips, label, gauge);
    const act = el('button', 'gs-act', 'Aim');
    act.type = 'button';
    hud.append(pop, card, act);
    document.body.append(hud);
    run.cleanups.push(() => hud.remove());
    run.ng = { room: null, parts: null, crowd: null, rivals: {}, folk: [], bubbles: new Bubbles(run, 3), chatSeen: 0, seq: 0, swingSeq: 0, swingAge: 9, cheer: 0, cheerT: 0, gameShown: 0, chipKey: '', ui: { hud, pop, line, chips, label, gauge, zone, needle, act } };
    run.listen(act, 'pointerdown', (e) => { e.preventDefault(); nageln.press(run); });
  },
  reset(run) {
    const ng = run.ng;
    ng.room?.dispose(); ng.room = null;
    ng.ui.hud.hidden = true;
    ng.bubbles.clear();
    Object.assign(ng, { chatSeen: 0, seq: 0, swingSeq: 0, swingAge: 9, cheer: 0, cheerT: 0, gameShown: 0, chipKey: '' });
    if (run.state) { run.state.game = null; run.state.inside = false; }
  },
  teardown(run) { run.ng.room?.dispose(); run.ng.room = null; },
  key(run, e) {
    if (!run.ng.room || !gameKey(e.code)) return;
    swallow(e);
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) nageln.press(run);
  },
  press(run) {
    const g = run.state?.game;
    if (!g || !live(run)) return;
    if (nagelnPress(g)) blip(run, 'pock');
  },
  enter(run) {
    const ng = run.ng;
    const parts = ng.parts = {};
    ng.room = new Room(run, run.def.interior.door, (group) => {
      buildTijuana(group, parts);
      const spots = [
        ...RIVAL_IDS.map((id, i) => ({ id, name: NAGELN_RIVALS[id].name, x: BENCH[i].x, z: BENCH[i].z, yaw: Math.PI, female: NAGELN_RIVALS[id].female, look: lookOf(NAGELN_RIVALS[id].hairRoll, NAGELN_RIVALS[id].female) })),
        ...BYSTANDERS.map((b, i) => ({ id: `crowd${i}`, name: '', x: b.x, z: b.z, yaw: b.yaw, female: b.female, look: lookOf(b.hairRoll, b.female) }))
      ];
      ng.crowd = makeCrowd(spots, group);
    });
    ng.rivals = Object.fromEntries(ng.crowd.people.filter((p) => NAGELN_RIVALS[p.id]).map((p) => [p.id, p]));
    ng.folk = ng.crowd.people.filter((p) => !NAGELN_RIVALS[p.id]);
    run.state.game = createNageln(23);
    run.state.inside = true;
    ng.ui.hud.hidden = false;
  },
  update(run, ctx, dt) {
    const ng = run.ng;
    if (!ng.room && run.def.objectives[run.index]?.id === 'nageln' && live(run)) nageln.enter(run);
    const g = run.state?.game;
    if (!ng.room || !g) return;
    nagelnStep(g, dt);
    ng.swingAge += dt;
    ng.cheerT = Math.max(0, ng.cheerT - dt);
    if (g.swing && g.swing.seq !== ng.swingSeq) {
      ng.swingSeq = g.swing.seq;
      ng.swingAge = 0;
      blip(run, g.swing.kind === 'bent' || g.swing.kind === 'miss' ? 'bad' : 'pock');
    }
    if (g.cheer !== ng.cheer) { ng.cheer = g.cheer; ng.cheerT = 1.5; }
    if (g.last && g.last.seq !== ng.seq) { ng.seq = g.last.seq; flashPop(ng.ui.pop, g.last); if (g.last.good) blip(run, 'good'); }
    drainChat(g, ng, (c) => {
      const person = c.who === 'crowd' ? ng.folk[c.seq % ng.folk.length] : ng.rivals[c.who];
      if (person) ng.bubbles.say(person, person.name, c.text);
    });
  },
  after(run, ctx, dt) {
    const ng = run.ng;
    if (!live(run)) ng.ui.hud.hidden = true;
    if (!ng.room || run.phase === 'aborted') { ng.bubbles.clear(); return; }
    const g = run.state.game;
    if (!g) return;
    const portrait = window.innerHeight > window.innerWidth;
    ng.room.camera(ctx.camera, portrait ? { x: 0, y: 2.55, z: 3.0 } : { x: 0, y: 2.15, z: 2.45 }, { x: 0, y: portrait ? 0.62 : 0.92, z: -0.2 });
    // who stands where this game
    const lineup = NAGELN_LINEUPS[g.gameNo - 1], n = g.players.length;
    for (const id of RIVAL_IDS) {
      const i = lineup.indexOf(id), p = ng.rivals[id];
      if (i < 0) { const b = BENCH[RIVAL_IDS.indexOf(id)]; stroll(p, b.x, b.z, dt, Math.PI); continue; }
      const a = stumpAngle(i + 1, n), x = Math.sin(a) * RIG_R, z = Math.cos(a) * RIG_R;
      stroll(p, x, z, dt, Math.atan2(-x, -z));
    }
    const active = g.players[g.turn];
    const windup = g.step === 'windup' ? clamp(g.stepT / NAGELN.windup, 0, 1) : 0;
    poseCrowd(ng.crowd, dt, (p) => {
      if (NAGELN_RIVALS[p.id] && p.id === active?.id && (g.step === 'windup' || (g.step === 'after' && ng.swingAge < 0.5))) {
        const f = g.step === 'windup' ? lerp(0.6, 2.7, windup) : 1.15;
        raiseArm(p.rig, 1, f, 0.35, 0.12);
      } else if (ng.cheerT > 0) {
        const pump = 0.5 + 0.5 * Math.sin(ng.cheerT * 11 + p.x * 3);
        raiseArm(p.rig, 1, 2.4 + 0.4 * pump, 0.25, 0.25);
        if (!NAGELN_RIVALS[p.id]) raiseArm(p.rig, 0, 2.4 + 0.4 * (1 - pump), 0.25, 0.25);
      }
    });
    // the nails stand as far out as they are, a bent one leans
    ng.parts.nails.forEach((nail, i) => {
      const pl = g.players[i];
      nail.visible = !!pl;
      if (!pl) return;
      const a = stumpAngle(i, n);
      nail.position.set(Math.sin(a) * NAIL_R, STUMP_TOP + 0.012 + pl.left * NAIL_CM, Math.cos(a) * NAIL_R);
      nail.rotation.z = pl.bent ? 0.62 : 0;
      nail.rotation.y = -a;
    });
    nageln.poseHammer(ng, g, n);
    ng.bubbles.update(dt, ctx.camera, ng.room.origin);
    // the HUD
    const gauge = nagelnGauge(g), ui = ng.ui;
    setLoc(ui.line, `Game ${g.gameNo} of ${NAGELN.games} · round ${g.round} · ${g.wins} won · ${nagelnScore(g)} pts`);
    setLoc(ui.label, gauge.label);
    const key = `${g.gameNo}/${g.turn}/${g.players.map((p) => `${p.left.toFixed(1)}${p.bent ? 'b' : ''}`).join('/')}`;
    if (key !== ng.chipKey) {
      ng.chipKey = key;
      ui.chips.replaceChildren(...g.players.map((p, i) => el('span', `gs-chip${i === g.turn ? ' next' : ''}`, `${t(p.name)} ${p.left.toFixed(1)} cm${p.bent ? ' ⤴' : ''}`)));
    }
    ui.gauge.toggleAttribute('data-off', gauge.value === null);
    if (gauge.value !== null) {
      ui.zone.style.left = `${gauge.lo * 100}%`; ui.zone.style.width = `${(gauge.hi - gauge.lo) * 100}%`;
      ui.needle.style.left = `${gauge.value * 100}%`;
    }
    ui.act.disabled = !gauge.button;
    setLoc(ui.act, gauge.button || '…');
  },
  /** One hammer: over your nail while you aim and raise it, else in the hand of whoever's turn it is */
  poseHammer(ng, g, n) {
    const h = ng.parts.hammer, i = g.turn, pl = g.players[i];
    const shown = g.step === 'aim' || g.step === 'power' || g.step === 'windup' || ((g.step === 'after' || g.step === 'gameEnd') && g.swing && g.swing.who === pl.id);
    h.visible = !!shown && pl.id !== undefined;
    if (!h.visible) return;
    let raise = 0, lateral = 0;
    if (g.step === 'aim') { raise = 0.3; lateral = nagelnGauge(g).value - 0.5; }
    else if (g.step === 'power') { raise = 0.1 + 0.9 * nagelnGauge(g).value; lateral = g.aim - 0.5; }
    else if (g.step === 'windup') raise = clamp(g.stepT / NAGELN.windup, 0, 1);
    else { raise = Math.max(0, 1 - ng.swingAge / 0.09); lateral = (g.swing?.aim ?? 0.5) - 0.5; }
    const a = stumpAngle(i, n), ox = Math.sin(a), oz = Math.cos(a);
    const side = lateral * 0.24; // (a miss really lands next to the nail)
    const y = STUMP_TOP + 0.012 + pl.left * NAIL_CM;
    h.position.set(ox * (NAIL_R + 0.31) + oz * side, y + 0.21, oz * (NAIL_R + 0.31) - ox * side);
    h.rotation.set(0, Math.atan2(oz, -ox), lerp(STRIKE_ANGLE, RAISED_ANGLE, raise));
  }
};

// =====================================================================================================================
// 2. Barista at the Kafi Klatsch
// =====================================================================================================================
const COUNTER_TOP = 1.05, COUNTER_Z = 0.95;
const STATION_X = { grind: -1.5, tamp: -1.05, pull: -0.55, steam: 0.05, pour: 0.55, serve: 0.55 };
const SEATS_LOOK = [0.55, 0.92, 0.3, 0.7, 0.5, 0.15]; // (the walk-ins' hair)
const QUEUE_OUT = { x: 0.2, z: -4.0 }; // (out of the door, behind the back wall)
const queueSpot = (i) => ({ x: i * 0.28, z: 0.2 - i * 0.78 });

function buildKafi(group, parts) {
  const W = 8, H = 2.9, hw = W / 2, zBack = -3.5, zFront = 4.8, D = zFront - zBack;
  const WALL = 0xe6d5b8, WOOD = 0x6b4426, LIGHT = 0xa87a4a;
  const midZ = (zBack + zFront) / 2;
  const room = [
    box(W, 0.1, D, 0, -0.05, midZ, 0x7b5a3c),
    box(W, H, 0.2, 0, H / 2, zBack - 0.1, WALL), box(W, H, 0.2, 0, H / 2, zFront + 0.1, 0xcdb994),
    box(0.2, H, D, -hw - 0.1, H / 2, midZ, WALL), box(0.2, H, D, hw + 0.1, H / 2, midZ, WALL),
    box(W, 0.2, D, 0, H + 0.1, midZ, 0xf2ead9),
    box(W, 0.12, 0.03, 0, 0.9, zBack + 0.02, LIGHT),
    // the door in the back wall and the big windows on the Promenade, the sun coming in
    box(1.0, 2.1, 0.04, 0.2, 1.05, zBack + 0.03, 0x4a2d1d), box(0.62, 1.0, 0.02, 0.2, 1.45, zBack + 0.06, 0xbfe4f5),
    box(1.5, 1.3, 0.03, -2.3, 1.6, zBack + 0.03, 0xd2eefb), box(1.5, 1.3, 0.03, 2.5, 1.6, zBack + 0.03, 0xd2eefb),
    box(0.03, 1.4, 2.2, -hw + 0.02, 1.55, -1.4, 0xd2eefb), box(0.03, 1.4, 2.2, hw - 0.02, 1.55, -1.4, 0xd2eefb),
    // the counter (you are behind it), its top
    box(4.6, COUNTER_TOP - 0.05, 0.6, 0, (COUNTER_TOP - 0.05) / 2, COUNTER_Z, WOOD), box(4.7, 0.05, 0.72, 0, COUNTER_TOP - 0.025, COUNTER_Z, 0xdcd3c2),
    // the machine: body, group heads, the drip tray, red accent
    box(0.84, 0.36, 0.42, STATION_X.pull, COUNTER_TOP + 0.3, COUNTER_Z - 0.04, 0xbcc2c9), box(0.84, 0.04, 0.42, STATION_X.pull, COUNTER_TOP + 0.1, COUNTER_Z + 0.02, 0x6e747b),
    box(0.84, 0.03, 0.44, STATION_X.pull, COUNTER_TOP + 0.49, COUNTER_Z - 0.04, 0xa61c2c),
    cyl(0.05, 0.05, 0.04, STATION_X.pull, COUNTER_TOP + 0.26, COUNTER_Z + 0.08, 0x3a3e44, 10), box(0.03, 0.02, 0.14, STATION_X.pull, COUNTER_TOP + 0.26, COUNTER_Z + 0.2, 0x1a1a1e),
    // the grinder with its hopper, the tamping mat
    box(0.2, 0.34, 0.24, STATION_X.grind, COUNTER_TOP + 0.17, COUNTER_Z, 0x24262a), cyl(0.11, 0.07, 0.2, STATION_X.grind, COUNTER_TOP + 0.44, COUNTER_Z, 0xc9dbe0, 10), cyl(0.09, 0.08, 0.12, STATION_X.grind, COUNTER_TOP + 0.42, COUNTER_Z, 0x3b2413, 10),
    box(0.26, 0.012, 0.26, STATION_X.tamp, COUNTER_TOP + 0.006, COUNTER_Z, 0x24262a), cyl(0.045, 0.045, 0.03, STATION_X.tamp, COUNTER_TOP + 0.03, COUNTER_Z, 0x8d939b, 10), cyl(0.02, 0.028, 0.08, STATION_X.tamp, COUNTER_TOP + 0.08, COUNTER_Z, 0x3a2416, 8),
    // the jug by the steam wand
    cyl(0.055, 0.065, 0.13, STATION_X.steam, COUNTER_TOP + 0.065, COUNTER_Z, 0xd3d7dc, 10),
    // the glass case with the cakes
    box(1.0, 0.4, 0.44, 1.65, COUNTER_TOP + 0.2, COUNTER_Z - 0.02, 0xdfeef2), cyl(0.14, 0.14, 0.08, 1.4, COUNTER_TOP + 0.26, COUNTER_Z + 0.02, 0xd9843a, 12), cyl(0.14, 0.14, 0.08, 1.85, COUNTER_TOP + 0.26, COUNTER_Z + 0.02, 0x5b3a22, 12),
    // the tables and chairs of the regulars
    cyl(0.5, 0.5, 0.04, -2.6, 0.74, -1.95, LIGHT, 14), cyl(0.05, 0.05, 0.74, -2.6, 0.37, -1.95, 0x2a1a10, 8), cyl(0.05, 0.04, 0.07, -2.5, 0.8, -1.8, 0xf6f1e5, 8), cyl(0.05, 0.04, 0.07, -2.75, 0.8, -2.1, 0xf6f1e5, 8),
    cyl(0.5, 0.5, 0.04, 2.35, 0.74, -1.85, LIGHT, 14), cyl(0.05, 0.05, 0.74, 2.35, 0.37, -1.85, 0x2a1a10, 8), cyl(0.05, 0.04, 0.07, 2.2, 0.8, -1.7, 0xf6f1e5, 8), cyl(0.05, 0.04, 0.07, 2.45, 0.8, -2.0, 0xf6f1e5, 8),
    // the plants
    cyl(0.15, 0.11, 0.3, -3.5, 0.15, -3.1, 0x9a5a3a, 10), cyl(0.05, 0.2, 0.7, -3.5, 0.65, -3.1, 0x3f7a3a, 8),
    cyl(0.15, 0.11, 0.3, 3.5, 0.15, -3.1, 0x9a5a3a, 10), cyl(0.05, 0.2, 0.7, 3.5, 0.65, -3.1, 0x3f7a3a, 8)
  ];
  group.add(solid(room));
  const sign = textPlane('KAFFEEKLATSCH', 2.2, 0.32, { bg: '#4a2d1d', fg: '#f3e3c3', font: '700 72px Georgia, serif' });
  sign.position.set(0.2, 2.52, zBack + 0.06);
  group.add(sign);
  // (a canvas: its words go through t() here)
  const board = textPlane(t('Rüeblitorte today'), 1.1, 0.34, { bg: '#22302a', fg: '#f4f1e2', font: '600 56px Georgia, serif' });
  board.position.set(-1.0, 2.1, zBack + 0.06);
  group.add(board);
  // the cup: white, with what is in it (scaled by the fill), the shot's stream, the steam, the marker over the station
  const cup = new THREE.Group();
  const white = new THREE.MeshBasicNodeMaterial({ color: 0xfaf6ec, side: THREE.DoubleSide });
  const body = meshOf(new THREE.CylinderGeometry(0.052, 0.036, 0.075, 12, 1, true), white);
  body.position.y = 0.0375;
  const saucer = meshOf(new THREE.CylinderGeometry(0.075, 0.06, 0.008, 14), white);
  const drink = meshOf(new THREE.CylinderGeometry(0.048, 0.048, 0.004, 12), new THREE.MeshBasicNodeMaterial({ color: 0x3b2011 }));
  cup.add(body, saucer, drink);
  cup.position.set(STATION_X.pull, COUNTER_TOP + 0.005, COUNTER_Z + 0.08);
  group.add(cup);
  const stream = meshOf(new THREE.CylinderGeometry(0.006, 0.004, 0.17, 6), new THREE.MeshBasicNodeMaterial({ color: 0x5a3216 }));
  stream.position.set(STATION_X.pull, COUNTER_TOP + 0.16, COUNTER_Z + 0.08);
  stream.visible = false;
  group.add(stream);
  const steam = glow(0.5, 0.5, 0xffffff, 0.5);
  steam.position.set(STATION_X.steam, COUNTER_TOP + 0.28, COUNTER_Z + 0.1);
  steam.visible = false;
  group.add(steam);
  const marker = glow(0.44, 0.44, 0xffb040, 0.6);
  marker.position.set(0, COUNTER_TOP + 0.03, COUNTER_Z + 0.14);
  marker.rotation.x = -Math.PI / 2;
  group.add(marker);
  Object.assign(parts, { cup, drink, stream, steam, marker });
}

const barista = {
  // (js/missions.js hides the game's own controls while this is true: behind the counter; the walk to the door keeps them)
  ownControls: (run) => !!run.br?.room,
  setup(run) {
    addBarsStyle(run);
    const hud = el('div', 'gs-hud gs-pizza');
    hud.hidden = true;
    const pop = el('div', 'gs-pop');
    const card = el('div', 'gs-card');
    const line = el('div'), tickets = el('div', 'br-tickets'), label = el('div'), temp = el('div', 'br-temp');
    temp.hidden = true;
    const gauge = el('div', 'gs-gauge'), zone = el('span', 'gs-zone'), needle = el('span', 'gs-needle');
    gauge.append(zone, needle);
    card.append(line, tickets, label, temp, gauge);
    const row = el('div', 'br-row'), picks = el('div', 'br-row picks');
    picks.hidden = true;
    const buttons = {};
    STATIONS.forEach((id, i) => {
      const b = el('button', 'gs-top');
      b.type = 'button';
      b.append(el('span', null, STATION_INFO[id].button), el('kbd', null, String(i + 1)));
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); barista.press(run, id); });
      row.append(b);
      buttons[id] = b;
    });
    [...DRINKS.map((d) => [d.id, d.name]), ['ask', 'Ask again']].forEach(([id, name], i) => {
      const b = el('button', 'gs-top');
      b.type = 'button';
      b.append(el('span', null, name), el('kbd', null, String(i + 1)));
      run.listen(b, 'pointerdown', (e) => { e.preventDefault(); barista.pick(run, id); });
      picks.append(b);
    });
    hud.append(pop, card, row, picks);
    document.body.append(hud);
    run.cleanups.push(() => hud.remove());
    run.br = { room: null, parts: null, crowd: null, people: {}, bubbles: new Bubbles(run, 3), chatSeen: 0, seq: 0, ticketKey: '', ui: { hud, pop, line, tickets, label, temp, gauge, zone, needle, row, picks, buttons } };
  },
  reset(run) {
    const br = run.br;
    br.room?.dispose(); br.room = null;
    br.ui.hud.hidden = true;
    br.bubbles.clear();
    Object.assign(br, { chatSeen: 0, seq: 0, ticketKey: '' });
    if (run.state) { run.state.game = null; run.state.inside = false; }
  },
  teardown(run) { run.br.room?.dispose(); run.br.room = null; },
  key(run, e) {
    if (!run.br.room || !gameKey(e.code)) return;
    swallow(e);
    if (e.repeat) return;
    const g = run.state?.game;
    const digit = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
    if (digit) {
      const i = Number(digit[1]) - 1;
      if (g?.step === 'pick') barista.pick(run, i < DRINKS.length ? DRINKS[i].id : 'ask');
      else barista.press(run, STATIONS[i]);
    } else if (e.code === 'Space' || e.code === 'Enter') barista.press(run, null);
  },
  press(run, station) {
    const g = run.state?.game;
    if (!g || !live(run)) return;
    if (baristaAction(g, station)) blip(run, 'pock');
  },
  pick(run, id) {
    const g = run.state?.game;
    if (!g || !live(run)) return;
    const r = baristaPick(g, id);
    if (r) blip(run, r === 'wrong' ? 'bad' : 'pock');
  },
  enter(run) {
    const br = run.br;
    const parts = br.parts = {};
    br.room = new Room(run, run.def.interior.door, (group) => {
      buildKafi(group, parts);
      const spots = [
        ...Object.entries(REGULARS).map(([id, r]) => ({ id, name: r.name, ...r.seat, seat: r.seat, female: r.female, look: lookOf(r.hairRoll, r.female) })),
        ...Object.entries(TABLE_FOLK).map(([id, r]) => ({ id, name: r.name, ...r.seat, seat: r.seat, female: r.female, look: lookOf(r.hairRoll, r.female) })),
        ...RUSH.filter((g) => !g.regular).map((g, i) => {
          const female = i % 2 === 1;
          return { id: `guest${g.id}`, name: '', x: QUEUE_OUT.x, z: QUEUE_OUT.z, yaw: 0, seat: null, female, look: lookOf(SEATS_LOOK[i % SEATS_LOOK.length], female) };
        })
      ];
      br.crowd = makeCrowd(spots, group);
    });
    br.people = Object.fromEntries(br.crowd.people.map((p) => [p.id, p]));
    run.state.game = createBarista(31);
    run.state.inside = true;
    br.ui.hud.hidden = false;
  },
  update(run, ctx, dt) {
    const br = run.br;
    if (!br.room && run.def.objectives[run.index]?.id === 'barista' && live(run)) barista.enter(run);
    const g = run.state?.game;
    if (!br.room || !g) return;
    baristaStep(g, dt);
    if (g.last && g.last.seq !== br.seq) { br.seq = g.last.seq; flashPop(br.ui.pop, g.last); if (g.last.good) blip(run, 'good'); else blip(run, 'bad'); }
    drainChat(g, br, (c) => {
      const person = br.people[c.who];
      if (person) br.bubbles.say(person, person.name, c.text, 3.8);
    });
  },
  after(run, ctx, dt) {
    const br = run.br;
    if (!live(run)) br.ui.hud.hidden = true;
    if (!br.room || run.phase === 'aborted') { br.bubbles.clear(); return; }
    const g = run.state.game;
    if (!g) return;
    const portrait = window.innerHeight > window.innerWidth;
    br.room.camera(ctx.camera, portrait ? { x: -0.3, y: 2.5, z: 4.5 } : { x: -0.2, y: 2.15, z: 3.15 }, portrait ? { x: -0.3, y: 0.72, z: 0.1 } : { x: -0.2, y: 1.02, z: -0.5 });
    // the queue walks up, the served go back to their table or out of the door
    const queued = new Map(g.queue.map((guest, i) => [guest.regular || `guest${guest.id}`, i]));
    for (const p of br.crowd.people) {
      const i = queued.get(p.id);
      if (i !== undefined) { const s = queueSpot(i); stroll(p, s.x, s.z, dt, 0); }
      else if (p.seat) stroll(p, p.seat.x, p.seat.z, dt, p.seat.yaw);
      else stroll(p, QUEUE_OUT.x, QUEUE_OUT.z, dt, Math.PI);
    }
    poseCrowd(br.crowd, dt);
    barista.poseCounter(br, g, dt);
    br.bubbles.update(dt, ctx.camera, br.room.origin);
    // the HUD
    const ui = br.ui, gauge = baristaGauge(g);
    setLoc(ui.line, `Order ${Math.min(g.served + g.lost + 1, RUSH.length)} of ${RUSH.length} · ${baristaScore(g)} pts · ${g.lost} walked out`);
    setLoc(ui.label, gauge.label);
    ui.temp.hidden = gauge.temp === null;
    if (gauge.temp !== null) ui.temp.textContent = `${gauge.temp} °C`;
    ui.gauge.toggleAttribute('data-off', gauge.value === null);
    if (gauge.value !== null) {
      ui.zone.style.left = `${gauge.lo * 100}%`; ui.zone.style.width = `${(gauge.hi - gauge.lo) * 100}%`;
      ui.needle.style.left = `${gauge.value * 100}%`;
    }
    const picking = g.step === 'pick';
    ui.row.hidden = picking;
    ui.picks.hidden = !picking;
    const stations = g.work ? drinkById(g.work.guest.drink).stations : [];
    for (const id of STATIONS) {
      const b = ui.buttons[id], on = g.step === id;
      b.classList.toggle('on', on);
      b.disabled = !on;
      b.style.visibility = !g.work || picking || stations.includes(id) ? '' : 'hidden';
    }
    // the tickets, with what each guest's patience has left
    const shown = g.queue.slice(0, 4);
    const key = shown.map((guest) => `${guest.id}${guest === g.work?.guest && !g.work.picking ? '!' : ''}`).join('/');
    if (key !== br.ticketKey) {
      br.ticketKey = key;
      ui.tickets.replaceChildren(...shown.map((guest, i) => {
        const open = guest.usual && (i > 0 || g.work?.picking);
        const who = guest.regular ? `${REGULARS[guest.regular].name}: ` : '';
        const node = el('div', `br-ticket${i === 0 ? ' front' : ''}`, `${who}${open ? t('the usual') : t(drinkById(guest.drink).name)}`);
        node.append(el('i'));
        return node;
      }));
    }
    shown.forEach((guest, i) => {
      const bar = ui.tickets.children[i]?.lastChild;
      if (!bar) return;
      const k = clamp(guest.left / BARISTA.patience, 0, 1);
      bar.style.transform = `scaleX(${k.toFixed(3)})`;
      bar.style.background = k > 0.45 ? '#3fbf6b' : k > 0.2 ? '#f2b632' : '#e8391f';
    });
  },
  /** The cup under the machine or by the jug and how full it is, the stream, the steam, the marker on the station */
  poseCounter(br, g, dt) {
    const p = br.parts, step = g.step;
    const x = STATION_X[step];
    p.marker.visible = x !== undefined;
    if (x !== undefined) p.marker.position.x = x;
    const milky = step === 'steam' || step === 'pour' || (step === 'serve' && g.work && drinkById(g.work.guest.drink).steam);
    const tx = milky ? STATION_X.pour : step === 'serve' ? STATION_X.serve : STATION_X.pull;
    p.cup.position.x += (tx - p.cup.position.x) * (1 - Math.exp(-dt * 10));
    p.cup.visible = !!g.work && step !== 'pick';
    const pulled = step === 'pull' ? g.value : step === 'grind' || step === 'tamp' ? 0 : 0.7;
    const poured = step === 'pour' ? baristaGauge(g).value ?? 0 : step === 'serve' && milky ? 1 : 0;
    const level = 0.006 + pulled * 0.03 + poured * 0.035;
    p.drink.position.y = level;
    p.drink.material.color.setHex(poured > 0.3 ? 0xe9d9bd : 0x3b2011);
    p.stream.visible = step === 'pull';
    p.steam.visible = step === 'steam';
    if (p.steam.visible) p.steam.material.opacity = 0.25 + 0.35 * (g.value || 0);
  }
};

export const BARS_FEATURES = { nageln, barista };
