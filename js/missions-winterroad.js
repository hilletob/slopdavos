import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceHeight } from './terrain.js';
import { particles, createToast } from './missions-work.js';
import { TYRES, SPIN, CHAINS, CHAIN_STEPS, stepTraction, slopePull, needleAt } from './missions-data-winterroad.js';
import { t } from './i18n.js';

// js/missions-winterroad.js
// The runtime of winter driving (js/missions-data-winterroad.js has the definitions and the pure logic; js/missions.js
// takes WINTERROAD_FEATURES into its FEATURES):
//   winterDrive — the player's VW T3 on the mission's tyres: a handling table of its own on the van (car.drive, read by
//                 js/controllers.js updateCar), its `acceleration` set each frame to what the driven wheels put down
//                 (stepTraction: the eased throttle, the spin), its lateral grip cut while the rear wheels spin, the
//                 slope's pull on the speed (the controllers have none), the snowbank's drag; the rear wheels turning
//                 faster than the van goes and throwing snow while they spin. The van's own table back at the end.
//   snowChains  — the chains: the work at the rear wheels on foot (Space: hold, on the beat, taps; a panel with the
//                 step's bar), the chain laid out on the snow, then on the tyre (steel links on the wheel, turning
//                 with it), the chains' rattle (a loop of clicks, faster with the wheels), the strain over 50 km/h.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const live = (run) => run.phase === 'ready' || run.phase === 'running';
const objectiveId = (run) => run.def.objectives[run.index]?.id;
const HALF_BASE = 1.23; // m: half the T3's wheelbase, over which the grade is read

// --- winterDrive ------------------------------------------------------------------------------------------------------
const winterDrive = {
  setup(run) {
    const cm = run.hooks.controllerManager, car = cm.entities.car;
    const saved = { drive: car.drive };
    run.winter = { ...(run.winter || {}), tables: {}, extra: 0, sprayAcc: 0, toast: createToast(run), wasSpinning: false };
    winterDrive.tables(run);
    car.drive = run.winter.tables[run.def.tyres];
    run.cleanups.push(() => { car.drive = saved.drive; });
  },
  /** Fresh copies of the tyres' tables (the frames change acceleration and grip in them) */
  tables(run) {
    for (const [k, T] of Object.entries(TYRES)) run.winter.tables[k] = { ...T.drive };
  },
  reset(run) {
    const car = run.hooks.controllerManager.entities.car;
    winterDrive.tables(run);
    car.drive = run.winter.tables[run.def.tyres];
    car.speed = 0; car.vx = 0; car.vz = 0; car.angularVel = 0;
    run.winter.extra = 0;
    run.winter.toast.hide();
  },
  update(run, ctx, dt, cm) {
    const w = run.winter, st = run.state, car = cm.entities.car;
    const kind = st.tyres || run.def.tyres, T = TYRES[kind], table = w.tables[kind];
    car.drive = table;
    run.workParticles?.update(dt, ctx.camera);
    w.toast.update(dt);
    if (st.event) {
      const ev = st.event;
      st.event = null;
      if (ev === 'bank') w.toast.show(t('Into the snowbank  +5 s'), '#ffd166', 1.6);
      else if (ev === 'crash') w.toast.show(t('Crash  +8 s'), '#ff8a7a', 1.6);
      else if (ev === 'slip') w.toast.show(t('The chain slipped off  +2.5 s'), '#ff8a7a', 1.6);
      else if (ev === 'wheel') w.toast.show(t('One chain on: now the other wheel'), '#9fe0a8', 1.8);
      else if (ev === 'all') w.toast.show(t('Both chains on'), '#9fe0a8', 1.8);
    }
    if (ctx.mode !== 'car' || !live(run) || !st.traction) { if (st.traction) { st.traction.foot = 0; st.traction.spin = 0; } return; }
    const k = cm.keys;
    const throttle = k.forward ? k.forward : k.backward ? -k.backward : 0;
    const speed = car.speed || 0;
    const braking = speed * throttle < 0 && Math.abs(speed) > 0.05;
    // the grade under the van, along its heading (rise over run, + uphill ahead)
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), y = car.position.y;
    const front = surfaceHeight(car.position.x + fx * HALF_BASE, car.position.z + fz * HALF_BASE, y);
    const back = surfaceHeight(car.position.x - fx * HALF_BASE, car.position.z - fz * HALF_BASE, y);
    const grade = (front - back) / (2 * HALF_BASE);
    const dir = Math.abs(speed) > 0.1 ? Math.sign(speed) : Math.sign(throttle) || 1;
    const tr = stepTraction(st.traction, { throttle: braking ? 0 : throttle, speed, grade: grade * dir, lateral: Math.abs((car.angularVel || 0) * speed) }, T, dt);
    table.acceleration = throttle && !braking ? Math.max(0.001, tr.force / Math.abs(throttle)) : T.drive.acceleration;
    table.grip = T.drive.grip * (1 - T.spinGrip * tr.spin);
    // the slope: it pulls the van back uphill, on downhill; a van standing with no throttle stays put (in gear, the
    // handbrake), one with the throttle on but the wheels not holding does not roll back (the clutch, the brake)
    const pull = slopePull(grade); // (+: holds back forward motion)
    const powered = throttle !== 0 && !braking;
    if (powered) {
      const s = Math.sign(throttle), along = speed * s - pull * s * dt;
      car.speed = s * (Math.abs(speed) < 0.6 ? Math.max(0, along) : along);
    } else if (Math.abs(speed) > 0.35) car.speed = speed - pull * dt;
    // the snowbank: deep, loose snow beside the road
    if (st.drive?.inBank) car.speed *= 1 - Math.min(0.5, 1.4 * dt);
    // the rear wheels turn faster than the van while they spin; snow flies off them
    const slip = tr.spin * (powered ? Math.sign(throttle) : 0);
    w.extra = (w.extra + slip * 28 * dt) % (Math.PI * 2);
    if (tr.spin > SPIN.show) winterDrive.spray(run, car, tr.spin, Math.sign(throttle) || 1, dt);
    if (tr.spin > 0.6 && !w.wasSpinning) w.toast.show(t('Wheelspin!'), '#ffd166', 1.0);
    w.wasSpinning = tr.spin > 0.6;
  },
  after(run, ctx, dt, cm) {
    if (ctx.mode !== 'car') return;
    const car = cm.entities.car, x = run.winter.extra;
    if (!x) return;
    for (const wh of car.wheels || []) if (!wh.isFront) wh.tire.rotation.x += x;
  },
  /** Snow thrown back off the spinning rear wheels */
  spray(run, car, spin, sign, dt) {
    const w = run.winter;
    w.sprayAcc += dt * 40 * spin;
    if (w.sprayAcc < 1) return;
    const pb = particles(run);
    const h = car.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    for (; w.sprayAcc >= 1; w.sprayAcc -= 1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = car.position.x + fx * (CHAINS.axle - 0.35 * sign) + lx * side * 0.78, z = car.position.z + fz * (CHAINS.axle - 0.35 * sign) + lz * side * 0.78;
      const back = -sign * (2.5 + Math.random() * 2.5);
      pb.spawn({
        x, y: car.position.y + 0.12, z, vx: fx * back + (Math.random() - 0.5) * 1.2, vy: 1.2 + Math.random() * 1.6, vz: fz * back + (Math.random() - 0.5) * 1.2,
        gravity: 7, drag: 1.2, life: 0.55 + Math.random() * 0.3, size0: 0.18, size1: 0.7, alpha: 0.75, r: 0.93, g: 0.95, b: 1, kind: 'smoke'
      });
    }
  }
};

// --- snowChains -------------------------------------------------------------------------------------------------------
const STEEL = () => new THREE.MeshStandardNodeMaterial({ color: 0x8d949c, metalness: 0.75, roughness: 0.38 });

/** A chain on a 0.325 m T3 wheel (its axle along x): the two side rings, cross links over the tread, zig-zags */
function chainOnWheelGeo(r = 0.335, half = 0.105) {
  const parts = [];
  const seg = (a, b, rad = 0.007) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const g = new THREE.CylinderGeometry(rad, rad, L, 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  };
  for (const x of [-half, half]) parts.push(new THREE.TorusGeometry(r - 0.045, 0.008, 4, 28).rotateY(Math.PI / 2).translate(x, 0, 0));
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 0.5) / N) * Math.PI * 2;
    const P = (x, ang, rr = r) => [x, Math.cos(ang) * rr, Math.sin(ang) * rr];
    parts.push(seg(P(-half - 0.01, a), P(half + 0.01, a), 0.011)); // the cross link over the tread
    parts.push(seg(P(-half, a, r - 0.04), P(-half - 0.005, a, r)), seg(P(half, a, r - 0.04), P(half + 0.005, a, r))); // down to the rings
    parts.push(seg(P(-half * 0.3, a), P(half * 0.3, b), 0.006), seg(P(half * 0.3, b), P(-half * 0.3, a + Math.PI * 2 / N), 0.006)); // the zig-zag
  }
  return mergeGeometries(parts);
}

/** The chain laid out flat on the snow: a ladder 1.1 m long */
function chainLaidGeo() {
  const parts = [];
  for (const x of [-0.12, 0.12]) parts.push(new THREE.BoxGeometry(0.016, 0.016, 1.1).translate(x, 0.01, 0));
  for (let i = 0; i < 11; i++) parts.push(new THREE.BoxGeometry(0.26, 0.018, 0.02).translate(0, 0.012, -0.5 + i * 0.1));
  return mergeGeometries(parts);
}

function chainPanel(run) {
  const box = el('div');
  Object.assign(box.style, {
    position: 'fixed', left: '50%', bottom: '22%', transform: 'translateX(-50%)', zIndex: 14, pointerEvents: 'none', width: 'min(320px, 80vw)',
    padding: '10px 14px 12px', borderRadius: '12px', background: 'rgba(8,12,20,0.78)', color: '#fff', font: '700 15px/1.25 system-ui, sans-serif', textAlign: 'center', display: 'none'
  });
  const label = el('div', null, '');
  const bar = el('div');
  Object.assign(bar.style, { position: 'relative', height: '16px', marginTop: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.16)', overflow: 'hidden' });
  const zone = el('div'), fill = el('div'), needle = el('div');
  Object.assign(zone.style, { position: 'absolute', top: 0, bottom: 0, left: `${CHAINS.zone[0] * 100}%`, width: `${(CHAINS.zone[1] - CHAINS.zone[0]) * 100}%`, background: 'rgba(110, 220, 130, 0.75)' });
  Object.assign(fill.style, { position: 'absolute', top: 0, bottom: 0, left: 0, width: '0%', background: '#9fd8ff' });
  Object.assign(needle.style, { position: 'absolute', top: '-2px', bottom: '-2px', width: '4px', marginLeft: '-2px', background: '#fff', boxShadow: '0 0 4px #000' });
  bar.append(zone, fill, needle);
  box.append(label, bar);
  document.body.append(box);
  run.cleanups.push(() => box.remove());
  let shown = '';
  return {
    show(step, value, side) {
      box.style.display = 'block';
      const text = `${t(side === 'left' ? 'Left rear wheel' : 'Right rear wheel')} · ${t(step === 'lay' ? 'Lay the chain out: hold Space' : step === 'pull' ? 'Pull it over: Space in the green' : 'Tension it: tap Space')}`;
      if (text !== shown) { label.textContent = text; shown = text; }
      zone.style.display = step === 'pull' ? 'block' : 'none';
      needle.style.display = step === 'pull' ? 'block' : 'none';
      fill.style.display = step === 'pull' ? 'none' : 'block';
      if (step === 'pull') needle.style.left = `${value * 100}%`;
      else fill.style.width = `${clamp(value, 0, 1) * 100}%`;
    },
    hide() { box.style.display = 'none'; }
  };
}

/** The chains' rattle: a loop of eight clicks (the cross links meeting the road) played at the wheels' turning rate */
function chainRattle(run) {
  const A = run.audio?.audio;
  if (!run.audio?.live || !A) return null;
  const ctx = A.context, rate = ctx.sampleRate, n = Math.floor(rate * 0.5);
  const buf = ctx.createBuffer(1, n, rate), d = buf.getChannelData(0);
  for (let c = 0; c < 8; c++) {
    const at = Math.floor(((c + Math.random() * 0.3) / 8) * n), len = Math.floor(rate * 0.012);
    for (let i = 0; i < len && at + i < n; i++) d[at + i] += (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.0025)) * (0.6 + Math.random() * 0.4);
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.9;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(bp).connect(g).connect(A.mix);
  src.start();
  const stop = () => { try { src.stop(); g.disconnect(); } catch { /* gone */ } };
  run.cleanups.push(stop);
  return { src, g, ctx, stop };
}

const snowChains = {
  setup(run) {
    const cm = run.hooks.controllerManager, car = cm.entities.car;
    run.winter = { ...(run.winter || {}), hold: false, presses: 0, rattle: null };
    const material = STEEL();
    const onWheel = chainOnWheelGeo(), laid = chainLaidGeo();
    // (the rear tyres: side +1 at +x is the van's left, the driver's side)
    const rear = (car.wheels || []).filter((w) => !w.isFront);
    const wheels = rear.map((w) => {
      const m = new THREE.Mesh(onWheel, material);
      m.castShadow = true;
      m.visible = false;
      w.tire.add(m);
      const side = w.steerPivot.position.x > 0 ? 'left' : 'right';
      const flat = new THREE.Mesh(laid, material);
      flat.visible = false;
      run.group.add(flat);
      return { tire: w.tire, mesh: m, flat, side };
    });
    run.winter.chainMeshes = wheels;
    run.cleanups.push(() => {
      for (const c of wheels) c.mesh.removeFromParent();
      onWheel.dispose();
    });
    run.winter.panel = chainPanel(run);
    // the hold (Space or E on foot; the touch button, the pad's A)
    const working = () => objectiveId(run) === 'chains' && cm.activeMode === 'person';
    run.button('up', null);
    run.actions([{ id: 'chain-hold', kind: 'hold', primary: true, label: 'Chains', icon: 'i-hand', keys: ['Space', 'KeyE'], kbd: ['Space'], keyboard: false, pad: 'a', when: working, run: (on) => { if (on && !run.winter.hold) run.winter.presses++; run.winter.hold = on; } }]);
    run.listen(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') run.winter.hold = false; }, { capture: true });
    run.listen(window, 'blur', () => { run.winter.hold = false; });
    run.winter.working = working;
  },
  reset(run) {
    const w = run.winter;
    w.hold = false; w.presses = 0;
    for (const c of w.chainMeshes) { c.mesh.visible = false; c.flat.visible = false; }
    w.panel.hide();
    if (w.rattle) w.rattle.g.gain.value = 0;
  },
  key(run, e) {
    if (e.code !== 'Space' && e.code !== 'KeyE') return;
    if (run.phase === 'intro' || !run.winter.working()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) run.winter.presses++;
    run.winter.hold = true;
  },
  update(run, ctx, dt, cm) {
    const w = run.winter, st = run.state, car = cm.entities.car, p = cm.entities.person;
    if (!st?.chains) return;
    const working = live(run) && objectiveId(run) === 'chains';
    st.input = {
      person: working && ctx.mode === 'person' ? { x: p.position.x, z: p.position.z } : null,
      car: { x: car.position.x, z: car.position.z, heading: car.heading },
      hold: w.hold, presses: working ? w.presses : 0
    };
    w.presses = 0;
    // the chain at the wheel (after the data's step: js/missions.js runs def.update after the features)
    if (st.chainWarnShown !== st.chainWarn) {
      st.chainWarnShown = st.chainWarn;
      if (st.chainWarn) w.toast?.show(t('The chains are straining: under 50 km/h!'), '#ff8a7a', 1.8);
    }
    // the rattle
    if (st.tyres === 'chains' && ctx.mode === 'car' && live(run)) {
      if (!w.rattle) w.rattle = chainRattle(run);
      if (w.rattle) {
        const v = Math.abs(car.speed || 0), now = w.rattle.ctx.currentTime;
        const revs = v / (2 * Math.PI * 0.325); // the loop is half a turn's eight links: twice the turn rate
        w.rattle.src.playbackRate.setTargetAtTime(clamp(revs * 2, 0.05, 16), now, 0.05);
        w.rattle.g.gain.setTargetAtTime(v < 0.3 ? 0 : clamp(0.1 + v / 30, 0, 0.55) * (st.chainWarn ? 1.4 : 1), now, 0.08);
      }
    } else if (w.rattle) w.rattle.g.gain.setTargetAtTime(0, w.rattle.ctx.currentTime, 0.05);
  },
  after(run, ctx, dt, cm) {
    const w = run.winter, st = run.state, car = cm.entities.car;
    if (!st?.chains) return;
    const ch = st.chains;
    // the chains: laid out on the snow behind the wheel once the first step is done, on the tyre from the pull
    for (const c of w.chainMeshes) {
      const wh = ch.wheels.find((q) => q.side === c.side);
      c.mesh.visible = wh.done || wh.step >= 2;
      c.flat.visible = !c.mesh.visible && wh.step >= 1;
      if (c.flat.visible) {
        const h = car.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h), s = c.side === 'left' ? 1 : -1;
        const x = car.position.x + fx * (CHAINS.axle - 0.75) + lx * s * 0.78, z = car.position.z + fz * (CHAINS.axle - 0.75) + lz * s * 0.78;
        c.flat.position.set(x, surfaceHeight(x, z, car.position.y) + 0.005, z);
        c.flat.rotation.set(0, h, 0);
      }
    }
    // the panel of the step at hand
    const at = ch.at >= 0 && ctx.mode === 'person' && live(run) ? ch.wheels[ch.at] : null;
    if (!at || at.done) { w.panel.hide(); return; }
    const step = CHAIN_STEPS[at.step];
    w.panel.show(step, step === 'lay' ? at.t / CHAINS.layS : step === 'pull' ? needleAt(at.t) : at.tension, at.side);
  }
};

export const WINTERROAD_FEATURES = { winterDrive, snowChains };
