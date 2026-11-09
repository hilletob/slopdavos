// js/missions-data-post.js
// The postman's round (js/missions-data.js lists it; js/missions-post.js has its runtime: the yellow van, the post boxes,
// the letters): its definition and the pure logic behind it, three.js-free like the other packages
// (tests/missions-post.test.mjs drives it with synthetic frames and a bot).
//
//   post-boxes   All year, late morning. The Post's yellow delivery van empties the public post boxes (Briefeinwürfe)
//                of Davos Dorf and Davos Platz on the 11:00/11:30 collection and brings the mail to the post office
//                Davos Platz (Talstrasse 5) for the midday dispatch. Eight real boxes from OpenStreetMap
//                (amenity=post_box, operator Die Post), in the order the one-way streets allow: down the
//                Dischmastrasse, along the Talstrasse to the Bahnhofstrasse in Dorf, then the one-way Promenade all
//                the way to Platz. At each box the van stops, Space held empties it (the more letters, the longer);
//                a box left out costs 45 s. The plates show each box's collection time (OSM collection_times).
//
// The boxes (OSM, fetched 2026-11-09 with amenity=post_box in 46.76,9.78,46.84,9.90, converted with
// js/davos-frame.js lonLatToWorld): wall-mounted ones moved 0.8 m out of the OSM building's wall (the box stands on a
// short pillar in front of it), each turned to face its street. The Bahnhofstrasse box has no collection_times in OSM:
// its plate shows the round's 11:30 (assumed). The Promenade (Dorf) box stands 3.3 m nearer the Promenade than its
// node, out on the pavement (at the node a hedge hides it against the house's corner). Two more boxes of the area are not in the round: Talstrasse 4774889693
// (against the one-way Talstrasse from the Promenade) and Spinabad/Frauenkirch (too far out).

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

export const POST = {
  reach: 10, // m from the van's centre to the box: the postman's few steps from the passenger door, across the pavement
  stopSpeed: 0.8, // m/s: standing
  baseS: 1.2, // s to unlock the box and pull the tray
  letterS: 1 / 80, // s more per letter (the tray tipped into the sack)
  missMs: 45000, // a box left out
  dropS: 4, // s at the post office: the sacks handed over
  timeLimitMs: 900000 // the dispatch at noon: 15 min
};

// The post office Davos Platz (OSM post_office n13893141571, Talstrasse 5): the van stops in the service yard on its
// north-east side, by the building's loading door
export const POST_OFFICE = { name: 'Post Davos Platz', x: -653.5, z: 412.5, r: 7 };

// The round: [OSM node, ref, street, x, z, yaw (the box's front towards the street), collection times, letters]
export const POST_BOXES = [
  { id: 'n13528933580', ref: '3-7260-10418', where: 'Dischmastrasse', x: 925, z: -763, yaw: -1.01, times: 'Mo–Fr 11:00', letters: 64 },
  { id: 'n13524186494', ref: null, where: 'Bahnhofstrasse', x: 810.6, z: -1522.6, yaw: 0.91, times: 'Mo–Fr 11:30', letters: 138 },
  { id: 'n982616239', ref: null, where: 'Promenade (Dorf)', x: 521.2, z: -919.8, yaw: -1.82, times: 'Mo–Fr 11:30', letters: 92 },
  { id: 'n10302584689', ref: '3-7270-10492', where: 'Promenade/Richtstattweg', x: 212.7, z: -648.7, yaw: 0.04, times: 'Mo–Fr 11:30', letters: 48 },
  { id: 'n4774889695', ref: null, where: 'Promenade', x: -375.5, z: -393.4, yaw: 0.79, times: 'Mo–Fr 11:30', letters: 115 },
  { id: 'n13942129699', ref: '3-7270-10490', where: 'Promenade (Platz)', x: -569, z: -128.2, yaw: -1.87, times: 'Mo–Fr 11:30', letters: 83 },
  { id: 'n6307571960', ref: '3-7270-10489', where: 'Postplatz', x: -640.3, z: 260.7, yaw: -0.29, times: 'Mo–Fr 17:00 · Sa 09:30', letters: 156 },
  { id: 'n2134212916', ref: '3-7270-10496', where: 'Post Davos Platz', x: -661.6, z: 419.5, yaw: 1.02, times: 'Mo–Fr 19:00 · Sa 11:00', letters: 172 }
];

// The way a careful driver takes (the OSM streets, simplified to 1.2 m; tests/missions-post.test.mjs's bot drives it):
// the Dischmastrasse down, the Talstrasse to the Bahnhofstrasse, a turn at its box, the Promenade to the Postplatz,
// the Rathausstutz and the Talstrasse to the post office's yard
export const POST_ROUTE = [
  976.6, -667.4, 925.3, -755.1, 833.9, -901.4, 810.7, -944.1, 797.1, -979.5, 765.1, -1077.7, 753.4, -1106.6, 744, -1121.9,
  722.1, -1146, 702.8, -1157.2, 691.8, -1160.5, 661, -1164.5, 644.3, -1170.9, 647.9, -1204.5, 652.1, -1223.6, 656.8, -1240.5,
  671.5, -1274.3, 681.3, -1290.2, 780.4, -1411.4, 784.3, -1420.7, 784.9, -1430.5, 772.7, -1468.1, 785.2, -1476.9, 816.5, -1518,
  785.2, -1476.9, 772.7, -1468.1, 762.9, -1468, 755.6, -1470.4, 730.8, -1486.7, 719.3, -1487.8, 709.9, -1484.6, 690, -1458.8,
  628.6, -1368.8, 608.4, -1325.1, 594.2, -1287.6, 578.6, -1217.6, 553.1, -1071.4, 533.9, -985.5, 491, -831.8, 479.5, -807.9,
  462.4, -785.4, 312.5, -658.2, 298.4, -649.1, 290.1, -646.1, 269.4, -642.7, -60.6, -629.5, -70.9, -628.5, -105.3, -619.3,
  -134.9, -604.9, -158.8, -585.8, -180.4, -548.9, -192.2, -536.5, -274, -489.6, -289.3, -477.8, -477.2, -276.5, -491.3, -266.8,
  -522.3, -253.8, -540.1, -238.4, -547, -226, -560.4, -187.8, -620.5, 25.7, -627.8, 66.7, -645.3, 237.1, -652.2, 279.2,
  -633.4, 285.8, -617, 296, -604.4, 309.1, -602.2, 322.7, -617, 349.9, -630.6, 392.7, -631.2, 400.3, -627.9, 413.5, -635, 420.3,
  -652, 409.4, -655.1, 414.8
];

/** The time (s) a box takes to empty: the lock and the tray, then its letters */
export const emptyS = (box, P = POST) => P.baseS + box.letters * P.letterS;

/** The round's boxes as the run's state: emptied or not, the hold's progress */
export const createPostBoxes = () => POST_BOXES.map((b, i) => ({ ...b, i, done: false, t: 0 }));

/** The box not yet emptied nearest to (x, z) within `reach`, or null */
export function nearestBox(boxes, x, z, reach = POST.reach) {
  let best = null, bd = reach;
  for (const b of boxes) {
    if (b.done) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d <= bd) { bd = d; best = b; }
  }
  return best;
}

/**
 * One step of the round: the van { x, z, speed }, the key `hold`. Standing by a box with the key held empties it (its
 * progress kept when let go); returns 'emptied' when one is done, else null. state.near: the box in reach,
 * state.emptying: the one being emptied
 */
export function stepPost(state, van, hold, dt, P = POST) {
  const box = nearestBox(state.boxes, van.x, van.z, P.reach);
  const still = Math.abs(van.speed || 0) < P.stopSpeed;
  state.near = box;
  state.still = still;
  state.emptying = null;
  if (!box || !still || !hold) return null;
  box.t += dt;
  state.emptying = box;
  if (box.t < emptyS(box, P)) return null;
  box.done = true;
  state.emptied++;
  state.letters += box.letters;
  state.emptying = null;
  return 'emptied';
}

/** The next box of the round (the first not yet emptied, in the round's order) */
export const nextBox = (boxes) => boxes.find((b) => !b.done) || null;

const POST_ID = 'post-boxes';
export const POST_MISSION = {
  id: POST_ID,
  title: 'Emptying the post boxes',
  intro: 'The late-morning collection: take the Post\'s yellow van from the Dischmastrasse through Davos Dorf and along the Promenade to Davos Platz and empty the eight public post boxes on the way. Stop by each box and hold Space (or Empty) while the postman unlocks it and tips its letters into the sack; a full box takes longer. Each plate shows its collection time. Then hand the sacks in at the post office Davos Platz on the Talstrasse before the noon dispatch leaves. A box left out costs 45 s.',
  mode: 'car',
  season: null,
  time: 'midday',
  features: ['workVehicle', 'postRound'],
  props: [],
  vehicle: 'postVan',
  colour: '#f5b800',
  icon: 'postbox',
  // (the bot of tests/missions-post.test.mjs over POST_ROUTE's 3.9 km — 50 km/h on the straights, the bends at 3 m/s²
  // lateral, 2.5 m/s² away from a stop, 3.5 m/s² braking, eight stops with their emptying times, the hand-over: ~7:00;
  // gold half a minute of traffic over it, silver a wrong turn or a hesitation at a box, bronze any run that gets
  // there before the dispatch, a box left out included)
  bonusMs: 450000,
  medals: { gold: 450000, silver: 600000, bronze: 810000 },
  timeLimitMs: POST.timeLimitMs,
  finish: 'The sacks are in, the dispatch to the letter centre leaves at noon. Tomorrow the letters of Davos are in Zürich, Basel and Bern.',
  start: { x: 976.6, z: -667.4, heading: Math.atan2(925.3 - 976.6, -755.1 + 667.4) },
  createState() { return { boxes: createPostBoxes(), emptied: 0, letters: 0, missed: 0, penaltyMs: 0, near: null, still: false, emptying: null, dropT: 0, atOffice: false }; },
  update(ctx, state) {
    state.atOffice = Math.hypot(ctx.x - POST_OFFICE.x, ctx.z - POST_OFFICE.z) <= POST_OFFICE.r;
  },
  objectives: [
    {
      id: 'empty',
      title: 'Empty the post boxes',
      check(ctx, state) {
        if (ctx.t > POST.timeLimitMs) return { done: false, fail: 'The noon dispatch has left: the letters stay in Davos until tomorrow.', text: '', progress: state.emptied / state.boxes.length, target: null, hint: null };
        const left = state.boxes.filter((b) => !b.done);
        // at the post office with boxes left out: the round is over, each one missed costs its 45 s
        if (state.atOffice && state.emptied > 0 && left.length && !state.near && Math.abs(ctx.speed) < 1) {
          state.missed = left.length;
          state.penaltyMs = state.missed * POST.missMs;
          return { done: true, progress: 1, text: `${left.length} box${left.length === 1 ? '' : 'es'} left out (+${(left.length * POST.missMs) / 1000} s)`, target: null, hint: null };
        }
        const next = nextBox(state.boxes);
        const d = next ? Math.hypot(next.x - ctx.x, next.z - ctx.z) : 0;
        const e = state.emptying;
        const text = `Emptied ${state.emptied}/${state.boxes.length} · ${state.letters} letters${next ? ` · next ${fmtDist(d)}` : ''}`;
        const hint = ctx.mode !== 'car' ? 'Back into the van'
          : e ? `Emptying … ${Math.min(100, Math.round((e.t / emptyS(e)) * 100))} %`
          : state.near ? (state.still ? 'Hold Space to empty the box' : 'Stop by the post box') : null;
        return { done: !left.length, progress: state.emptied / state.boxes.length, text, target: next ? { x: next.x, z: next.z, r: 2.5 } : null, hint };
      }
    },
    {
      id: 'drop',
      title: 'Hand the mail in at the post office',
      check(ctx, state) {
        if (ctx.t > POST.timeLimitMs) return { done: false, fail: 'The noon dispatch has left: the letters stay in Davos until tomorrow.', text: '', progress: state.dropT / POST.dropS, target: null, hint: null };
        if (state.atOffice && Math.abs(ctx.speed) < POST.stopSpeed) state.dropT += ctx.dt;
        const d = Math.hypot(ctx.x - POST_OFFICE.x, ctx.z - POST_OFFICE.z);
        return {
          done: state.dropT >= POST.dropS, progress: state.dropT / POST.dropS,
          text: state.atOffice ? `Handing over … ${Math.min(100, Math.round((state.dropT / POST.dropS) * 100))} %` : `To the post office · ${fmtDist(d)}`,
          target: { x: POST_OFFICE.x, z: POST_OFFICE.z, r: POST_OFFICE.r, style: 'pad' },
          hint: ctx.mode !== 'car' ? 'Back into the van' : state.atOffice ? 'Stand still while the sacks go in' : null
        };
      }
    }
  ],
  summary(state) { return [`${state.emptied} of ${state.boxes.length} post boxes emptied · ${state.letters} letters${state.missed ? ` · ${state.missed} left out (+${(state.missed * POST.missMs) / 1000} s)` : ''}`]; }
};

export const POST_MISSIONS = [POST_MISSION];
