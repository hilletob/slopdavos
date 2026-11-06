import * as THREE from 'three/webgpu';
import { cameraPosition, color, positionGeometry, positionWorld, sin, smoothstep, step, time } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MISSIONS, formatDistance, relativeBearing } from './missions-data.js';
import { missionPin, missionInReach, START_RADIUS, MEDAL_COLOURS, MEDAL_LABELS, MEDAL_POINTS, FIRST_CLEAR_POINTS } from './missions-progress.js';
import { setMissionStartInReach } from './missions-manager.js';
import { surfaceHeight } from './terrain.js';
import { TELEPORT_LOCATIONS, isTypingInField } from './city-config.js';
import { QUALITY } from './quality.js';
import { t, setLocalizedText } from './i18n.js';
import { gameClock } from './game-clock.js';
import { missionOpen, nightVariantOpen, closedText, nextOpening } from './mission-windows.js';

// js/missions-world.js
// The missions in the open world (js/missions.js builds it with the manager): a pin at every mission's start — a
// column of light in the mission's colour with the start circle at its foot (one instanced mesh for all) and an icon
// over it ringed in the medal the player holds (one sprite each), drawn only within PIN_RADIUS; the prompt
// "Enter: Start …" (a button too, for touch screens) while the player stands in a start circle, on foot or in the
// mission's vehicle; the pins on the radar and the full map (js/nyc-map.js overlays; a click on one sets the map's
// waypoint, an arrow in the HUD points the way); the points in the HUD with a "+250" as they come in. Nothing of the
// world's pins shows while a mission runs. Outside its window (js/mission-windows.js) a pin is grey and says when it
// opens: Enter doesn't start it, U (or a tap on the prompt) fast-forwards until it does.

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
    case 'ski': { // two crossed skis (js/missions-data-snow.js: the slalom)
      ctx.lineWidth = g * 0.26;
      for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(-g * 0.8 * s, -g * 0.9); ctx.lineTo(g * 0.8 * s, g * 0.9); ctx.stroke(); }
      break;
    }
    case 'snowboard': { // a board on a ramp
      ctx.beginPath(); ctx.moveTo(-g, g * 0.85); ctx.lineTo(g, g * 0.85); ctx.lineTo(g, g * 0.15); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.rotate(-0.5); ctx.beginPath(); ctx.roundRect(-g * 0.85, -g * 0.62, g * 1.7, g * 0.36, g * 0.18); ctx.fill(); ctx.restore();
      break;
    }
    case 'bike': { // two wheels and the frame
      ctx.lineWidth = g * 0.17;
      for (const s of [1, -1]) { ctx.beginPath(); ctx.arc(g * 0.55 * s, g * 0.3, g * 0.42, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-g * 0.55, g * 0.3); ctx.lineTo(-g * 0.1, -g * 0.35); ctx.lineTo(g * 0.4, -g * 0.35); ctx.lineTo(g * 0.55, g * 0.3); ctx.moveTo(-g * 0.1, -g * 0.35); ctx.lineTo(0, g * 0.3); ctx.lineTo(g * 0.4, -g * 0.35); ctx.stroke();
      break;
    }
    case 'skate': { // a skate: the boot over the long blade (js/missions-data-ice.js)
      ctx.beginPath(); ctx.moveTo(-g * 0.55, -g * 0.85); ctx.lineTo(-g * 0.05, -g * 0.85); ctx.lineTo(0, -g * 0.1); ctx.lineTo(g * 0.7, g * 0.05); ctx.lineTo(g * 0.7, g * 0.4); ctx.lineTo(-g * 0.6, g * 0.4); ctx.closePath(); ctx.fill();
      ctx.lineWidth = g * 0.16; ctx.beginPath(); ctx.moveTo(-g * 0.9, g * 0.72); ctx.lineTo(g * 0.85, g * 0.72); ctx.quadraticCurveTo(g, g * 0.72, g, g * 0.5); ctx.stroke();
      break;
    }
    case 'hockey': { // a stick and the puck
      ctx.lineWidth = g * 0.2;
      ctx.beginPath(); ctx.moveTo(-g * 0.55, -g * 0.95); ctx.lineTo(g * 0.15, g * 0.55); ctx.lineTo(g * 0.85, g * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-g * 0.45, g * 0.62, g * 0.36, g * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'curling': { // a stone with its handle
      ctx.beginPath(); ctx.ellipse(0, g * 0.3, g * 0.85, g * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = g * 0.2; ctx.beginPath(); ctx.moveTo(-g * 0.35, -g * 0.15); ctx.lineTo(-g * 0.35, -g * 0.55); ctx.lineTo(g * 0.55, -g * 0.55); ctx.stroke();
      break;
    }
    case 'music': { // a pair of quavers (js/missions-data-fun.js: the BOX)
      ctx.lineWidth = g * 0.18;
      for (const x of [-0.55, 0.45]) { ctx.beginPath(); ctx.ellipse(g * x, g * 0.55, g * 0.3, g * 0.22, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(g * (x + 0.26), g * 0.5); ctx.lineTo(g * (x + 0.26), -g * 0.75); ctx.stroke(); }
      ctx.lineWidth = g * 0.3; ctx.beginPath(); ctx.moveTo(-g * 0.29, -g * 0.72); ctx.lineTo(g * 0.71, -g * 0.82); ctx.stroke();
      break;
    }
    case 'discoball': { // a mirror ball on its string, its facets' lines in the disc's colour (js/missions-data-fun.js: the Bolgenschanze)
      ctx.lineWidth = g * 0.12;
      ctx.beginPath(); ctx.moveTo(0, -g * 0.95); ctx.lineTo(0, -g * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, g * 0.15, g * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = def.colour;
      ctx.lineWidth = g * 0.08;
      for (const dy of [-0.3, 0.15, 0.6]) { const w = Math.sqrt(0.72 * 0.72 - (dy - 0.15) * (dy - 0.15)); ctx.beginPath(); ctx.moveTo(-g * w, g * dy); ctx.lineTo(g * w, g * dy); ctx.stroke(); }
      for (const k of [0.01, 0.4]) { ctx.beginPath(); ctx.ellipse(0, g * 0.15, g * k, g * 0.72, 0, 0, Math.PI * 2); ctx.stroke(); }
      break;
    }
    case 'foosball': { // a rod with a man and the ball
      ctx.lineWidth = g * 0.16;
      ctx.beginPath(); ctx.moveTo(-g, -g * 0.35); ctx.lineTo(g, -g * 0.35); ctx.stroke();
      ctx.fillRect(-g * 0.2, -g * 0.7, g * 0.4, g * 1.15);
      ctx.beginPath(); ctx.arc(g * 0.62, g * 0.55, g * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'gondola': { // the rope and a big cabin (js/missions-data-fun.js: the Jakobshornbahn)
      ctx.lineWidth = g * 0.14;
      ctx.beginPath(); ctx.moveTo(-g, -g * 0.85); ctx.lineTo(g, -g * 0.55); ctx.moveTo(0, -g * 0.7); ctx.lineTo(0, -g * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-g * 0.8, -g * 0.3, g * 1.6, g * 1.15, g * 0.22); ctx.fill();
      ctx.fillStyle = def.colour || '#2fb3ff'; for (const x of [-0.5, 0, 0.5]) ctx.fillRect(g * (x - 0.17), -g * 0.12, g * 0.34, g * 0.4);
      break;
    }
    case 'train': { // the Capricorn's nose
      ctx.beginPath(); ctx.roundRect(-g * 0.7, -g * 0.85, g * 1.4, g * 1.45, g * 0.35); ctx.fill();
      ctx.fillStyle = def.colour || '#e2001a'; ctx.fillRect(-g * 0.48, -g * 0.6, g * 0.96, g * 0.5);
      for (const x of [-0.35, 0.35]) { ctx.beginPath(); ctx.arc(g * x, g * 0.25, g * 0.12, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.fillRect(-g * 0.75, g * 0.72, g * 1.5, g * 0.14);
      break;
    }
    case 'sledge': { // a horn sledge from the side: the runner curving up into the horn, the seat (js/missions-data-sledge.js)
      ctx.lineWidth = g * 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-g * 0.95, g * 0.6); ctx.lineTo(g * 0.35, g * 0.6); ctx.quadraticCurveTo(g * 0.85, g * 0.6, g * 0.8, -g * 0.1); ctx.quadraticCurveTo(g * 0.78, -g * 0.75, g * 0.45, -g * 0.8); ctx.stroke();
      ctx.fillRect(-g * 0.9, -g * 0.05, g * 1.45, g * 0.22);
      for (const x of [-0.7, -0.15, 0.35]) ctx.fillRect(g * (x - 0.07), 0, g * 0.14, g * 0.6);
      break;
    }
    case 'mine': { // hammer and pick crossed, the miners' sign (js/missions-data-mine.js)
      ctx.lineWidth = g * 0.17; ctx.lineCap = 'round';
      for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(-g * 0.8 * s, g * 0.85); ctx.lineTo(g * 0.55 * s, -g * 0.5); ctx.stroke(); }
      ctx.save(); ctx.translate(g * 0.55, -g * 0.5); ctx.rotate(Math.PI / 4); ctx.fillRect(-g * 0.4, -g * 0.17, g * 0.8, g * 0.34); ctx.restore();
      ctx.save(); ctx.translate(-g * 0.55, -g * 0.5); ctx.rotate(-Math.PI / 4); ctx.beginPath(); ctx.moveTo(-g * 0.55, g * 0.1); ctx.quadraticCurveTo(0, -g * 0.35, g * 0.55, g * 0.1); ctx.lineTo(0, -g * 0.05); ctx.closePath(); ctx.fill(); ctx.restore();
      break;
    }
    case 'golf': { // the flag in the hole and the ball (js/missions-data-golf.js)
      ctx.lineWidth = g * 0.14;
      ctx.beginPath(); ctx.moveTo(-g * 0.25, g * 0.75); ctx.lineTo(-g * 0.25, -g * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-g * 0.25, -g * 0.95); ctx.lineTo(g * 0.75, -g * 0.62); ctx.lineTo(-g * 0.25, -g * 0.3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-g * 0.25, g * 0.8, g * 0.6, g * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(g * 0.6, g * 0.5, g * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    // --- js/missions-data-local.js ---
    case 'beer': { // a crate with bottles
      ctx.fillRect(-g * 0.85, -g * 0.05, g * 1.7, g * 0.9);
      ctx.fillStyle = def.colour || '#f5c518';
      for (const x of [-0.55, 0, 0.55]) { ctx.fillRect(g * (x - 0.13), -g * 0.85, g * 0.26, g * 0.85); ctx.fillRect(g * (x - 0.07), -g * 1.0, g * 0.14, g * 0.2); }
      ctx.fillStyle = '#fff'; for (const x of [-0.55, 0, 0.55]) ctx.fillRect(g * (x - 0.15), g * 0.15, g * 0.3, g * 0.08);
      break;
    }
    case 'croissant': { // a Gipfeli
      ctx.beginPath(); ctx.moveTo(-g, g * 0.35); ctx.quadraticCurveTo(-g * 0.7, -g * 0.7, 0, -g * 0.6); ctx.quadraticCurveTo(g * 0.7, -g * 0.7, g, g * 0.35); ctx.quadraticCurveTo(g * 0.6, -g * 0.05, 0, -g * 0.05); ctx.quadraticCurveTo(-g * 0.6, -g * 0.05, -g, g * 0.35); ctx.fill();
      ctx.strokeStyle = def.colour || '#d98b2b'; ctx.lineWidth = g * 0.1; for (const x of [-0.35, 0, 0.35]) { ctx.beginPath(); ctx.moveTo(g * x, -g * 0.55); ctx.lineTo(g * x, -g * 0.1); ctx.stroke(); }
      break;
    }
    case 'cheese': { // a half wheel under the grill
      ctx.fillRect(-g * 0.9, -g * 0.95, g * 1.8, g * 0.22);
      ctx.beginPath(); ctx.moveTo(-g * 0.85, g * 0.85); ctx.lineTo(-g * 0.85, -g * 0.1); ctx.arc(0, -g * 0.1, g * 0.85, Math.PI, 0); ctx.lineTo(g * 0.85, g * 0.85); ctx.fill();
      ctx.fillStyle = def.colour || '#ffb627'; for (const [x, y] of [[-0.3, 0.2], [0.35, 0.45], [0.05, -0.15]]) { ctx.beginPath(); ctx.arc(g * x, g * y, g * 0.13, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'ibex': { // the head with the long curved horns
      ctx.beginPath(); ctx.ellipse(0, g * 0.45, g * 0.32, g * 0.48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = g * 0.2;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * g * 0.15, g * 0.05); ctx.quadraticCurveTo(s * g * 0.35, -g * 1.1, s * g * 0.95, -g * 0.55); ctx.stroke(); }
      break;
    }
    case 'squirrel': { // sitting up, the bushy tail curled behind
      ctx.beginPath(); ctx.ellipse(-g * 0.15, g * 0.25, g * 0.38, g * 0.55, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-g * 0.05, -g * 0.45, g * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-g * 0.2, -g * 0.65); ctx.lineTo(-g * 0.1, -g * 0.95); ctx.lineTo(g * 0.05, -g * 0.65); ctx.fill();
      ctx.lineWidth = g * 0.4; ctx.beginPath(); ctx.moveTo(g * 0.15, g * 0.75); ctx.quadraticCurveTo(g * 1.05, g * 0.5, g * 0.6, -g * 0.5); ctx.stroke();
      break;
    }
    case 'tennis': { // a racket and the ball
      ctx.lineWidth = g * 0.16;
      ctx.beginPath(); ctx.ellipse(-g * 0.15, -g * 0.3, g * 0.45, g * 0.6, -0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g * 0.2, g * 0.2); ctx.lineTo(g * 0.75, g * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(g * 0.65, -g * 0.65, g * 0.24, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'slide': { // a tube winding down into the water
      ctx.lineWidth = g * 0.28;
      ctx.beginPath(); ctx.moveTo(-g * 0.8, -g * 0.9); ctx.bezierCurveTo(g * 1.2, -g * 0.8, -g * 1.2, g * 0.1, g * 0.6, g * 0.35); ctx.stroke();
      ctx.lineWidth = g * 0.12; ctx.beginPath(); ctx.moveTo(-g, g * 0.8); ctx.quadraticCurveTo(-g * 0.5, g * 0.6, 0, g * 0.8); ctx.quadraticCurveTo(g * 0.5, g, g, g * 0.8); ctx.stroke();
      break;
    }
    case 'brush': { // a brush and a stroke of paint
      ctx.save(); ctx.rotate(-0.7);
      ctx.fillRect(-g * 0.12, -g * 1.0, g * 0.24, g * 1.1);
      ctx.beginPath(); ctx.moveTo(-g * 0.16, g * 0.1); ctx.lineTo(g * 0.16, g * 0.1); ctx.lineTo(0, g * 0.6); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#1f3fbf'; ctx.beginPath(); ctx.ellipse(g * 0.35, g * 0.65, g * 0.5, g * 0.18, -0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'shovel': { // a snow pusher: the shaft and the wide blade (js/missions-data-work.js)
      ctx.lineWidth = g * 0.17;
      ctx.beginPath(); ctx.moveTo(g * 0.55, -g * 0.9); ctx.lineTo(-g * 0.15, g * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g * 0.3, -g * 0.9); ctx.lineTo(g * 0.8, -g * 0.9); ctx.stroke();
      ctx.save(); ctx.translate(-g * 0.25, g * 0.55); ctx.rotate(-0.5); ctx.fillRect(-g * 0.7, -g * 0.2, g * 1.4, g * 0.4); ctx.restore();
      break;
    }
    case 'snowblower': { // the blower's body and the arc of snow out of its chute
      ctx.fillRect(-g * 0.9, g * 0.1, g * 1.3, g * 0.6);
      ctx.fillRect(-g * 0.55, -g * 0.35, g * 0.6, g * 0.45);
      ctx.fillRect(g * 0.15, -g * 0.55, g * 0.18, g * 0.7);
      ctx.lineWidth = g * 0.12; ctx.setLineDash([g * 0.14, g * 0.12]);
      ctx.beginPath(); ctx.moveTo(g * 0.25, -g * 0.6); ctx.quadraticCurveTo(g * 0.7, -g * 1.15, g * 0.95, -g * 0.1); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'crane': { // a tower crane: the mast, the long jib, the hook on its rope (js/missions-data-work.js)
      ctx.fillRect(-g * 0.45, -g * 0.65, g * 0.2, g * 1.6);
      ctx.fillRect(-g * 0.95, -g * 0.7, g * 1.95, g * 0.16);
      ctx.fillRect(-g * 0.95, -g * 0.7, g * 0.28, g * 0.4);
      ctx.fillRect(g * 0.62, -g * 0.55, g * 0.07, g * 0.75);
      ctx.fillRect(g * 0.46, g * 0.2, g * 0.38, g * 0.3);
      break;
    }
    case 'snowtruck': { // a tipper: the cab, the raised bed, the snow sliding off
      ctx.fillRect(g * 0.25, -g * 0.15, g * 0.6, g * 0.7);
      ctx.fillRect(-g * 0.95, g * 0.4, g * 1.8, g * 0.15);
      ctx.save(); ctx.translate(-g * 0.9, g * 0.35); ctx.rotate(-0.42); ctx.fillRect(0, -g * 0.55, g * 1.15, g * 0.55); ctx.restore();
      for (const x of [-0.55, 0.5]) { ctx.beginPath(); ctx.arc(g * x, g * 0.68, g * 0.18, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'mower': { // a ride-on mower from the side: the seat, the wheels, the deck
      ctx.fillRect(-g * 0.85, -g * 0.05, g * 1.7, g * 0.4);
      ctx.fillRect(-g * 0.55, -g * 0.55, g * 0.18, g * 0.5); ctx.fillRect(-g * 0.55, -g * 0.15, g * 0.5, g * 0.15);
      ctx.lineWidth = g * 0.12; ctx.beginPath(); ctx.moveTo(g * 0.35, -g * 0.05); ctx.lineTo(g * 0.15, -g * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(-g * 0.55, g * 0.55, g * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(g * 0.6, g * 0.6, g * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'garbage': { // a refuse truck: the cab, the body, the hopper
      ctx.fillRect(-g * 0.95, -g * 0.55, g * 1.2, g * 1.0);
      ctx.beginPath(); ctx.moveTo(g * 0.3, -g * 0.25); ctx.lineTo(g * 0.75, -g * 0.25); ctx.lineTo(g * 0.95, g * 0.1); ctx.lineTo(g * 0.95, g * 0.45); ctx.lineTo(g * 0.3, g * 0.45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = def.colour || '#7c8b3a';
      for (const x of [-0.6, 0.55]) { ctx.beginPath(); ctx.arc(g * x, g * 0.55, g * 0.22, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff'; for (const x of [-0.6, 0.55]) { ctx.beginPath(); ctx.arc(g * x, g * 0.55, g * 0.12, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'flower': { // an Alpenrose: five petals round the middle
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.sin(a) * g * 0.45, -Math.cos(a) * g * 0.45, g * 0.32, g * 0.24, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = def.colour || '#e0457b'; ctx.beginPath(); ctx.arc(0, 0, g * 0.22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'mushroom': { // a bolete: the round cap over the stout stem
      ctx.beginPath(); ctx.ellipse(0, -g * 0.1, g * 0.95, g * 0.62, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-g * 0.32, -g * 0.1); ctx.lineTo(-g * 0.4, g * 0.85); ctx.lineTo(g * 0.4, g * 0.85); ctx.lineTo(g * 0.32, -g * 0.1); ctx.closePath(); ctx.fill();
      break;
    }
    // --- js/missions-data-sport.js ---
    case 'xcski': { // a cross-country skier striding: body, poles, the long skis
      ctx.lineWidth = g * 0.17;
      ctx.beginPath(); ctx.arc(g * 0.15, -g * 0.72, g * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(g * 0.05, -g * 0.5); ctx.lineTo(-g * 0.15, g * 0.05); ctx.lineTo(g * 0.35, g * 0.45); ctx.moveTo(-g * 0.15, g * 0.05); ctx.lineTo(-g * 0.55, g * 0.45); ctx.moveTo(g * 0.0, -g * 0.35); ctx.lineTo(g * 0.55, -g * 0.05); ctx.stroke();
      ctx.lineWidth = g * 0.09; ctx.beginPath(); ctx.moveTo(g * 0.55, -g * 0.05); ctx.lineTo(g * 0.2, g * 0.6); ctx.moveTo(-g * 0.05, -g * 0.3); ctx.lineTo(-g * 0.75, g * 0.45); ctx.stroke();
      ctx.lineWidth = g * 0.12; ctx.beginPath(); ctx.moveTo(-g * 0.95, g * 0.62); ctx.lineTo(g * 0.95, g * 0.62); ctx.stroke();
      break;
    }
    case 'minigolf': { // the putter and the ball by the cup
      ctx.lineWidth = g * 0.16;
      ctx.beginPath(); ctx.moveTo(g * 0.55, -g * 0.95); ctx.lineTo(-g * 0.1, g * 0.45); ctx.stroke();
      ctx.fillRect(-g * 0.45, g * 0.38, g * 0.5, g * 0.22);
      ctx.beginPath(); ctx.arc(g * 0.45, g * 0.55, g * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-g * 0.1, g * 0.85, g * 0.75, g * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ice-minigolf': { // the hockey stick and the puck by the hole
      ctx.lineWidth = g * 0.16;
      ctx.beginPath(); ctx.moveTo(g * 0.55, -g * 0.95); ctx.lineTo(-g * 0.15, g * 0.42); ctx.lineTo(-g * 0.75, g * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(g * 0.45, g * 0.5, g * 0.3, g * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-g * 0.1, g * 0.85, g * 0.75, g * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'darts': { // the board's rings and a dart in the bull
      ctx.lineWidth = g * 0.13;
      for (const r of [0.85, 0.5]) { ctx.beginPath(); ctx.arc(-g * 0.1, g * 0.1, g * r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(-g * 0.1, g * 0.1, g * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = g * 0.12; ctx.beginPath(); ctx.moveTo(-g * 0.1, g * 0.1); ctx.lineTo(g * 0.75, -g * 0.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g * 0.6, -g * 0.95); ctx.lineTo(g * 0.95, -g * 0.95); ctx.lineTo(g * 0.95, -g * 0.6); ctx.closePath(); ctx.fill();
      break;
    }
    case 'ropes': { // a platform on its post and the cable going off it (js/missions-data-outdoor.js)
      ctx.lineWidth = g * 0.17;
      ctx.beginPath(); ctx.moveTo(-g * 0.6, -g * 0.95); ctx.lineTo(-g * 0.6, g * 0.95); ctx.moveTo(-g * 0.95, g * 0.15); ctx.lineTo(-g * 0.25, g * 0.15); ctx.stroke();
      ctx.lineWidth = g * 0.11;
      ctx.beginPath(); ctx.moveTo(-g * 0.6, -g * 0.6); ctx.lineTo(g * 0.95, -g * 0.15); ctx.moveTo(-g * 0.25, g * 0.15); ctx.quadraticCurveTo(g * 0.35, g * 0.6, g * 0.95, g * 0.3); ctx.stroke();
      break;
    }
    case 'tbar': { // a T-bar hanging from the rope (js/missions-data-resort.js)
      ctx.lineWidth = g * 0.15;
      ctx.beginPath(); ctx.moveTo(-g * 0.95, -g * 0.7); ctx.lineTo(g * 0.95, -g * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -g * 0.55); ctx.lineTo(0, g * 0.6); ctx.moveTo(-g * 0.6, g * 0.6); ctx.lineTo(g * 0.6, g * 0.6); ctx.stroke();
      break;
    }
    case 'wax': { // the waxing iron over a ski
      ctx.beginPath(); ctx.moveTo(-g * 0.8, g * 0.1); ctx.lineTo(g * 0.7, g * 0.1); ctx.quadraticCurveTo(g * 0.7, -g * 0.55, -g * 0.1, -g * 0.55); ctx.lineTo(-g * 0.4, -g * 0.55); ctx.closePath(); ctx.fill();
      ctx.lineWidth = g * 0.17; ctx.beginPath(); ctx.moveTo(-g * 0.95, g * 0.6); ctx.lineTo(g * 0.8, g * 0.6); ctx.quadraticCurveTo(g, g * 0.6, g, g * 0.3); ctx.stroke();
      break;
    }
    case 'parking': { // the P of a car park
      ctx.lineWidth = g * 0.3;
      ctx.beginPath(); ctx.moveTo(-g * 0.4, g * 0.85); ctx.lineTo(-g * 0.4, -g * 0.8); ctx.lineTo(g * 0.1, -g * 0.8); ctx.arc(g * 0.1, -g * 0.3, g * 0.5, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-g * 0.4, g * 0.2); ctx.stroke();
      break;
    }
    case 'hammer': { // Nageln: the hammer over its nail (js/missions-data-bars.js)
      ctx.save(); ctx.rotate(-0.6);
      ctx.fillRect(-g * 0.12, -g * 0.55, g * 0.24, g * 1.45);
      ctx.beginPath(); ctx.moveTo(-g * 0.85, -g * 0.95); ctx.lineTo(g * 0.25, -g * 0.95); ctx.lineTo(g * 0.95, -g * 0.7); ctx.lineTo(g * 0.25, -g * 0.45); ctx.lineTo(-g * 0.85, -g * 0.45); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'coffee': { // a cup on its saucer, the steam over it (js/missions-data-bars.js)
      ctx.beginPath(); ctx.moveTo(-g * 0.7, -g * 0.15); ctx.lineTo(g * 0.55, -g * 0.15); ctx.quadraticCurveTo(g * 0.55, g * 0.65, 0, g * 0.65); ctx.quadraticCurveTo(-g * 0.7, g * 0.65, -g * 0.7, -g * 0.15); ctx.fill();
      ctx.fillRect(-g * 0.9, g * 0.75, g * 1.7, g * 0.17);
      ctx.lineWidth = g * 0.16; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(g * 0.6, g * 0.15, g * 0.24, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      for (const x of [-0.35, 0.1]) { ctx.beginPath(); ctx.moveTo(g * x, -g * 0.4); ctx.quadraticCurveTo(g * (x + 0.22), -g * 0.65, g * x, -g * 0.95); ctx.stroke(); }
      break;
    }
    case 'motorcade': { // a limousine with its blue light (js/missions-data-wef.js)
      ctx.beginPath(); ctx.moveTo(-g * 1.05, g * 0.45); ctx.lineTo(-g * 1.05, g * 0.05); ctx.lineTo(-g * 0.55, -g * 0.05); ctx.lineTo(-g * 0.25, -g * 0.45); ctx.lineTo(g * 0.4, -g * 0.45); ctx.lineTo(g * 0.7, -g * 0.05); ctx.lineTo(g * 1.05, g * 0.08); ctx.lineTo(g * 1.05, g * 0.45); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(-g * 0.55, g * 0.5, g * 0.2, 0, Math.PI * 2); ctx.arc(g * 0.58, g * 0.5, g * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-g * 0.12, -g * 0.8, g * 0.3, g * 0.3);
      break;
    }
    case 'megaphone': { // a megaphone, calling (js/missions-data-wef.js)
      ctx.beginPath(); ctx.moveTo(-g * 0.85, -g * 0.2); ctx.lineTo(g * 0.45, -g * 0.8); ctx.lineTo(g * 0.45, g * 0.6); ctx.lineTo(-g * 0.85, g * 0.2); ctx.closePath(); ctx.fill();
      ctx.fillRect(-g * 0.6, g * 0.2, g * 0.28, g * 0.6);
      ctx.lineWidth = g * 0.16; ctx.beginPath(); ctx.arc(g * 0.45, -g * 0.1, g * 0.55, -0.6, 0.6); ctx.stroke();
      break;
    }
    case 'flame': { // a flaming shot: the flame over its glass (js/missions-data-gastro.js)
      ctx.beginPath(); ctx.moveTo(0, -g * 1.05); ctx.bezierCurveTo(g * 0.75, -g * 0.35, g * 0.4, g * 0.15, 0, g * 0.15); ctx.bezierCurveTo(-g * 0.4, g * 0.15, -g * 0.75, -g * 0.35, 0, -g * 1.05); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-g * 0.45, g * 0.3); ctx.lineTo(g * 0.45, g * 0.3); ctx.lineTo(g * 0.32, g * 1.0); ctx.lineTo(-g * 0.32, g * 1.0); ctx.closePath(); ctx.fill();
      break;
    }
    case 'flaemmli': { // a Flämmli: the espresso cup on its saucer, a flame out of it (js/missions-data-gastro.js)
      ctx.beginPath(); ctx.moveTo(-g * 0.1, -g * 1.05); ctx.bezierCurveTo(g * 0.55, -g * 0.55, g * 0.35, -g * 0.15, 0, -g * 0.12); ctx.bezierCurveTo(-g * 0.35, -g * 0.15, -g * 0.6, -g * 0.5, -g * 0.1, -g * 1.05); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-g * 0.7, 0); ctx.lineTo(g * 0.55, 0); ctx.quadraticCurveTo(g * 0.55, g * 0.7, 0, g * 0.7); ctx.quadraticCurveTo(-g * 0.7, g * 0.7, -g * 0.7, 0); ctx.fill();
      ctx.fillRect(-g * 0.9, g * 0.8, g * 1.7, g * 0.16);
      ctx.lineWidth = g * 0.15; ctx.beginPath(); ctx.arc(g * 0.6, g * 0.28, g * 0.22, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      break;
    }
    case 'summit': { // a peak with the sun coming up behind it
      ctx.beginPath(); ctx.arc(g * 0.45, -g * 0.45, g * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-g * 0.95, g * 0.8); ctx.lineTo(-g * 0.15, -g * 0.55); ctx.lineTo(g * 0.2, g * 0.05); ctx.lineTo(g * 0.45, -g * 0.1); ctx.lineTo(g * 0.95, g * 0.8); ctx.closePath(); ctx.fill();
      break;
    }
    case 'lake': { // a lake under a ridge
      ctx.lineWidth = g * 0.14;
      ctx.beginPath(); ctx.moveTo(-g * 0.95, g * 0.05); ctx.lineTo(-g * 0.35, -g * 0.75); ctx.lineTo(g * 0.1, -g * 0.2); ctx.lineTo(g * 0.45, -g * 0.55); ctx.lineTo(g * 0.95, g * 0.05); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, g * 0.55, g * 0.85, g * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'snowshoe': { // a snowshoe: the oval and its lattice
      ctx.lineWidth = g * 0.17;
      ctx.beginPath(); ctx.ellipse(0, 0, g * 0.55, g * 1.0, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = g * 0.11;
      for (const y of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(-g * 0.45, g * y); ctx.lineTo(g * 0.45, g * y); ctx.stroke(); }
      break;
    }
    case 'cast': { // a leg in plaster, the foot to the right
      ctx.beginPath(); ctx.roundRect(-g * 0.42, -g * 1.0, g * 0.84, g * 1.55, g * 0.14); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-g * 0.42, g * 0.32, g * 1.3, g * 0.62, g * 0.24); ctx.fill();
      ctx.strokeStyle = def.colour || '#c8423b'; ctx.lineWidth = g * 0.1;
      for (const y of [-0.62, -0.25, 0.12]) { ctx.beginPath(); ctx.moveTo(-g * 0.42, g * y); ctx.lineTo(g * 0.42, g * (y + 0.16)); ctx.stroke(); }
      ctx.strokeStyle = '#fff';
      break;
    }
    case 'pizza': { // a slice: the crust, the point, the salami
      ctx.beginPath(); ctx.moveTo(0, g * 1.0); ctx.lineTo(-g * 0.85, -g * 0.55); ctx.quadraticCurveTo(0, -g * 1.05, g * 0.85, -g * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = def.colour || '#e4572e';
      for (const [x, y] of [[-0.28, -0.32], [0.3, -0.38], [0.02, 0.2]]) { ctx.beginPath(); ctx.arc(g * x, g * y, g * 0.17, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff';
      break;
    }
    case 'eyechart': { // a Landolt ring and a smaller one under it (js/missions-data-expert.js)
      ctx.lineWidth = g * 0.26;
      ctx.beginPath(); ctx.arc(0, -g * 0.28, g * 0.56, 0.42, Math.PI * 2 - 0.42); ctx.stroke();
      ctx.lineWidth = g * 0.13;
      ctx.beginPath(); ctx.arc(0, g * 0.72, g * 0.26, -Math.PI / 2 + 0.5, -Math.PI / 2 + Math.PI * 2 - 0.5); ctx.stroke();
      break;
    }
    case 'snowprofile': { // a profile's hardness bars, growing from the right
      for (const [y, w] of [[-0.8, 0.5], [-0.4, 1.1], [0, 0.4], [0.4, 1.8], [0.8, 0.9]]) ctx.fillRect(g * (0.9 - w), g * (y - 0.16), g * w, g * 0.32);
      break;
    }
    case 'skateboard': { // the bowl's curve and a board over its lip
      ctx.lineWidth = g * 0.16;
      ctx.beginPath(); ctx.moveTo(-g * 0.95, -g * 0.1); ctx.quadraticCurveTo(-g * 0.9, g * 0.85, 0, g * 0.85); ctx.quadraticCurveTo(g * 0.9, g * 0.85, g * 0.95, -g * 0.1); ctx.stroke();
      ctx.save(); ctx.translate(g * 0.1, -g * 0.45); ctx.rotate(-0.35);
      ctx.beginPath(); ctx.roundRect(-g * 0.7, -g * 0.11, g * 1.4, g * 0.22, g * 0.11); ctx.fill();
      for (const x of [-0.42, 0.42]) { ctx.beginPath(); ctx.arc(g * x, g * 0.2, g * 0.11, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'quad': { // a quad from the side: the fat wheels, the body, the bars (js/missions-data-rural.js)
      for (const x of [-0.58, 0.58]) { ctx.beginPath(); ctx.arc(g * x, g * 0.5, g * 0.36, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillRect(-g * 0.72, -g * 0.08, g * 1.44, g * 0.3);
      ctx.fillRect(-g * 0.42, -g * 0.34, g * 0.6, g * 0.26);
      ctx.lineWidth = g * 0.13;
      ctx.beginPath(); ctx.moveTo(g * 0.3, -g * 0.08); ctx.lineTo(g * 0.48, -g * 0.62); ctx.lineTo(g * 0.76, -g * 0.62); ctx.stroke();
      break;
    }
    case 'paraglider': { // the wing's arc, its lines down to the pilot (js/missions-data-paraglide.js)
      ctx.lineWidth = g * 0.34;
      ctx.beginPath(); ctx.arc(0, g * 0.55, g * 1.05, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
      ctx.lineWidth = g * 0.07;
      ctx.beginPath();
      for (const a of [1.22, 1.38, 1.62, 1.78]) { ctx.moveTo(Math.cos(Math.PI * a) * g * 1.0, g * 0.55 + Math.sin(Math.PI * a) * g * 1.0); ctx.lineTo(0, g * 0.5); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, g * 0.66, g * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'biogas': { // the digester's dome over its wall, and a green leaf
      ctx.beginPath(); ctx.arc(0, g * 0.1, g * 0.8, Math.PI, 0); ctx.fill();
      ctx.fillRect(-g * 0.8, g * 0.1, g * 1.6, g * 0.6);
      ctx.fillStyle = '#2f8f35';
      ctx.beginPath(); ctx.moveTo(0, g * 0.55); ctx.quadraticCurveTo(-g * 0.5, -g * 0.05, 0, -g * 0.5); ctx.quadraticCurveTo(g * 0.5, -g * 0.05, 0, g * 0.55); ctx.fill();
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

export function buildMissionWorld(scene, { manager, progress, mapSystem, controllerManager, fastForward = null }) {
  const pins = MISSIONS.map((def) => ({ def, ...missionPin(def, TELEPORT_LOCATIONS), y: null, closed: false, closedLabel: '' }));
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
  // (a closed pin's icon goes grey and fades, as does its beam: `ctx.filter` where the browser has it, the fade anyway)
  const drawPinIcon = (ctx, pin, x, y, r) => {
    if (pin.closed) { ctx.save(); ctx.filter = 'grayscale(1)'; ctx.globalAlpha = 0.6; }
    drawMissionIcon(ctx, pin.def, progress.medal(pin.def.id), x, y, r);
    if (pin.closed) ctx.restore();
  };
  const drawIcon = (pin) => {
    const ctx = pin.canvas.getContext('2d');
    ctx.clearRect(0, 0, ICON_PX, ICON_PX);
    drawPinIcon(ctx, pin, ICON_PX / 2, ICON_PX / 2, ICON_PX / 2 - 4);
    pin.tex.needsUpdate = true;
  };
  const drawIcons = () => { for (const pin of pins) drawIcon(pin); };
  drawIcons();
  // Who is open now: redrawn only for the pins that changed; their labels when one changes or a new day begins
  let labelsDay = -1;
  function refreshWindows() {
    const total = gameClock.total, day = gameClock.day;
    let recoloured = false;
    pins.forEach((pin, i) => {
      const closed = !missionOpen(pin.def, total);
      if (closed !== pin.closed) {
        pin.closed = closed;
        drawIcon(pin);
        beams.setColorAt(i, closed ? _c.set(0x4a4f57) : _c.set(pin.def.colour || '#3fd6ff'));
        recoloured = true;
        pin.closedLabel = closed ? closedText(pin.def, total) : '';
      } else if (closed && day !== labelsDay) pin.closedLabel = closedText(pin.def, total);
    });
    labelsDay = day;
    if (recoloured) beams.instanceColor.needsUpdate = true;
  }
  refreshWindows();

  // --- HUD: the prompt, the waypoint's arrow, the points --------------------------------------------------------------
  const prompt = el('button', 'panel mission-prompt');
  prompt.type = 'button';
  prompt.hidden = true;
  const promptKey = el('kbd', null, 'Enter');
  const promptText = el('span', 'mission-prompt-text');
  const promptSub = el('span', 'mission-prompt-sub');
  const promptBody = el('span', 'mission-prompt-body');
  promptBody.append(promptText, promptSub);
  const promptWait = el('span', 'mission-prompt-wait', 'Wait until then');
  promptWait.hidden = true;
  prompt.append(promptKey, promptBody, promptWait);
  prompt.addEventListener('click', () => { if (inReach?.pin.closed) waitForReach(); else startInReach(); });
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
    if (!inReach || manager.active || inReach.pin.closed) return false;
    const id = inReach.def.id;
    if (mapSystem?.waypoint?.mission === id) mapSystem.waypoint = null;
    // (by night the night variant, where a mission has one)
    manager.start(id, { night: nightVariantOpen(inReach.def, gameClock.total) });
    return true;
  }
  function waitForReach() {
    if (!inReach?.pin.closed || manager.active || !fastForward) return false;
    fastForward.go(nextOpening(inReach.def, gameClock.total), () => { refreshWindows(); promptKeyState = null; });
    return true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyU' && inReach?.pin.closed && !manager.active && !manager.listOpen && !mapSystem?.isFullMapOpen && !isTypingInField(e) && !e.repeat) { e.preventDefault(); waitForReach(); return; }
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (!inReach || inReach.pin.closed || manager.active || manager.listOpen || mapSystem?.isFullMapOpen) return;
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
        drawPinIcon(ctx, pin, x, y, r);
        if (!isMinimap && v.s >= 0.5) {
          ctx.font = '600 11px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8, 12, 20, 0.85)'; ctx.fillStyle = '#fff';
          ctx.strokeText(t(pin.def.title), x, y + r + 3); ctx.fillText(t(pin.def.title), x, y + r + 3);
          if (pin.closed) {
            ctx.font = '500 10px Inter, system-ui, sans-serif'; ctx.fillStyle = '#c3c8d0';
            ctx.strokeText(t(pin.closedLabel), x, y + r + 16); ctx.fillText(t(pin.closedLabel), x, y + r + 16);
          }
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
      const when = pin.closed ? ` · ${t(pin.closedLabel)}` : '';
      return t(`Mission: ${t(pin.def.title)}${medal ? ` · ${t(MEDAL_LABELS[medal])}` : ''}${when} · Click to set the waypoint`);
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
  let promptKeyState = null;
  function update(active, dt, cm) {
    const ent = cm.getActiveEntity();
    const p = ent.position;
    group.visible = !active;
    if (!active && frameN % 30 === 0) refreshWindows();
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
    inReach = reach;
    // (only when the pin, its window or what it says has changed: no DOM per frame)
    const keyState = reach ? `${reach.def.id}|${reach.pin.closedLabel}` : null;
    if (keyState !== promptKeyState) {
      promptKeyState = keyState;
      const closed = !!reach?.pin.closed;
      // (a closed start isn't a start: the shared keys and touch buttons go on as if there were none, js/gta.js)
      setMissionStartInReach(closed ? null : reach?.def.id);
      if (reach) {
        const medal = progress.medal(reach.def.id);
        setLocalizedText(promptText, closed ? reach.def.title : `Start ${reach.def.title}`);
        if (closed) setLocalizedText(promptSub, reach.pin.closedLabel);
        else promptSub.textContent = medal ? `${MEDAL_LABELS[medal]} · best medal` : progress.entry(reach.def.id) ? 'Completed · no medal yet' : `Up to ${FIRST_CLEAR_POINTS + MEDAL_POINTS.gold} points`;
        promptKey.textContent = closed ? 'U' : 'Enter';
        promptWait.hidden = !closed;
        prompt.classList.toggle('is-closed', closed);
        prompt.style.setProperty('--mission-colour', closed ? '#8b93a1' : reach.def.colour || '#3fd6ff');
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
      if (wayText.textContent !== t(text)) setLocalizedText(wayText, text);
    } else way.hidden = true;
  }

  return { update, flashPoints, pins, overlay };
}
