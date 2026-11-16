// js/missions-heliblast.js
// The runtime of js/missions-data-heliblast.js, as a feature of js/missions.js (HELIBLAST_FEATURES, merged into its FEATURES):
//   heliBlast — the blaster at the helicopter's door: G (the key bar's button, a touch button, the gamepad's A) throws a
//               charge; the red bundle falls with its fuse sparking and lies in the snow until it goes off. The white
//               aim ring on the snow shows where a charge thrown now would land (on the zone: the throw counts). The
//               blast and the avalanche are js/missions-fx.js': the flash, the pressure ring of dust, the smoke ball,
//               the bang late by the speed of sound with its echoes, the camera's jolt as the wave arrives, then the
//               fracture line across the crown and the slab running down the fall line, its roar and tremor.
// The flying is the game's own helicopter (js/controllers.js updateHelicopter); the camera its chase camera. The
// particles run on after the finish (after(): the last avalanche rolls out under the dialog). Everything goes with the
// run's group and its cleanups.
import * as THREE from 'three/webgpu';
import { groundHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { ParticleBatch, CameraShake, FX_SHARE } from './missions-fx.js';
import { createAimMarker } from './missions-props.js';
import { ZONES, HB, stepBlast, requestDrop, heliOf } from './missions-data-heliblast.js';

const live = (run) => run.phase === 'ready' || run.phase === 'running';

function createCharge() {
  // (three sticks taped together with the fuse's igniter on top: big enough to follow from the door)
  const g = new THREE.Group();
  g.name = 'HandCharge';
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0xc8261e });
  const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.7, 8);
  for (const [x, z] of [[-0.12, 0], [0.12, 0], [0, 0.18]]) { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); g.add(m); }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.36), new THREE.MeshBasicNodeMaterial({ color: 0x2b2b2b }));
  cap.position.y = 0.38;
  g.add(cap);
  g.visible = false;
  return g;
}

const heliBlast = {
  setup(run) {
    const hb = run.hb = {
      particles: new ParticleBatch(run.scene, { max: QUALITY.mobile ? 450 : 1000 }),
      shake: new CameraShake(), charge: createCharge(), aim: createAimMarker(), ctx: null, sparkAcc: 0
    };
    hb.particles.mesh.name = 'HeliBlastParticles';
    run.storage(hb.particles.mesh);
    run.cleanups.push(() => hb.particles.dispose());
    run.group.add(hb.charge, hb.aim);
    run.actions([
      { id: 'drop', primary: true, label: 'Drop charge', touchLabel: 'Drop', icon: 'i-fire', keys: ['KeyG'], keyboard: false, pad: 'a', run: () => heliBlast.drop(run) }
    ]);
  },
  reset(run) {
    const hb = run.hb;
    hb.particles.clear();
    hb.shake.clear();
    hb.charge.visible = false;
    hb.aim.visible = false;
  },
  key(run, e) {
    // (G gets out of a vehicle in the GTA mode, js/gta.js: here it is the blaster's)
    if (e.code !== 'KeyG' || run.phase === 'intro') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) heliBlast.drop(run);
  },
  drop(run) {
    if (!live(run) || !run.state || !run.hb.ctx || run.hb.ctx.mode !== 'helicopter') return false;
    return requestDrop(run.state, heliOf(run.hb.ctx));
  },
  update(run, ctx, dt) {
    const hb = run.hb, st = run.state;
    hb.ctx = ctx;
    if (ctx.mode !== 'helicopter') return;
    stepBlast(st, heliOf(ctx), dt, groundHeight);
    for (const e of st.events.splice(0)) {
      if (e.kind === 'throw') run.audio.thump(0.3);
      else if (e.kind === 'blast') heliBlast.blast(run, e, ctx);
      else if (e.kind === 'cloud') { hb.shake.kick(0.03, { seconds: 2.5 }); for (let i = 0; i < 14 * FX_SHARE; i++) hb.particles.spawn({ x: ctx.x + (Math.random() - 0.5) * 30, y: ctx.y + (Math.random() - 0.3) * 12, z: ctx.z + (Math.random() - 0.5) * 30, life: 3 + Math.random() * 2, size0: 12, size1: 30, alpha: 0.6, r: 0.92, g: 0.94, b: 0.98, kind: 'dust' }); }
    }
    // the charge falling, its fuse sparking
    const c = st.charge;
    hb.charge.visible = !!c;
    if (c) {
      hb.charge.position.set(c.x, c.y + (c.landed ? 0.15 : 0), c.z);
      if (!c.landed) hb.charge.rotation.set(c.t * 5.3, c.t * 2.1, c.t * 3.7);
      else hb.charge.rotation.set(Math.PI / 2, 0, 0.4);
      hb.sparkAcc += dt * 30;
      while (hb.sparkAcc >= 1) {
        hb.sparkAcc--;
        hb.particles.spawn({ x: c.x, y: c.y + 0.4, z: c.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, gravity: 4, life: 0.35 + Math.random() * 0.3, size0: 0.5, size1: 0.1, alpha: 1, r: 3, g: 1.9, b: 0.6, kind: 'spark' });
      }
    }
    // the aim ring: near the zone, while no charge burns
    const zone = ZONES[Math.min(st.hits, ZONES.length - 1)];
    const a = st.aim, near = Math.hypot(zone.x - ctx.x, zone.z - ctx.z) < HB.near;
    hb.aim.visible = !!a && near && !c;
    if (hb.aim.visible) {
      hb.aim.position.set(a.x, a.y + 0.4, a.z);
      hb.aim.scale.setScalar(a.inZone ? 2.6 : 1.8); // (on the zone: the ring opens up)
    }
  },
  /** The charge goes off: the blast and its bang where it lay, the camera's jolt; on the zone the slab breaks and runs */
  blast(run, e, ctx) {
    const hb = run.hb;
    hb.particles.blast(e.x, e.y, e.z, { scale: 0.9 });
    run.audio.boom(e.d, 1);
    hb.shake.kick(CameraShake.strengthAt(e.d) * 1.3, { delay: e.d / 340, seconds: 1 });
    if (e.hit) {
      const zone = ZONES[e.zone];
      hb.particles.avalanche(zone.x + (e.x - zone.x) * 0.5, zone.z + (e.z - zone.z) * 0.5, { count: Math.round(440 * FX_SHARE), seconds: 6.5, spread: zone.r + 4, run: HB.pathLength, width: zone.r * 2 + 16, crack: true });
      run.audio.rumble(e.d, { seconds: 8, delay: 0.5 });
      hb.shake.kick(CameraShake.strengthAt(e.d, 0.35), { delay: e.d / 340 + 0.8, seconds: 5 });
    }
  },
  after(run, ctx, dt) {
    const hb = run.hb;
    hb.particles.update(dt, ctx.camera);
    if (run.phase !== 'intro') hb.shake.apply(ctx.camera, dt);
  }
};

export const HELIBLAST_FEATURES = { heliBlast };
