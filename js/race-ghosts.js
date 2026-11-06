import * as THREE from 'three/webgpu';
import { VEHICLES } from './missions-work.js';
import './missions-rural.js'; // (registers VEHICLES.quad)

// js/race-ghosts.js
// The other players' vehicles in a race (js/race-session.js): one more of the mission's vehicle (js/missions-work.js
// VEHICLES, the quad of js/missions-rural.js) a player, a little see-through, the player's name on a sprite over it. No
// collision: a ghost is only drawn where the snapshots say (js/race-protocol.js createInterpolator), it is in nobody's
// way. Built into the run's group, so that js/missions.js disposes it with the run; dispose() for one who leaves early.

const TAG_W = 512, TAG_H = 128;
const _c = new THREE.Color();

function drawTag(canvas, name, colour) {
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.font = '800 54px system-ui, -apple-system, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(canvas.width - 16, x.measureText(name).width + 56), h = 86, cx = canvas.width / 2, cy = canvas.height / 2;
  x.fillStyle = 'rgba(8, 10, 14, 0.72)';
  x.beginPath(); x.roundRect(cx - w / 2, cy - h / 2, w, h, 22); x.fill();
  x.lineWidth = 6; x.strokeStyle = colour; x.stroke();
  x.fillStyle = '#fff';
  x.fillText(name, cx, cy + 2);
}

/** A ghost: { group, pose(sample, dt, cm), setName(name), dispose() } */
export function createGhost(run, { name, colour = '#3fd6ff', vehicle = run.def.vehicle } = {}) {
  const build = VEHICLES[vehicle] || VEHICLES.quad;
  const v = build();
  const g = v.group;
  g.name = `Ghost ${name}`;
  // (see-through: the materials are the model's own, built for this call)
  g.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (m.userData?.shared) continue;
      m.transparent = true;
      m.opacity = 0.62;
      m.depthWrite = true;
      if (m.emissive) { m.emissive = _c.set(colour).multiplyScalar(0.18); m.emissiveIntensity = 1; }
    }
  });
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W; canvas.height = TAG_H;
  drawTag(canvas, name, colour);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  tag.scale.set(2.4, 0.6, 1);
  tag.position.set(0, 2.05, 0);
  tag.renderOrder = 950;
  g.add(tag);
  g.visible = false;
  run.group.add(g);
  const wheels = v.wheels || [];
  let disposed = false;
  return {
    group: g,
    /** sample: js/race-protocol.js createInterpolator().sample(); cm: the controller manager (the ground under the ghost) */
    pose(s, dt, cm) {
      if (disposed || !s) { g.visible = false; return; }
      g.visible = true;
      const y = cm.getGroundHeight(s.x, s.z, 'car');
      g.position.set(s.x, y + (s.hop || 0), s.z);
      g.rotation.set(s.tilt || 0, s.heading || 0, s.roll || 0, 'YXZ');
      for (const w of wheels) {
        w.mesh.rotation.order = 'YXZ';
        if (!s.stale) w.mesh.rotation.x += ((s.speed || 0) * dt) / (w.r || 0.3);
        if (w.front) w.mesh.rotation.y = s.steer || 0;
      }
      tag.material.opacity = s.stale ? 0.45 : 1;
    },
    setName(next) { name = next; drawTag(canvas, name, colour); tex.needsUpdate = true; g.name = `Ghost ${name}`; },
    dispose() {
      if (disposed) return;
      disposed = true;
      g.removeFromParent();
      g.traverse((o) => {
        o.geometry?.dispose?.();
        for (const m of [].concat(o.material || [])) { if (m.userData?.shared) continue; m.map?.dispose?.(); m.dispose?.(); }
      });
    }
  };
}

/** The colours the players wear in the standings and on their tags, by the order they joined */
export const PLAYER_COLOURS = ['#3fd6ff', '#ffb347', '#7ee787', '#ff7eb6', '#c3a6ff', '#ffe066'];
