import * as THREE from 'three/webgpu';
import { bryantParkLawn } from './landmarks.js';
import { groundHeight, cameraGround } from './terrain.js';
import { lv95ToWorld } from './davos-frame.js';

// js/cameras.js
// Multi-camera system supporting Third-Person Chase (with mouse/touch orbit + zoom),
// Low-Angle Action Cam, POV/Cockpit Cam, 7 Davos viewpoints, and Auto-Director Drone.

const CAMERA_PRESETS = [
  { id: 'chase',       name: '3rd-Person Chase',         short: 'Chase',       category: 'follow', fov: 56 },
  { id: 'action',      name: 'Low-Angle Action',         short: 'Action',      category: 'follow', fov: 60 },
  { id: 'pov',         name: 'First-Person / Cockpit',   short: 'POV / Dash',  category: 'follow', fov: 68 },
  { id: 'topdown',     name: "Bird's-Eye (top-down)",    short: 'Top-Down',    category: 'follow', fov: 42 },
  { id: 'centralPark', name: 'Promenade Davos Platz', short: 'Promenade', category: 'scenic', fov: 52 },
  { id: 'fifthAve', name: 'Kongresszentrum', short: 'Kongress', category: 'scenic', fov: 50 },
  { id: 'timesSquare', name: 'Bahnhof Davos Platz', short: 'Bahnhof Platz', category: 'scenic', fov: 56 },
  { id: 'chryslerGCT', name: 'Davosersee & Davos Dorf', short: 'Davosersee', category: 'scenic', fov: 50 },
  { id: 'observatory', name: 'Schatzalp over the valley', short: 'Schatzalp', category: 'scenic', fov: 52 },
  { id: 'bryantPark', name: 'Eisstadion & Kirchner Museum', short: 'Eisstadion', category: 'scenic', fov: 54 },
  { id: 'waterfront', name: 'Dischma valley', short: 'Dischma', category: 'scenic', fov: 46 },
  { id: 'fixed',       name: 'Test camera',              short: 'Test',        category: 'scenic', fov: 55 },
  { id: 'drone',       name: 'Auto-Director Aerial',     short: 'Director',    category: 'scenic', fov: 50 }
];

// Davos viewpoints: [LV95 east, north, metres above the terrain] for the camera and the point it looks at
const VIEWPOINTS = {
  centralPark: [[2781950, 1185690, 1.8], [2782323, 1186054, 8]], // Promenade by the Schatzalpbahn, up the street towards Dorf
  fifthAve: [[2782470, 1185960, 4.5], [2782631, 1186090, 12]], // Talstrasse side of the Kongresszentrum
  timesSquare: [[2781900, 1185140, 9], [2781786, 1184891, 4]], // above the Bahnhofplatz, down at the station of Davos Platz
  chryslerGCT: [[2784450, 1188850, 18], [2783300, 1187000, 30]], // north shore of the Davosersee, over the lake to Davos Dorf
  observatory: [[2781222, 1186130, 8], [2783200, 1184800, 40]], // Schatzalp terrace, high over the valley to the Jakobshorn
  bryantPark: [[2782120, 1185690, 3], [2782265, 1185900, 10]], // Promenade, the Eisstadion and the Kirchner Museum behind it
  waterfront: [[2783350, 1186450, 60], [2786574, 1182992, 60]] // over the Dischma's mouth, up the valley towards Teufi
};
const viewpoint = ([E, N, up]) => { const p = lv95ToWorld(E, N); return new THREE.Vector3(p.x, groundHeight(p.x, p.z) + up, p.z); };
// The bird's-eye camera (GTA2 style): straight down over the player, north at the top of the screen, pulling up as the
// player speeds up and leading the view ahead in the direction of travel. Base height by entity type, in metres
const TOPDOWN_HEIGHT = { person: 28, cyclist: 34, cargobike: 34, car: 45, snowcat: 45, rhb: 65, helicopter: 90 };
const UP_WORLD = new THREE.Vector3(0, 1, 0);
const UP_NORTH = new THREE.Vector3(0, 0, -1); // world z = 1185500 − N: north is −z

const VIEWS = Object.fromEntries(Object.entries(VIEWPOINTS).map(([id, [pos, look]]) => [id, { pos: viewpoint(pos), look: viewpoint(look) }]));

class CameraSystem {
  constructor(domElement, controllerManager) {
    this.domElement = domElement;
    this.controllerManager = controllerManager;

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.35,
      200000 // the Alps stand 50-90 km away on the horizon (reversed float depth keeps precision)
    );

    this.activePresetId = 'chase';
    this.orbitYawOffset = 0.0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1.0;
    this.isDragging = false;
    this.userOrbitTimer = 0;

    this.currentPos = new THREE.Vector3(0, 10, 380);
    this.currentLookAt = new THREE.Vector3(0, 8, 440);
    this.initialized = false;

    // Follow cameras (chase / action) are smoothed relative to the followed entity, see update()
    this.followEntity = null;
    this.followOffset = new THREE.Vector3();
    this.followLookOffset = new THREE.Vector3();
    this.followBaseY = 0;
    this.smoothedSpeed = 0;
    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();

    this.bindPointerControls();
  }

  bindPointerControls() {
    const canvas = this.domElement;
    const pointers = new Map();
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pointers.size >= 2) return;
      // Only two touch pointers may share a gesture; mouse and pen drags stay independent.
      if (pointers.size && (e.pointerType !== 'touch' || pointers.values().next().value.type !== 'touch')) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.userOrbitTimer = 4.0;
    });

    canvas.addEventListener('pointermove', (e) => {
      const pointer = pointers.get(e.pointerId);
      if (!pointer) return;
      e.preventDefault();
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      const pair = pointers.size === 2 ? [...pointers.values()] : null;
      const previousDistance = pair ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (pair) {
        const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        if (previousDistance > 1 && distance > 1) {
          this.zoomMultiplier = Math.max(0.45, Math.min(this.maxZoom(), this.zoomMultiplier * previousDistance / distance));
        }
      } else {
        this.orbitYawOffset -= dx * 0.0065;
        this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + dy * 0.005));
      }
      this.userOrbitTimer = 4.0;
    });

    const releasePointer = (id) => {
      if (!pointers.delete(id)) return;
      this.isDragging = pointers.size > 0;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => releasePointer(e.pointerId));
    }
    const clearPointers = () => {
      for (const id of pointers.keys()) releasePointer(id);
    };
    this._clearPointers = clearPointers;
    window.addEventListener('blur', clearPointers);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPointers();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMultiplier = Math.max(0.45, Math.min(this.maxZoom(), this.zoomMultiplier + e.deltaY * 0.001));
    }, { passive: false });
  }

  // (the bird's-eye view may pull up much farther than the chase camera may pull back)
  maxZoom() { return this.activePresetId === 'topdown' ? 5 : 2.4; }

  setCameraPreset(presetId, snapImmediately = false) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.activePresetId = preset.id;
    this.zoomMultiplier = Math.min(this.zoomMultiplier, this.maxZoom());
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    if (snapImmediately) {
      this.initialized = false;
    }
  }

  applyGamepadInput(lookX, lookY, zoom, dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (this.activePresetId === 'topdown') {
      if (zoom) this.zoomMultiplier = Math.max(0.45, Math.min(this.maxZoom(), this.zoomMultiplier + zoom * 0.9 * dt));
      return;
    }
    if (this.activePresetId !== 'chase' && this.activePresetId !== 'pov') return;
    // POV uses the orbit angles, but only chase renders a zoomed camera distance.
    if (this.activePresetId !== 'chase') zoom = 0;
    if (!lookX && !lookY && !zoom) return;
    this.orbitYawOffset -= lookX * 2.0 * dt;
    this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + lookY * 1.25 * dt));
    this.zoomMultiplier = Math.max(0.45, Math.min(this.maxZoom(), this.zoomMultiplier + zoom * 0.9 * dt));
    this.userOrbitTimer = 4.0;
  }

  resetOrbit() {
    this.orbitYawOffset = 0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1;
    this.userOrbitTimer = 0;
  }

  resetForTeleport() {
    // Arrive with a fresh chase view, without carrying a previous drive or gesture into the destination.
    this._clearPointers();
    this.isDragging = false;
    this.resetOrbit();
    this.smoothedSpeed = 0;
    this.followEntity = null;
    this.followOffset.set(0, 0, 0);
    this.followLookOffset.set(0, 0, 0);
    this.followBaseY = 0;
    // (the bird's-eye view is a way of playing, kept across a teleport; every other camera arrives as the chase)
    this.setCameraPreset(this.activePresetId === 'topdown' ? 'topdown' : 'chase', true);
  }

  getActivePreset() {
    return CAMERA_PRESETS.find((p) => p.id === this.activePresetId) || CAMERA_PRESETS[0];
  }

  onResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt, elapsed) {
    const entity = this.controllerManager.getActiveEntity();
    const desiredPos = this._desiredPos;
    const desiredLook = this._desiredLook;

    if (this.userOrbitTimer > 0 && !this.isDragging) {
      this.userOrbitTimer = Math.max(0, this.userOrbitTimer - dt);
    }

    if (!this.isDragging && this.userOrbitTimer <= 0 && Math.abs(entity.speed) > 0.5) {
      this.orbitYawOffset -= Math.round(this.orbitYawOffset / (Math.PI * 2)) * (Math.PI * 2);
      this.orbitYawOffset += (0.0 - this.orbitYawOffset) * (1 - Math.exp(-dt * 2.2));
    }

    // The follow cameras pull back with speed, eased so that they drift back as the entity speeds up (and in as it
    // slows down); speedLag is about how far their former world-space smoothing left them trailing at 60 FPS
    this.smoothedSpeed += (Math.abs(entity.speed) - this.smoothedSpeed) * (1 - Math.exp(-dt * 3.0));
    const speedLag = this.smoothedSpeed * 0.1;

    const totalYaw = entity.heading + this.orbitYawOffset;

    switch (this.activePresetId) {
      case 'chase': {
        const dist = entity.chaseDistance * this.zoomMultiplier * (1 + Math.min(0.25, this.smoothedSpeed * 0.01));
        const height = entity.chaseHeight * this.zoomMultiplier + Math.sin(this.orbitPitchOffset) * dist * 0.85;
        const horizDist = Math.cos(this.orbitPitchOffset) * dist + speedLag;
        // Wheeled vehicles on Davos' slopes: the camera frame tilts with the road (entity.slopePitch, positive when
        // the road falls away ahead), so that the camera stays over the road behind and the view down a hill keeps
        // the framing of level ground instead of turning into a bird's eye
        const slope = Math.tan(entity.slopePitch || 0) * Math.cos(this.orbitYawOffset);
        desiredPos.set(
          entity.position.x - Math.sin(totalYaw) * horizDist,
          entity.position.y + height + slope * horizDist,
          entity.position.z - Math.cos(totalYaw) * horizDist
        );
        // (never under the ground behind: Davos' streets lie well below the flat world's y = 0)
        desiredPos.y = Math.max(cameraGround(desiredPos.x, desiredPos.z, entity.position.y) + 0.65, desiredPos.y);

        const lookUpBias = entity.type === 'helicopter' ? 0.2 : entity.type === 'car' ? 0.45 : entity.type === 'cargobike' ? 0.8 : 1.55;
        const lookAhead = entity.type === 'cargobike' ? 0.35 : 5.2;
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * lookAhead,
          entity.position.y + entity.cameraTargetOffset.y + lookUpBias - slope * lookAhead,
          entity.position.z + Math.cos(entity.heading) * lookAhead
        );
        break;
      }

      case 'action': {
        const sideOffset = entity.type === 'car' ? 2.65 : entity.type === 'snowcat' ? 3.6 : entity.type === 'rhb' ? 3.4 : (entity.type === 'helicopter' ? 4.2 : 0.95);
        const backDist = (entity.type === 'car' ? 3.6 : entity.type === 'snowcat' ? 5.4 : entity.type === 'rhb' ? 9 : (entity.type === 'helicopter' ? 8.5 : 2.8)) + speedLag;
        const lowY = entity.type === 'helicopter' ? entity.position.y + 1.2 : entity.position.y + 0.92;

        desiredPos.set(
          entity.position.x - Math.sin(entity.heading) * backDist + Math.cos(entity.heading) * sideOffset,
          Math.max(cameraGround(entity.position.x, entity.position.z, entity.position.y) + 0.55, lowY),
          entity.position.z - Math.cos(entity.heading) * backDist - Math.sin(entity.heading) * sideOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 3.2,
          entity.position.y + 1.05,
          entity.position.z + Math.cos(entity.heading) * 3.2
        );
        break;
      }

      case 'pov': {
        let fwdOffset = 0.35;
        let eyeY = 1.68;
        if (entity.type === 'car') {
          fwdOffset = 0.55;
          eyeY = 1.52;
        } else if (entity.type === 'cyclist') {
          fwdOffset = 0.35;
          eyeY = 1.55;
        } else if (entity.type === 'cargobike') {
          fwdOffset = -0.5;
          eyeY = 1.55;
        } else if (entity.type === 'helicopter') {
          fwdOffset = 1.65;
          eyeY = 1.65;
        } else if (entity.type === 'snowcat') {
          fwdOffset = 1.1; // the driver's seat, high up in the cab
          eyeY = 2.35;
        } else if (entity.type === 'rhb') {
          fwdOffset = 0.6; // the train driver's seat behind the raked windscreen (the entity is the cab, on the rails)
          eyeY = 2.75;
        }

        desiredPos.set(
          entity.position.x + Math.sin(entity.heading) * fwdOffset,
          entity.position.y + eyeY,
          entity.position.z + Math.cos(entity.heading) * fwdOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 40.0,
          entity.position.y + eyeY + Math.sin(-this.orbitPitchOffset) * 18.0 + 1.5,
          entity.position.z + Math.cos(totalYaw) * 40.0
        );
        break;
      }

      case 'topdown': {
        // (drags don't orbit here: north stays up, the wheel / a pinch / the pad zoom)
        const base = TOPDOWN_HEIGHT[entity.type] ?? 30;
        // the field of view is vertical: on a portrait screen (a phone) the width would shrink to a narrow strip of the
        // street, so the camera climbs until the width shows about what a landscape screen does
        const portrait = this.camera.aspect < 1 ? Math.pow(1 / this.camera.aspect, 0.75) : 1;
        const height = (base + Math.min(90, this.smoothedSpeed * 1.8)) * this.zoomMultiplier * portrait;
        const lead = Math.min(25, this.smoothedSpeed * 0.45);
        const tx = entity.position.x + Math.sin(entity.heading) * lead;
        const tz = entity.position.z + Math.cos(entity.heading) * lead;
        desiredLook.set(tx, entity.position.y, tz);
        desiredPos.set(tx, entity.position.y + height, tz);
        break;
      }

      case 'centralPark': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.centralPark.pos).x += sway;
        desiredLook.copy(VIEWS.centralPark.look);
        break;
      }

      case 'fifthAve': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.fifthAve.pos).x += sway;
        desiredLook.copy(VIEWS.fifthAve.look);
        break;
      }

      case 'timesSquare': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.timesSquare.pos).x += sway;
        desiredLook.copy(VIEWS.timesSquare.look);
        break;
      }

      case 'chryslerGCT': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.chryslerGCT.pos).x += sway;
        desiredLook.copy(VIEWS.chryslerGCT.look);
        break;
      }

      case 'observatory': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.observatory.pos).x += sway;
        desiredLook.copy(VIEWS.observatory.look);
        break;
      }

      case 'bryantPark': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.bryantPark.pos).x += sway;
        desiredLook.copy(VIEWS.bryantPark.look);
        break;
      }

      case 'waterfront': {
        const sway = Math.sin(elapsed * 0.22) * 1.5;
        desiredPos.copy(VIEWS.waterfront.pos).x += sway;
        desiredLook.copy(VIEWS.waterfront.look);
        break;
      }

      case 'fixed': {
        // Spike test camera: window.__slopdavos.setCamera(px, py, pz, tx, ty, tz)
        desiredPos.copy(this.fixedPos || desiredPos);
        desiredLook.copy(this.fixedLook || desiredLook);
        break;
      }

      case 'drone': {
        const angle = elapsed * 0.07 + 0.65;
        const radius = 720.0 + Math.sin(elapsed * 0.23) * 140.0;
        const alt = 330.0 + Math.cos(elapsed * 0.19) * 90.0;
        const dx = Math.cos(angle) * radius;
        const dz = Math.sin(angle) * radius;
        // The valley's slopes rise hundreds of metres within the orbit: stay well above the terrain
        desiredPos.set(dx, Math.max(alt, groundHeight(dx, dz) + 120), dz);
        desiredLook.set(0.0, 35.0, 0.0);
        break;
      }
    }

    if (!this.initialized || this.activePresetId === 'pov') {
      this.currentPos.copy(desiredPos);
      this.currentLookAt.copy(desiredLook);
      this.initialized = true;
      this.followEntity = null; // the follow cameras re-anchor from here
    } else if (this.activePresetId === 'chase' || this.activePresetId === 'action' || this.activePresetId === 'topdown') {
      // Smoothed in the followed entity's frame rather than in world space. A world-space follower trails a moving
      // target by a distance that depends on the frame time (about speed x dt), so with uneven frame times the camera
      // surged back and forth behind an accelerating or fast car. Relative to the entity a steady drive keeps the
      // camera steady, while turns, orbit drags, zoom & the speed pull-back are still eased. The entity's height is
      // eased in world space (curbs, park lawns, jumps, the helicopter climbing).
      if (this.followEntity !== entity) {
        // preset or mode switch: start from where the camera is and glide over to the new framing
        this.followEntity = entity;
        this.followBaseY = entity.position.y;
        this.followOffset.subVectors(this.currentPos, entity.position);
        this.followLookOffset.subVectors(this.currentLookAt, entity.position);
      }
      const k = 1 - Math.exp(-dt * 8.5);
      this.followBaseY += (entity.position.y - this.followBaseY) * k;
      this.followOffset.lerp(desiredPos.sub(entity.position), k);
      this.followLookOffset.lerp(desiredLook.sub(entity.position), k);
      this.currentPos.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followOffset);
      this.currentLookAt.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followLookOffset);
      this.currentPos.y = Math.max(cameraGround(this.currentPos.x, this.currentPos.z, entity.position.y) + 0.55, this.currentPos.y);
    } else {
      this.followEntity = null;
      const k = 1 - Math.exp(-dt * 8.5);
      this.currentPos.lerp(desiredPos, k);
      this.currentLookAt.lerp(desiredLook, k);
    }

    this.camera.position.copy(this.currentPos);
    // (straight down, lookAt needs an up that isn't the view direction: north)
    this.camera.up.copy(this.activePresetId === 'topdown' ? UP_NORTH : UP_WORLD);
    this.camera.lookAt(this.currentLookAt);
  }
}

export { CAMERA_PRESETS, CameraSystem };
