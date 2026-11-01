import * as THREE from 'three/webgpu';
import { cameraPosition, color, positionGeometry, positionWorld, sin, smoothstep, step, time } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MISSIONS, formatDistance, relativeBearing } from './missions-data.js';
import { missionPin, missionInReach, START_RADIUS, MEDAL_COLOURS, MEDAL_LABELS, MEDAL_POINTS, FIRST_CLEAR_POINTS } from './missions-progress.js';
import { setMissionStartInReach } from './missions-manager.js';
import { surfaceHeight } from './terrain.js';
import { TELEPORT_LOCATIONS, isTypingInField } from './city-config.js';
import { QUALITY } from './quality.js';

// js/missions-world.js
// The missions in the open world (js/missions.js builds it with the manager): a pin at every mission's start — a
// column of light in the mission's colour with the start circle at its foot (one instanced mesh for all) and an icon
// over it ringed in the medal the player holds (one sprite each), drawn only within PIN_RADIUS; the prompt
// "Enter: Start …" (a button too, for touch screens) while the player stands in a start circle, on foot or in the
// mission's vehicle; the pins on the radar and the full map (js/nyc-map.js overlays; a click on one sets the map's
// waypoint, an arrow in the HUD points the way); the points in the HUD with a "+250" as they come in. Nothing of the
// world's pins shows while a mission runs.

const PIN_RADIUS = QUALITY.mobile ? 500 : 800; // m: the markers drawn round the player
const BEAM_HEIGHT = QUALITY.mobile ? 18 : 26;
const ICON_PX = 128;
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
const ARROW = 'M12 2.5 19 20l-7-4-7 4z';

// --- The icons (the sprites' canvases and the map's pins share them) -------------------------------------------------
/** A mission's icon: a disc in its colour, a white glyph, the medal's ring round it; centred on (cx, cy), radius r */
export function drawMissionIcon(ctx, def, medal, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 12, 20, 0.82)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = def.colour || '#3fd6ff'; ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.strokeStyle = MEDAL_COLOURS[medal || 'none'];
  ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  const g = r * 0.46; // the glyph's half size
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (def.icon) {
    case 'rega': { // a cross
      const t = g * 0.36;
      ctx.fillRect(-t, -g, 2 * t, 2 * g); ctx.fillRect(-g, -t, 2 * g, 2 * t);
      break;
    }
    case 'snowcat': { // the cab over the tracks
      ctx.fillRect(-g * 0.55, -g * 0.75, g * 0.9, g * 0.7);
      ctx.beginPath(); ctx.roundRect(-g, 0, 2 * g, g * 0.62, g * 0.31); ctx.fill();
      ctx.fillStyle = def.colour; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * g * 0.36, g * 0.31, g * 0.1, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'blast': { // a burst
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, k = i % 2 ? 0.45 : 1; ctx.lineTo(Math.sin(a) * g * k, -Math.cos(a) * g * k); }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'police': { // a star
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, k = i % 2 ? 0.45 : 1; ctx.lineTo(Math.sin(a) * g * k, -Math.cos(a) * g * k); }
      ctx.closePath(); ctx.fill();
      break;
    }
    default:
      ctx.beginPath(); ctx.arc(0, 0, g * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// --- The markers in the world --------------------------------------------------------------------------------------
function createBeams(count) {
  const column = new THREE.CylinderGeometry(0.45, 0.6, BEAM_HEIGHT, QUALITY.mobile ? 8 : 14, 1, true).translate(0, BEAM_HEIGHT / 2, 0);
  const ring = new THREE.RingGeometry(START_RADIUS - 0.6, START_RADIUS, QUALITY.mobile ? 32 : 56).rotateX(-Math.PI / 2).translate(0, 0.35, 0);
  const geo = mergeGeometries([column.toNonIndexed(), ring.toNonIndexed()]);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const pulse = sin(time.mul(1.6)).mul(0.5).add(0.5);
  const y = positionGeometry.y;
  mat.colorNode = color(0xffffff); // (times the instance's colour)
  // the column fades with height and as the camera comes close (standing in it, it is barely there); the ring stays
  const near = smoothstep(6, 45, positionWorld.xz.sub(cameraPosition.xz).length());
  mat.opacityNode = smoothstep(BEAM_HEIGHT, 0.5, y).mul(0.24).mul(pulse.mul(0.4).add(0.6)).mul(near.mul(0.85).add(0.15)).add(step(y, 0.4).mul(0.5));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'MissionPins';
  mesh.renderOrder = 978;
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(0xffffff));
  return mesh;
}

export function buildMissionWorld(scene, { manager, progress, mapSystem, controllerManager }) {
  const pins = MISSIONS.map((def) => ({ def, ...missionPin(def, TELEPORT_LOCATIONS), y: null }));
  const group = new THREE.Group();
  group.name = 'MissionWorld';
  scene.add(group);
  const beams = createBeams(pins.length);
  group.add(beams);
  const _m = new THREE.Matrix4(), _c = new THREE.Color(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  pins.forEach((pin, i) => beams.setColorAt(i, _c.set(pin.def.colour || '#3fd6ff')));
  beams.instanceColor.needsUpdate = true;

  // the icons over the beams: a sprite each, its canvas redrawn when the medal changes
  for (const pin of pins) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ICON_PX;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteNodeMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 979;
    sprite.visible = false;
    group.add(sprite);
    Object.assign(pin, { canvas, tex, sprite });
  }
  const drawIcons = () => {
    for (const pin of pins) {
      const ctx = pin.canvas.getContext('2d');
      ctx.clearRect(0, 0, ICON_PX, ICON_PX);
      drawMissionIcon(ctx, pin.def, progress.medal(pin.def.id), ICON_PX / 2, ICON_PX / 2, ICON_PX / 2 - 4);
      pin.tex.needsUpdate = true;
    }
  };
  drawIcons();

  // --- HUD: the prompt, the waypoint's arrow, the points --------------------------------------------------------------
  const prompt = el('button', 'panel mission-prompt');
  prompt.type = 'button';
  prompt.hidden = true;
  const promptKey = el('kbd', null, 'Enter');
  const promptText = el('span', 'mission-prompt-text');
  const promptSub = el('span', 'mission-prompt-sub');
  const promptBody = el('span', 'mission-prompt-body');
  promptBody.append(promptText, promptSub);
  prompt.append(promptKey, promptBody);
  prompt.addEventListener('click', () => startInReach());
  document.body.append(prompt);

  const way = el('div', 'hud hud-top-center mission-waypoint');
  way.hidden = true;
  const wayPanel = el('div', 'panel mission-waypoint-panel');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('class', 'mission-arrow');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ARROW);
  arrow.append(path);
  const wayText = el('span', 'mission-waypoint-text');
  const wayClear = el('button', 'mission-waypoint-clear', '×');
  wayClear.type = 'button';
  wayClear.title = 'Clear the waypoint';
  wayClear.addEventListener('click', () => { if (mapSystem?.waypoint?.mission) mapSystem.waypoint = null; });
  wayPanel.append(arrow, wayText, wayClear);
  way.append(wayPanel);
  document.body.append(way);

  const score = el('button', 'panel mission-score');
  score.type = 'button';
  score.title = 'Missions: points and medals';
  const scoreStar = el('span', 'mission-score-star', '★');
  const scoreValue = el('span', 'mission-score-value');
  score.append(scoreStar, scoreValue, el('span', 'mission-score-label', 'Missions'));
  score.addEventListener('click', () => manager.showList());
  document.body.append(score);
  const renderScore = () => { scoreValue.textContent = progress.points.toLocaleString('en-US'); };
  renderScore();

  /** "+250" floating up from the score (and from `anchor`, the finish dialog's medal, when given) */
  function flashPoints(points, anchor = null) {
    if (!(points > 0)) return;
    for (const target of [score, anchor]) {
      if (!target?.isConnected) continue;
      const r = target.getBoundingClientRect();
      if (!r.width) continue; // (hidden: the score on a phone during a mission)
      const f = el('div', 'mission-points-pop', `+${points.toLocaleString('en-US')}`);
      f.style.left = `${r.left + r.width / 2}px`;
      f.style.top = `${r.top + r.height / 2}px`;
      document.body.append(f);
      setTimeout(() => f.remove(), 1800);
    }
    score.classList.remove('is-bumped');
    void score.offsetWidth; // (restart the animation)
    score.classList.add('is-bumped');
  }

  progress.subscribe(() => { drawIcons(); renderScore(); });

  // --- Starting from a pin --------------------------------------------------------------------------------------------
  let inReach = null;
  function startInReach() {
    if (!inReach || manager.active) return false;
    const id = inReach.def.id;
    if (mapSystem?.waypoint?.mission === id) mapSystem.waypoint = null;
    manager.start(id);
    return true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (!inReach || manager.active || manager.listOpen || mapSystem?.isFullMapOpen) return;
    if (isTypingInField(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // (a mission start in reach goes first: js/missions-manager.js)
    startInReach();
  }, { capture: true });

  // --- The map: the pins on the radar (in view) and the full map (all); a click on one sets the waypoint -------------
  const PIN_PX = { mini: 7, full: 11 };
  const overlay = {
    draw(ctx, v, isMinimap) {
      if (manager.active && isMinimap) return;
      const r = isMinimap ? PIN_PX.mini : PIN_PX.full;
      for (const pin of pins) {
        const x = v.toX(pin.x), y = v.toY(pin.z);
        if (Math.abs(x) > v.w * 0.5 - r || Math.abs(y) > v.h * 0.5 - r) continue;
        drawMissionIcon(ctx, pin.def, progress.medal(pin.def.id), x, y, r);
        if (!isMinimap && v.s >= 0.5) {
          ctx.font = '600 11px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8, 12, 20, 0.85)'; ctx.fillStyle = '#fff';
          ctx.strokeText(pin.def.title, x, y + r + 3); ctx.fillText(pin.def.title, x, y + r + 3);
        }
      }
    },
    /** The pin under (mx, my) (CSS px from the canvas' top left) */
    pick(mx, my, v) {
      let best = null, bd = PIN_PX.full + 6;
      for (const pin of pins) {
        const d = Math.hypot(v.toX(pin.x) + v.w / 2 - mx, v.toY(pin.z) + v.h / 2 - my);
        if (d < bd) { bd = d; best = pin; }
      }
      return best;
    },
    hover(mx, my, v) {
      const pin = overlay.pick(mx, my, v);
      if (!pin) return null;
      const medal = progress.medal(pin.def.id);
      return `Mission: ${pin.def.title}${medal ? ` · ${MEDAL_LABELS[medal]}` : ''} · Click to set the waypoint`;
    },
    click(mx, my, v) {
      const pin = overlay.pick(mx, my, v);
      if (!pin || !mapSystem) return false;
      mapSystem.waypoint = { x: pin.x, z: pin.z, name: pin.def.title, mission: pin.def.id };
      return true;
    }
  };
  if (mapSystem) (mapSystem.overlays ||= []).push(overlay);

  // --- Every frame (js/missions-manager.js onFrame) -------------------------------------------------------------------
  let frameN = 0;
  function update(active, dt, cm) {
    const ent = cm.getActiveEntity();
    const p = ent.position;
    group.visible = !active;
    // the markers within reach (re-placed when the set changes: a few times a second is enough)
    if (!active && (frameN++ % 10 === 0)) {
      pins.forEach((pin, i) => {
        pin.y = surfaceHeight(pin.x, pin.z); // (cheap; the streamed terrain may sharpen after the start)
        const d = Math.hypot(pin.x - p.x, pin.z - p.z);
        const near = d <= PIN_RADIUS;
        pin.sprite.visible = near;
        if (near) {
          // the icon keeps a readable size far off, small up close
          const s = Math.min(18, Math.max(3.2, d * 0.03));
          pin.sprite.scale.set(s, s, 1);
          pin.sprite.position.set(pin.x, pin.y + BEAM_HEIGHT * 0.45 + s * 0.5, pin.z);
        }
        beams.setMatrixAt(i, near ? _m.makeTranslation(pin.x, pin.y, pin.z) : hidden);
      });
      beams.instanceMatrix.needsUpdate = true;
      group.updateMatrixWorld(true); // (the scene's matrices are not updated automatically: js/main.js)
    }
    // the start circle the player stands in
    const reach = active ? null : missionInReach(pins, { x: p.x, z: p.z, y: p.y, mode: cm.activeMode });
    if ((reach?.def.id ?? null) !== (inReach?.def.id ?? null)) {
      inReach = reach;
      setMissionStartInReach(reach?.def.id);
      if (reach) {
        const medal = progress.medal(reach.def.id);
        promptText.textContent = `Start ${reach.def.title}`;
        promptSub.textContent = medal ? `${MEDAL_LABELS[medal]} · best medal` : progress.entry(reach.def.id) ? 'Completed · no medal yet' : `Up to ${FIRST_CLEAR_POINTS + MEDAL_POINTS.gold} points`;
        prompt.style.setProperty('--mission-colour', reach.def.colour || '#3fd6ff');
      }
    }
    prompt.hidden = !inReach || !!mapSystem?.isFullMapOpen;
    // the waypoint to a mission: an arrow and the distance (cleared on arrival)
    const wp = mapSystem?.waypoint;
    const def = wp?.mission && MISSIONS.find((m) => m.id === wp.mission);
    if (def && !active) {
      const d = Math.hypot(wp.x - p.x, wp.z - p.z);
      if (d < START_RADIUS) { mapSystem.waypoint = null; way.hidden = true; return; }
      way.hidden = false;
      const rel = relativeBearing(p.x, p.z, ent.heading, wp.x, wp.z);
      arrow.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
      arrow.style.color = def.colour;
      const text = `${def.title} · ${formatDistance(d)}`;
      if (wayText.textContent !== text) wayText.textContent = text;
    } else way.hidden = true;
  }

  return { update, flashPoints, pins, overlay };
}
