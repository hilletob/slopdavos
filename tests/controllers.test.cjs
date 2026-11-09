const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');
const { flatTerrainImports } = require('./helpers/flat-terrain.cjs');

const source = readFileSync(join(__dirname, '../js/controllers.js'), 'utf8');
// The snow groomer's model module: only its constants are needed here (the builders want three.js)
const snowcat = loadModule(readFileSync(join(__dirname, '../js/snowcat.js'), 'utf8'), {
  imports: { 'three/webgpu': {}, 'three/tsl': {}, 'three/addons/utils/BufferGeometryUtils.js': {} }
});

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    }
  };
}

function keyboardHarness(nyc = {}) {
  const window = eventTarget();
  const document = { ...eventTarget(), hidden: false };
  const config = {
    streetZ: () => 0,
    isTypingInField: (event) => ['INPUT', 'SELECT'].includes(event.target?.tagName),
    ...nyc
  };
  const { ThirdPersonControllerManager } = loadModule(source, {
    globals: { window, document },
    imports: {
      'three/webgpu': {},
      './city-config.js': config,
      ...flatTerrainImports,
      'three/tsl': {},
      './tsl-materials.js': {},
      './actor-models.js': {},
      './pedestrians.js': {},
      './player-figure.js': { applyFigure: () => new Promise(() => {}), chosenFigure: () => 'f04' },
      './person-clips.js': { loadPersonClips: () => new Promise(() => {}) },
      './vehicle-lights.js': {},
      './quality.js': { QUALITY: { clusteredLighting: true } },
      './ground-beams.js': {},
      './vw-t3.js': {},
      './landmarks.js': {},
      './snowcat.js': snowcat
    }
  });
  // Exercise the production event handlers without constructing the scene's 3D models.
  const controller = Object.create(ThirdPersonControllerManager.prototype);
  controller.keys = Object.fromEntries(['forward', 'backward', 'left', 'right', 'up', 'down'].map((action) => [action, false]));
  controller.bindKeyboard();
  return {
    controller,
    window,
    document,
    key(type, code, tagName = 'BODY') {
      window.dispatch(type, { code, target: { tagName } });
    }
  };
}

test('releasing a movement key after focusing search stops movement', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'KeyW');
  assert.equal(controller.keys.forward, true);
  key('keyup', 'KeyW', 'INPUT');
  assert.equal(controller.keys.forward, false);

  key('keydown', 'KeyW', 'INPUT');
  assert.equal(controller.keys.forward, false, 'typing in search does not move the player');
});

test('releasing one movement binding preserves another held binding', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'KeyW');
  key('keydown', 'ArrowUp');
  key('keyup', 'ArrowUp');
  assert.equal(controller.keys.forward, true);
  key('keyup', 'KeyW');
  assert.equal(controller.keys.forward, false);
});

test('either jump binding stays active until both are released', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'Space');
  key('keydown', 'KeyE');
  key('keyup', 'Space');
  assert.equal(controller.keys.up, true);
  key('keyup', 'KeyE');
  assert.equal(controller.keys.up, false);
});

test('keyboard and touch input remain active independently', () => {
  const { controller, key } = keyboardHarness();
  controller.setTouchInput('forward', 0.35);
  assert.equal(controller.keys.forward, 0.35);
  key('keydown', 'KeyW');
  assert.equal(controller.keys.forward, true);
  controller.setTouchInput('forward', 0.6);
  assert.equal(controller.keys.forward, true);
  key('keyup', 'KeyW');
  assert.equal(controller.keys.forward, 0.6);
  controller.setTouchInput('forward', 0);
  assert.equal(controller.keys.forward, false);
});

test('clearing touch input preserves held keyboard controls', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'KeyW');
  controller.setTouchInput('forward', 0.4);
  controller.setTouchInput('left', 0.7);
  controller.setTouchInput('up', true);
  controller.clearTouchInput();
  assert.equal(controller.keys.forward, true);
  assert.equal(controller.keys.left, false);
  assert.equal(controller.keys.up, false);
  key('keyup', 'KeyW');
  assert.equal(controller.keys.forward, false);
});

test('touch strengths are clamped and unknown actions are ignored', () => {
  const { controller } = keyboardHarness();
  controller.setTouchInput('forward', 2);
  controller.setTouchInput('left', -0.5);
  controller.setTouchInput('up', true);
  controller.setTouchInput('unknown', 1);
  assert.equal(controller.keys.forward, 1);
  assert.equal(controller.keys.left, false);
  assert.equal(controller.keys.up, true);
  assert.equal(Object.hasOwn(controller.keys, 'unknown'), false);
});

for (const interruption of ['blur', 'hidden', 'reset']) {
  test(`${interruption} clears held controls and their physical key state`, () => {
    const { controller, window, document, key } = keyboardHarness();
    key('keydown', 'KeyW');
    key('keydown', 'KeyA');
    key('keydown', 'Space');
    key('keydown', 'KeyE');
    controller.setTouchInput('forward', 0.4);
    controller.setTouchInput('backward', 0.8);
    controller.setTouchInput('down', true);
    if (interruption === 'blur') {
      window.dispatch('blur');
    } else if (interruption === 'hidden') {
      document.hidden = true;
      document.dispatch('visibilitychange');
    } else {
      controller.resetInput();
    }
    assert.equal(Object.values(controller.keys).some(Boolean), false);

    // A fresh use of the alias must not revive the old key whose keyup was lost.
    key('keydown', 'ArrowUp');
    key('keyup', 'ArrowUp');
    assert.equal(controller.keys.forward, false);
  });
}

function advanceWithTouch(mode, strength, reverse) {
  const { controller } = keyboardHarness();
  const entity = { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0 };
  if (mode === 'Person') Object.assign(entity, { verticalVel: 0 });
  if (mode === 'Car') Object.assign(entity, {
    vx: 0, vz: 0, angularVel: 0, steerAngle: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, heaveY: 0, wheelSpin: 0,
    chassisPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }, wheels: []
  });
  if (mode === 'Cyclist' || mode === 'CargoBike') Object.assign(entity, {
    leanAngle: 0, leanPivot: { rotation: { z: 0 } },
    frontWheel: { rotation: { x: 0 } }, rearWheel: { rotation: { x: 0 } },
    frontWheelRadius: mode === 'CargoBike' ? 0.248 : 0.35, rearWheelRadius: mode === 'CargoBike' ? 0.332 : 0.35,
    ...(mode === 'CargoBike' ? {
      frontSteerPivot: { rotation: { y: 0 } }, handlebarPivot: { rotation: { y: 0 } },
      bikeFrame: { steerPivot: { x: 0, z: 0 }, steerAngle: 0 }
    } : {}),
    pedalPhase: 0, crankPivot: { rotation: { x: 0 } }, pedals: []
  });
  if (mode === 'Helicopter') Object.assign(entity, {
    verticalSpeed: 0, pitchAngle: 0, rollAngle: 0,
    tiltPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }
  });
  controller.entities = { [mode.toLowerCase()]: entity };
  controller.getGroundHeight = () => 0;
  controller.resolveHorizontalCollision = () => {};
  controller.setTouchInput(reverse ? 'backward' : 'forward', strength);
  controller.setTouchInput(reverse ? 'right' : 'left', strength);
  if (mode === 'Helicopter') controller.setTouchInput(reverse ? 'down' : 'up', strength);
  if (mode === 'Cyclist' || mode === 'CargoBike') controller.updateCyclist(0.1, entity, mode === 'CargoBike' ? 'cargobike' : 'cyclist');
  else controller[`update${mode}`](0.1, 0);
  return entity;
}

for (const mode of ['Person', 'Car', 'Cyclist', 'CargoBike', 'Helicopter']) {
  test(`analog ${mode.toLowerCase()} input proportionally scales movement and turning`, () => {
    for (const reverse of [false, true]) {
      const full = advanceWithTouch(mode, 1, reverse);
      const partial = advanceWithTouch(mode, 0.4, reverse);
      if (mode === 'Car') {
        assert.equal(Math.sign(partial.speed), Math.sign(full.speed));
        assert.ok(Math.abs(partial.speed) > 0 && Math.abs(partial.speed) < Math.abs(full.speed), 'partial throttle moves more slowly');
        assert.equal(Math.sign(partial.steerAngle), Math.sign(full.steerAngle));
        assert.ok(Math.abs(partial.steerAngle) > 0 && Math.abs(partial.steerAngle) < Math.abs(full.steerAngle), 'partial steering turns less');
        continue;
      }
      assert.ok(Math.abs(partial.speed - full.speed * 0.4) < 1e-10, 'movement should scale with joystick strength');
      assert.ok(Math.abs(partial.heading - full.heading * 0.4) < 1e-10, 'turning should scale with joystick strength');
      if (mode === 'Helicopter') {
        assert.ok(Math.abs(partial.verticalSpeed - full.verticalSpeed * 0.4) < 1e-10);
      }
    }
  });
}

test('cargo bike wheels spin for their own radii and steering moves the fork, bars and rider grip target together', () => {
  const { controller } = keyboardHarness();
  const makeBike = (type, frontWheelRadius, rearWheelRadius, steer = false) => ({
    type,
    position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, leanAngle: 0,
    leanPivot: { rotation: { z: 0 } },
    frontWheel: { rotation: { x: 0 } }, rearWheel: { rotation: { x: 0 } },
    frontWheelRadius, rearWheelRadius,
    ...(steer ? {
      frontSteerPivot: { rotation: { y: 0 } }, handlebarPivot: { rotation: { y: 0 } },
      bikeFrame: { steerPivot: { x: 0, z: 0 }, steerAngle: 0 }
    } : {}),
    pedalPhase: 0,
    crankPivot: { rotation: { x: 0 } }, pedals: []
  });
  const cyclist = makeBike('cyclist', 0.35, 0.35);
  const cargoBike = makeBike('cargobike', 0.248, 0.332, true);
  controller.entities = { cyclist, cargobike: cargoBike };
  controller.getGroundHeight = () => 0;
  controller.resolveHorizontalCollision = () => {};
  controller.keys.forward = true;
  controller.keys.left = true;
  controller.setMode('cyclist');
  assert.equal(controller.getActiveEntity(), cyclist);
  controller.updateCyclist(0.1, cyclist, 'cyclist');
  const cyclistDistance = cyclist.speed * 0.1;
  assert.ok(Math.abs(cyclist.frontWheel.rotation.x - cyclistDistance / 0.35) < 1e-10);
  assert.ok(Math.abs(cyclist.rearWheel.rotation.x - cyclistDistance / 0.35) < 1e-10);

  controller.setMode('cargobike');
  assert.equal(controller.getActiveEntity(), cargoBike);
  controller.updateCyclist(0.1, cargoBike, 'cargobike');
  const distance = cargoBike.speed * 0.1;
  assert.ok(Math.abs(cargoBike.frontWheel.rotation.x - distance / cargoBike.frontWheelRadius) < 1e-10);
  assert.ok(Math.abs(cargoBike.rearWheel.rotation.x - distance / cargoBike.rearWheelRadius) < 1e-10);
  assert.ok(cargoBike.frontWheel.rotation.x > cargoBike.rearWheel.rotation.x, 'the smaller front wheel turns farther over the same distance');
  assert.equal(cargoBike.frontSteerPivot.rotation.y, 0.34);
  assert.equal(cargoBike.handlebarPivot.rotation.y, 0.34);
  assert.equal(cargoBike.bikeFrame.steerAngle, 0.34);
  assert.equal(cyclist.frontWheel.rotation.x, cyclistDistance / 0.35, 'switching bikes leaves the parked cyclist state intact');
});

function carDynamicsHarness(motion = {}) {
  const { controller } = keyboardHarness();
  const car = {
    type: 'car', position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0,
    vx: 0, vz: 0, angularVel: 0, steerAngle: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, heaveY: 0, wheelSpin: 0,
    chassisPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }, wheels: [],
    carState: { value: { x: 0, w: 0 } },
    ...motion
  };
  controller.entities = { car };
  controller.getGroundHeight = () => 0;
  controller.resolveHorizontalCollision = () => {};
  return {
    controller, car,
    advance(seconds, hz = 60) {
      for (let i = 0; i < Math.round(seconds * hz); i++) controller.updateCar(1 / hz);
    }
  };
}

function carVelocity(car) {
  return [Math.sin(car.heading) * car.speed + car.vx, Math.cos(car.heading) * car.speed + car.vz];
}

test('car accelerates gradually to full speed and preserves coasting and braking', () => {
  const acceleration = carDynamicsHarness();
  acceleration.controller.keys.forward = true;
  acceleration.advance(4);
  assert.ok(Math.abs(acceleration.car.speed * 3.6 - 60) < 1, 'reach city speeds gradually');
  acceleration.advance(5);
  assert.ok(acceleration.car.speed > 26 && acceleration.car.speed < 28, 'acceleration tapers at higher speeds');
  acceleration.advance(25);
  assert.equal(acceleration.car.speed, 36, 'holding the accelerator reaches the full top speed');

  const coasting = carDynamicsHarness({ speed: 50 / 3.6 });
  coasting.advance(5);
  assert.ok(Math.abs(coasting.car.speed * 3.6 - 33.07) < 0.2, 'keep the existing accelerator-release resistance');

  const braking = carDynamicsHarness({ speed: 50 / 3.6 });
  braking.controller.keys.backward = true;
  braking.advance(1.5);
  assert.ok(braking.car.speed >= 0 && braking.car.speed < 0.2, 'braking reaches a stop without reversing early');
  assert.ok(braking.car.position.z > 9.8 && braking.car.position.z < 10.6, 'preserve the roughly ten-metre stopping distance');
});

test('car steering follows speed and reverses direction when backing up', () => {
  const slow = carDynamicsHarness({ speed: 5 });
  const fast = carDynamicsHarness({ speed: 25 });
  const reverse = carDynamicsHarness({ speed: -5 });
  const stopped = carDynamicsHarness();
  for (const sim of [slow, fast, reverse, stopped]) {
    sim.controller.keys.left = true;
    sim.advance(1);
  }
  assert.ok(slow.car.heading > fast.car.heading && fast.car.heading > 0, 'fast steering follows a wider arc');
  assert.ok(fast.car.steerAngle < slow.car.steerAngle / 3, 'reduce steering lock at speed');
  assert.ok(Math.abs(fast.car.angularVel * fast.car.speed) < 9.5, 'high-speed turning stays within road-tire grip');
  assert.ok(reverse.car.heading < 0, 'the same steering input turns the opposite way in reverse');
  assert.ok(Math.abs(reverse.car.heading + slow.car.heading) < 0.05, 'forward and reverse steering remain symmetric');
  assert.equal(stopped.car.heading, 0, 'steering alone cannot rotate a stationary car');
  assert.equal(stopped.car.speed, 0);
});

test('car changes direction after braking with residual turning and sideways motion', () => {
  for (const direction of [-1, 1]) {
    for (const hz of [30, 60, 120]) {
      const sim = carDynamicsHarness({ speed: -direction * 10, angularVel: direction });
      sim.controller.keys[direction > 0 ? 'forward' : 'backward'] = true;
      sim.controller.keys.left = true;
      sim.advance(3, hz);
      assert.ok(sim.car.speed * direction > 5, 'holding the new direction must release the brakes and drive away');
    }
  }
});

test('player brake and reverse lamps follow braking and backward travel', () => {
  for (const [speed, input, brake, reverse] of [
    [0, null, 0, 0], [5, null, 0, 0], [5, 'forward', 0, 0], [5, 'backward', 1, 0],
    [-5, null, 0, 1], [-5, 'backward', 0, 1], [-5, 'forward', 1, 1]
  ]) {
    const sim = carDynamicsHarness({ speed });
    if (input) sim.controller.keys[input] = true;
    sim.advance(1 / 60);
    assert.equal(sim.car.carState.value.x, brake, `brake at speed ${speed}, input ${input}`);
    assert.equal(sim.car.carState.value.w, reverse, `reverse at speed ${speed}, input ${input}`);
    sim.controller.entities.person = {};
    sim.controller.setMode('person');
    assert.equal(sim.car.carState.value.x, 0, 'leaving the car releases its brake lights');
    assert.equal(sim.car.carState.value.w, 0, 'the parked car no longer shows reverse lights');
  }
});

test('releasing car steering settles smoothly and suspension leans outward', () => {
  const sim = carDynamicsHarness({ speed: 15 });
  sim.controller.keys.left = true;
  sim.advance(2);
  const turning = sim.car.angularVel;
  assert.ok(sim.car.chassisPivot.rotation.z > 0, 'the body rolls away from the turn');
  sim.controller.keys.left = false;
  sim.advance(1 / 60);
  assert.ok(sim.car.angularVel > 0, 'steering release does not snap away the existing yaw');
  sim.advance(1.5);
  assert.ok(Math.abs(sim.car.angularVel) < Math.abs(turning) * 0.1, 'yaw settles after the wheel recenters');
  assert.ok(Math.abs(sim.car.steerAngle) < 0.001);
});

test('hard braking reduces steering grip without counting air resistance as tire force', () => {
  const braking = carDynamicsHarness({ speed: 35 });
  const coasting = carDynamicsHarness({ speed: 35 });
  braking.controller.keys.backward = true;
  for (const sim of [braking, coasting]) {
    sim.controller.keys.left = true;
    sim.advance(0.3);
  }
  assert.ok(braking.car.angularVel > 0.01, 'some steering remains available under hard braking');
  assert.ok(braking.car.angularVel < coasting.car.angularVel, 'braking consumes part of the tire grip budget');
});

test('sustained car turns produce bounded slip that recovers with countersteering', () => {
  for (const speed of [5, 15, 25]) {
    const sim = carDynamicsHarness({ speed });
    sim.controller.keys.forward = true;
    sim.controller.keys.left = true;
    let peakSlip = 0;
    for (let i = 0; i < 900; i++) {
      sim.controller.updateCar(1 / 60);
      const slip = Math.atan2(Math.hypot(sim.car.vx, sim.car.vz), Math.abs(sim.car.speed));
      peakSlip = Math.max(peakSlip, slip);
      assert.ok(sim.car.speed > 4, 'holding a turn does not spin the car to a stop');
    }
    assert.ok(peakSlip > 0.08 && peakSlip < 0.27, 'hard turns allow a modest slide without a growing spin');

    sim.controller.keys.left = false;
    sim.controller.keys.right = true;
    sim.advance(0.5);
    assert.ok(sim.car.angularVel < 0, 'countersteering brings yaw back under control');
    sim.controller.keys.right = false;
    sim.controller.keys.forward = false;
    sim.advance(2);
    assert.ok(Math.hypot(sim.car.vx, sim.car.vz) < 0.05, 'the slide settles after steering is released');
  }
});

test('car collision momentum is retained and sideways motion settles through grip', () => {
  const forward = carDynamicsHarness({ vz: 8 });
  forward.advance(0.1);
  assert.ok(carVelocity(forward.car)[1] > 7.7, 'a forward impact becomes rolling motion instead of disappearing');
  assert.ok(forward.car.speed > 7.7, 'longitudinal momentum reaches the signed speed used by other systems');

  const sideways = carDynamicsHarness({ vx: 8 });
  sideways.advance(0.1);
  assert.ok(carVelocity(sideways.car)[0] > 6.9, 'tire grip cannot remove a sideways impact instantly');
  sideways.advance(2);
  assert.ok(Math.abs(carVelocity(sideways.car)[0]) < 0.1, 'sideways velocity eventually settles');
});

test('unpowered car steering and collision recovery never add translational energy', () => {
  const sim = carDynamicsHarness({ speed: 20, vx: 3, angularVel: 1 });
  sim.controller.keys.left = true;
  let speed = Math.hypot(...carVelocity(sim.car));
  for (let i = 0; i < 240; i++) {
    sim.controller.updateCar(1 / 60);
    const next = Math.hypot(...carVelocity(sim.car));
    assert.ok(Number.isFinite(next) && next <= speed + 1e-9, 'steering and grip may redirect or dissipate momentum, but cannot create it');
    speed = next;
  }
});

test('car turning and impact recovery agree across 30, 60 and 120 Hz', () => {
  const results = [30, 60, 120].map((hz) => {
    const sim = carDynamicsHarness({ speed: 15, vx: 2, angularVel: 0.5 });
    sim.controller.keys.left = 0.6;
    sim.controller.keys.forward = 0.5;
    sim.advance(2, hz);
    sim.controller.keys.left = false;
    sim.controller.keys.forward = false;
    sim.advance(1, hz);
    return sim.car;
  });
  for (const car of results.slice(0, 2)) {
    const reference = results[2];
    assert.ok(Math.hypot(car.position.x - reference.position.x, car.position.z - reference.position.z) < 0.1, 'path differs by less than ten centimetres');
    assert.ok(Math.abs(car.heading - reference.heading) < 0.01);
    assert.ok(Math.abs(car.speed - reference.speed) < 0.05);
    assert.ok(Math.abs(car.chassisPivot.rotation.z - reference.chassisPivot.rotation.z) < 0.01);
  }
});

function teleportHarness(mode, colliders = [], shore = () => ({ westX: -500, eastX: 500 })) {
  const harness = keyboardHarness({
    ISLAND_BOUNDS: { minX: -500, maxX: 500, minZ: -500, maxZ: 500, sidewalkHeight: 0.22 },
    CENTRAL_PARK_BOUNDS: { minX: 1000, maxX: 1100, minZ: 1000, maxZ: 1100 },
    getIslandBoundsAtZ: shore,
    blockAt: () => null
  });
  const { controller } = harness;
  const position = (x = 0, y = 0, z = 0) => ({ x, y, z, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; } });
  const pivot = () => ({ position: position(), rotation: { x: 0.1, y: 0, z: -0.2 } });
  const chase = { person: [4.3, 1.95], car: [6.9, 2.12], cyclist: [4.8, 2.05], cargobike: [6.2, 2.35], helicopter: [11.4, 3.3], snowcat: [10.5, 3.6] };
  const ent = {
    type: mode, chaseDistance: chase[mode][0], chaseHeight: chase[mode][1],
    position: position(400, mode === 'helicopter' ? 120 : 0, 400), heading: 1, speed: 20,
    mesh: pivot(),
    verticalVel: 5, vx: 3, vz: -4, angularVel: 2, steerAngle: 0.4,
    pitchVel: 3, rollVel: 4, heaveY: 0.1, heaveVel: 2, chassisPivot: pivot(),
    lastCollisionSpark: { speed: 5 }, carState: { value: { x: 1, w: 1 } }, wheelSpin: 1,
    wheels: [{ isFront: true, steerPivot: { rotation: { y: 0.4 } }, tire: { rotation: { x: 0 } } }],
    leanAngle: 0.3, leanPivot: pivot(), pedalPhase: 0.7,
    frontWheel: { rotation: { x: 0 } }, rearWheel: { rotation: { x: 0 } },
    crankPivot: { rotation: { x: 0 } }, pedals: [],
    verticalSpeed: -8, pitchAngle: 0.2, rollAngle: -0.2, tiltPivot: pivot(),
    rig: { reset(...args) { this.resetArgs = args; } },
    crowd: { begin() {}, add() {}, end() {} }
  };
  controller.activeMode = mode;
  controller.entities = { [mode]: ent };
  controller.colliders = colliders;
  controller._colliderCells = null;
  controller.getGroundHeight = (x, z, mode) => mode === 'person' ? (x < 0 ? 1.24 : 0.22) : 0;
  return { ...harness, ent };
}

test('the snowcat turns on the spot and crawls at no more than 25 km/h', () => {
  const { controller, ent, key } = teleportHarness('snowcat');
  Object.assign(ent, { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, turnRate: 0, trackPhases: [{ value: 0 }, { value: 0 }] });
  key('keydown', 'KeyA');
  for (let i = 0; i < 20; i++) controller.updateSnowcat(0.05);
  assert.ok(ent.heading > 0.5, `turned ${ent.heading.toFixed(2)} rad at a standstill`);
  assert.ok(Math.hypot(ent.position.x, ent.position.z) < 0.01, 'without moving');
  assert.ok(ent.trackPhases[0].value * ent.trackPhases[1].value < 0, 'the two tracks run in opposite directions');
  key('keyup', 'KeyA');
  key('keydown', 'KeyW');
  for (let i = 0; i < 200; i++) controller.updateSnowcat(0.05);
  assert.ok(ent.speed > 6 && ent.speed <= 6.95, `${(ent.speed * 3.6).toFixed(1)} km/h`);
});

test('a parked snow groomer is solid for the van and the pedestrian, and the driven one stops at the parked van', () => {
  const { controller, ent: car } = teleportHarness('car');
  const cat = teleportHarness('snowcat').ent;
  controller.entities.snowcat = cat;
  Object.assign(cat.position, { x: 0, y: 0, z: 0 });
  cat.heading = 0;
  Object.assign(car, { position: { x: 0.5, y: 0, z: 5 }, heading: 0, speed: -3, vx: 0, vz: 0 });
  controller.resolveHorizontalCollision(car.position, 1.35, car);
  assert.ok(car.position.z >= snowcat.SNOWCAT_MODEL.halfL + 2.33 - 1e-6, `the van backed into the groomer's blade and stops there (z ${car.position.z.toFixed(2)})`);

  const person = teleportHarness('person').ent;
  controller.entities.person = person;
  controller.activeMode = 'person';
  Object.assign(person.position, { x: 1.9, y: 0, z: 0 });
  controller.resolveHorizontalCollision(person.position, 0.48, null, person);
  assert.ok(person.position.x >= snowcat.SNOWCAT_MODEL.halfW + 0.48 - 1e-6, 'nor can one walk through its tracks');

  // The other way round: driven, the groomer is held off the parked van
  controller.activeMode = 'snowcat';
  Object.assign(car.position, { x: 0, y: 0, z: 7 });
  cat.position.z = 2;
  controller.resolveHorizontalCollision(cat.position, 2, null, cat);
  assert.ok(cat.position.z <= 7 - 2.33 - snowcat.SNOWCAT_MODEL.halfL + 1e-6, `the groomer stops at the van (z ${cat.position.z.toFixed(2)})`);
  car.position.y = 30; // high above (on a bridge deck): no contact
  cat.position.z = 2;
  controller.resolveHorizontalCollision(cat.position, 2, null, cat);
  assert.equal(cat.position.z, 2);
});

test('the driven snow groomer stops at tree trunks, other players pass them', () => {
  const { controller, ent: cat } = teleportHarness('snowcat');
  assert.equal(controller.setTrees([{ x: 0, z: 4, scale: 1 }, { x: 40, z: 40, scale: 0.2 }, { x: NaN, z: 0 }]), 1);
  Object.assign(cat.position, { x: 0, y: 0, z: 0 });
  cat.heading = 0;
  controller.resolveHorizontalCollision(cat.position, 2, null, cat);
  assert.ok(cat.position.z <= 4 - 0.35 - snowcat.SNOWCAT_MODEL.halfL + 1e-6, `pushed back off the trunk (z ${cat.position.z.toFixed(2)})`);
  const bike = teleportHarness('cyclist').ent;
  controller.entities.cyclist = bike;
  controller.activeMode = 'cyclist';
  Object.assign(bike.position, { x: 0, y: 0, z: 30 });
  const before = { ...bike.position };
  controller.resolveHorizontalCollision(bike.position, 0.65, null, bike);
  assert.deepEqual([bike.position.x, bike.position.z], [before.x, before.z]);
});

test('lamp and sign posts stop the walker and a crawling van, a vehicle at speed knocks them over and is braked', () => {
  const { controller, ent: car } = teleportHarness('car');
  const fallen = [];
  const set = { fall(post, dx, dz) { fallen.push({ i: post.i, dx, dz }); } };
  // (a post 2.5 m ahead of the van's nose at z = 0, one far off, two invalid)
  const posts = [{ x: 0, z: 2.5, r: 0.2, set, i: 7 }, { x: 0.3, z: 2.5, r: 0.2, set, i: 8 }, { x: 200, z: 200, r: 0.2, set, i: 9 },
    { x: NaN, z: 1, r: 0.2, set, i: 1 }, { x: 0, z: 1, r: 0.2, i: 2 }];
  assert.equal(controller.setKnockablePosts(posts), 3);
  const impacts = [];
  controller.setCollisionListener((e) => impacts.push({ ...e }));

  // Crawling up to it: held off (a plain contact), nothing falls
  Object.assign(car, { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 1, vx: 0, vz: 0, pitchVel: 0, heaveVel: 0, rollVel: 0 });
  controller.resolveHorizontalCollision(car.position, 1.35, car);
  assert.ok(car.position.z < 2.5 - 0.2 - 2.33 + 1e-6, `the van stops at the post (z ${car.position.z.toFixed(2)})`);
  assert.equal(fallen.length, 0);
  assert.equal(posts[0].fallen, undefined);
  assert.deepEqual(impacts.map((e) => e.kind), ['building']);
  impacts.length = 0;

  // At speed: both posts in its path go down in the direction of travel, the van loses 40 % of its speed, jolts, and isn't pushed back
  Object.assign(car, { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 10, vx: 0, vz: 0, pitchVel: 0, heaveVel: 0, rollVel: 0 });
  controller.resolveHorizontalCollision(car.position, 1.35, car);
  assert.deepEqual(fallen.map((f) => f.i).sort(), [7, 8]);
  assert.ok(Math.abs(fallen[0].dx) < 1e-9 && Math.abs(fallen[0].dz - 1) < 1e-9, 'it falls along the heading');
  assert.ok(posts[0].fallen && posts[1].fallen);
  assert.ok(Math.abs(car.speed - 10 * 0.36) < 1e-9, `braked twice to ${car.speed.toFixed(2)} m/s`);
  assert.deepEqual([car.position.x, car.position.z], [0, 0], 'the van drives on over it');
  assert.ok(car.pitchVel < 0 && car.heaveVel > 0, 'with a jolt');
  assert.equal(impacts.length, 2);
  assert.equal(impacts[0].kind, 'post');
  assert.equal(impacts[0].b, posts[0]);
  assert.ok(impacts[0].speed > 5, 'loud enough for the crash sound');

  // Fallen, it is driven over without a second thought
  Object.assign(car, { position: { x: 0, y: 0, z: 0 }, speed: 1 });
  controller.resolveHorizontalCollision(car.position, 1.35, car);
  assert.equal(car.position.z, 0);
  assert.equal(fallen.length, 2);

  // The walker is held off a standing post, the cyclist at speed fells it
  const standing = { x: 10, z: 0.6, r: 0.2, set, i: 3 };
  controller.setKnockablePosts([standing]);
  const person = teleportHarness('person').ent;
  controller.entities.person = person;
  controller.activeMode = 'person';
  Object.assign(person.position, { x: 10, y: 0, z: 0 });
  person.speed = 3;
  controller.resolveHorizontalCollision(person.position, 0.48, null, person);
  assert.ok(person.position.z <= 0.6 - 0.2 - 0.48 + 1e-6, `the walker stops at the post (z ${person.position.z.toFixed(2)})`);
  assert.equal(standing.fallen, undefined);
  const bike = teleportHarness('cyclist').ent;
  controller.entities.cyclist = bike;
  controller.activeMode = 'cyclist';
  Object.assign(bike, { position: { x: 10, y: 0, z: 0 }, heading: 0, speed: 6, leanAngle: 0 });
  controller.resolveHorizontalCollision(bike.position, 0.65, null, bike);
  assert.equal(standing.fallen, true);
  assert.ok(Math.abs(bike.speed - 3.6) < 1e-9, 'the bike is braked too');
  assert.deepEqual([bike.position.x, bike.position.z], [10, 0]);
});

test('toggleBeacon switches the groomer\'s beacon (K, js/actions.js); parked it is a traffic body, driven it is not', () => {
  const { controller, ent: cat } = teleportHarness('snowcat');
  const uniform = (value) => ({ value });
  const vec = () => ({ set(...v) { this.v = v; } });
  Object.assign(cat, {
    beaconOn: true, beaconAngle: 0, heading: 0.5, position: { x: 12, y: 1, z: -7 },
    beacon: { on: uniform(1), dir: { value: vec() }, world: { value: vec() } },
    trackPhases: [uniform(0), uniform(0)], model: { rolled: 0, rollWheels() { this.rolled++; } }
  });
  assert.equal(controller.toggleBeacon(), false);
  assert.equal(cat.beaconOn, false);
  controller.animateSnowcat(1.3);
  assert.equal(cat.beacon.on.value, 0, 'the dome and its glow go dark');
  assert.equal(controller.snowcatTrafficBody.x, 1e7, 'driven, the groomer is the player for the traffic');
  assert.equal(controller.toggleBeacon(), true);
  controller.activeMode = 'car';
  controller.animateSnowcat(0.1);
  assert.equal(cat.beacon.on.value, 1);
  const a = 0.1 * 1.6 * Math.PI * 2;
  assert.ok(Math.abs(cat.beacon.world.value.v[0] - Math.sin(0.5 + a)) < 1e-9, 'the beam turns with the groomer and its reflector');
  const body = controller.snowcatTrafficBody;
  assert.deepEqual([body.x, body.z, body.halfW, body.halfL], [12, -7, snowcat.SNOWCAT_MODEL.halfW, snowcat.SNOWCAT_MODEL.halfL]);
  assert.ok(Math.abs(body.sin - Math.sin(0.5)) < 1e-9);
  cat.trackPhases[0].value = -0.4;
  controller.animateSnowcat(0.2);
  assert.ok(cat.model.rolled >= 1, 'the road wheels roll with the belts');
});

test('in the RhB mode the player is bound to the rails: W and S go to the train, the entity rides in its cab', () => {
  const { controller, key } = teleportHarness('car');
  const sent = [];
  const railway = {
    taken: null,
    takeOver(on) { this.taken = on; return on ? {} : null; },
    setControls(throttle, brake) { sent.push([throttle, brake]); },
    cab: () => ({ x: 12, y: 3, z: -40, heading: 2, speed: 9 })
  };
  const rhb = { type: 'rhb', position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, heading: 0, speed: 0 };
  controller.entities.rhb = rhb;
  controller.setRailway(railway);
  controller.setMode('rhb');
  assert.equal(railway.taken, true, 'the train is taken over');
  key('keydown', 'KeyW');
  key('keydown', 'KeyA'); // no steering: A does nothing for a train
  controller.updateRhB(0.1);
  assert.deepEqual(sent.at(-1), [1, 0], 'W is the throttle');
  assert.deepEqual({ x: rhb.position.x, z: rhb.position.z, heading: rhb.heading, speed: rhb.speed }, { x: 12, z: -40, heading: 2, speed: 9 });
  key('keyup', 'KeyW');
  key('keydown', 'KeyS');
  controller.updateRhB(0.1);
  assert.deepEqual(sent.at(-1), [0, 1], 'S is the brake');
  assert.deepEqual({ ...controller.teleportActiveTo(500, 500, 0) }, { x: 12, z: -40 }, 'no teleporting off the rails');
  controller.setMode('car');
  assert.equal(railway.taken, false, 'leaving the mode hands the train back to the timetable');
});

test('a passenger rides the train without its controls; leaving gets off; mode listeners hear every change', () => {
  const { controller, key } = teleportHarness('car');
  const sent = [];
  const train = { id: 'south' };
  const railway = {
    taken: null, boarded: undefined,
    takeOver(on) { this.taken = on; return on ? {} : null; },
    board(t) { this.boarded = t; return t; },
    setControls(throttle, brake) { sent.push([throttle, brake]); },
    seat: (t) => (t === train ? { x: 5, y: 2, z: 7, heading: 1, speed: 3, visible: true } : null),
    cab: () => ({ x: 12, y: 3, z: -40, heading: 2, speed: 9 })
  };
  const rhb = { type: 'rhb', label: 'RhB', position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, heading: 0, speed: 0 };
  controller.entities.rhb = rhb;
  controller.setRailway(railway);
  const changes = [];
  controller.onModeChange((prev, next) => changes.push([prev, next]));
  controller.setMode('rhb', { passenger: train });
  assert.equal(railway.boarded, train);
  assert.equal(railway.taken, null, 'a passenger does not take the train over');
  assert.equal(controller.rhbPassenger, train);
  assert.equal(rhb.label, 'RhB · Passenger');
  controller.setMode('rhb'); // (the HUD's selectMode after boarding: no take-over)
  assert.equal(railway.taken, null);
  key('keydown', 'KeyW');
  controller.updateRhB(0.1);
  assert.equal(sent.length, 0, 'no throttle for a passenger');
  assert.deepEqual({ x: rhb.position.x, z: rhb.position.z, heading: rhb.heading, speed: rhb.speed }, { x: 5, z: 7, heading: 1, speed: 3 });
  controller.setMode('car');
  assert.equal(railway.boarded, null, 'got off');
  assert.equal(controller.rhbPassenger, null);
  assert.equal(railway.taken, null, 'nothing handed back: it was never taken');
  assert.deepEqual(changes, [['car', 'rhb'], ['rhb', 'car']]);
});

test('cargo bike teleport clearance includes its forward cargo deck and small front wheel', () => {
  const obstacle = { minX: -0.12, maxX: 0.12, minZ: 0.84, maxZ: 1.04, maxY: 20 };
  const { controller } = teleportHarness('cargobike', [obstacle]);
  const arrival = controller.teleportActiveTo(0, 0, 0);
  assert.notDeepEqual({ ...arrival }, { x: 0, z: 0 }, 'the long frame must clear the obstacle in front of the rider');
});

for (const mode of ['person', 'car', 'cyclist', 'cargobike', 'helicopter']) {
  test(`${mode} teleport stops carried motion and updates its arrival pose immediately`, () => {
    const { controller, ent, key } = teleportHarness(mode);
    key('keydown', 'KeyW');
    key('keydown', 'Space');
    controller.setTouchInput('left', 0.8);
    const result = controller.teleportActiveTo(30, 20, 0.7);
    assert.deepEqual({ ...result }, { x: 30, z: 20 }, 'an open destination is kept exactly');
    assert.equal(ent.heading, 0.7);
    assert.equal(ent.speed, 0);
    assert.equal(Object.values(controller.keys).some(Boolean), false);
    assert.equal(controller._pressedCodes.size, 0);
    assert.deepEqual([ent.mesh.position.x, ent.mesh.position.y, ent.mesh.position.z], [ent.position.x, ent.position.y, ent.position.z]);
    assert.equal(ent.mesh.rotation.y, 0.7);
    if (mode === 'person') {
      assert.equal(ent.verticalVel, 0);
      assert.equal(ent.position.y, 0.22);
      assert.deepEqual(ent.rig.resetArgs.slice(0, 3), [30, 20, 0.7]);
      assert.equal(ent.rig.resetArgs[3](ent.rig.resetArgs[4], 30, 20), 0.22);
    } else if (mode === 'car') {
      for (const field of ['vx', 'vz', 'angularVel', 'steerAngle', 'pitchVel', 'rollVel', 'heaveY', 'heaveVel']) assert.equal(ent[field], 0, field);
      assert.equal(ent.chassisPivot.rotation.x, 0);
      assert.equal(ent.chassisPivot.rotation.z, 0);
      assert.equal(ent.chassisPivot.position.y, 0);
      assert.equal(ent.wheels[0].steerPivot.rotation.y, 0);
      assert.equal(ent.lastCollisionSpark, null);
      assert.equal(ent.carState.value.x, 0);
      assert.equal(ent.carState.value.w, 0);
    } else if (mode === 'cyclist' || mode === 'cargobike') {
      assert.equal(ent.leanAngle, 0);
      assert.equal(ent.leanPivot.rotation.z, 0);
    } else {
      for (const field of ['verticalSpeed', 'pitchAngle', 'rollAngle']) assert.equal(ent[field], 0, field);
      assert.equal(ent.tiltPivot.rotation.x, 0);
      assert.equal(ent.tiltPivot.rotation.z, 0);
      assert.equal(ent.tiltPivot.position.y, 0);
      assert.equal(ent.position.y, 120, 'keep the helicopter altitude when already above the minimum');
    }
    const before = [ent.position.x, ent.position.y, ent.position.z, ent.heading];
    if (mode === 'cargobike') controller.updateCyclist(0.1, ent, mode);
    else controller[`update${mode[0].toUpperCase()}${mode.slice(1)}`](0.1, 0);
    assert.deepEqual([ent.position.x, ent.position.y, ent.position.z, ent.heading], before, 'the first neutral frame stays at the arrival');
  });
}

test('teleport checks all overlapping buildings instead of leaving a sequential push trap', () => {
  const colliders = [
    { minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 200 },
    { minX: 9, maxX: 20, minZ: 0, maxZ: 10, maxY: 200 }
  ];
  for (const mode of ['person', 'car', 'cyclist', 'cargobike', 'helicopter']) {
    // Reverse order as well: a valid arrival must not rely on collider traversal order.
    for (const list of [colliders, colliders.slice().reverse()]) {
      const { controller, ent } = teleportHarness(mode, list.map(c => ({ ...c })));
      const result = controller.teleportActiveTo(11, 5, 0);
      assert.notDeepEqual({ ...result }, { x: 11, z: 5 });
      const before = [ent.position.x, ent.position.z];
      const radius = mode === 'helicopter' ? 4.5 : mode === 'person' ? 0.48 : 0.65;
      controller.resolveHorizontalCollision(ent.position, radius, mode === 'car' ? ent : null);
      assert.deepEqual([ent.position.x, ent.position.z], before, `${mode} must already be collision-free`);
      assert.equal(ent.position.y, mode === 'helicopter' ? 120 : controller.getGroundHeight(result.x, result.z, mode));
    }
  }
});

test('teleports use oriented building footprints without rejecting clear corners of their bounds', () => {
  const cs = Math.SQRT1_2;
  const box = { minX: -8, maxX: 8, minZ: -8, maxZ: 8, maxY: 200, obb: { cx: 0, cz: 0, hx: 8, hz: 2, cs, sn: cs } };
  for (const mode of ['person', 'car', 'cyclist', 'cargobike', 'helicopter']) {
    const { controller, ent } = teleportHarness(mode, [{ ...box }]);
    assert.deepEqual({ ...controller.teleportActiveTo(7, 7, 0.6) }, { x: 7, z: 7 });
    const actual = controller.teleportActiveTo(0, 0, 0.6);
    const before = [actual.x, actual.z];
    controller.resolveHorizontalCollision(ent.position, mode === 'helicopter' ? 4.5 : mode === 'person' ? 0.48 : 0.65,
      mode === 'car' ? ent : null);
    assert.deepEqual([ent.position.x, ent.position.z], before);
  }
});

test('pedestrians pass clear building corners and resolve real corner hits radially', () => {
  const { controller, ent } = teleportHarness('person', [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 30 }]);
  ent.position.x = ent.position.z = -0.4;
  controller.resolveHorizontalCollision(ent.position, 0.48);
  assert.deepEqual([ent.position.x, ent.position.z], [-0.4, -0.4], 'distance to the corner exceeds the body radius');

  ent.position.x = ent.position.z = -0.2;
  controller.resolveHorizontalCollision(ent.position, 0.48);
  assert.ok(Math.abs(Math.hypot(ent.position.x, ent.position.z) - 0.48) < 1e-6);
  assert.ok(Math.abs(ent.position.x - ent.position.z) < 1e-6, 'a diagonal contact pushes along the corner normal');
});

test('corner collision normals follow an oriented building footprint', () => {
  const cs = Math.SQRT1_2;
  const { controller, ent } = teleportHarness('person', [{
    minX: -10 * cs, maxX: 10 * cs, minZ: -10 * cs, maxZ: 10 * cs, maxY: 30,
    obb: { cx: 0, cz: 0, hx: 5, hz: 5, cs, sn: cs }
  }]);
  // Local (-5.2, -5.2) lies just outside the rotated square's leftmost corner.
  ent.position.x = -10.4 * cs;
  ent.position.z = 0;
  controller.resolveHorizontalCollision(ent.position, 0.48);
  assert.ok(Math.abs(ent.position.x - (-10 * cs - 0.48)) < 1e-6);
  assert.ok(Math.abs(ent.position.z) < 1e-6, 'the correction must not slide sideways along the corner');
});

test('rotated cars use their own separating axes at building corners', () => {
  const { controller, ent } = teleportHarness('car', [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 30 }]);
  ent.heading = -Math.PI / 4;
  ent.speed = 0;
  ent.vx = ent.vz = 0;
  ent.position.x = ent.position.z = -1.8;
  controller.resolveHorizontalCollision(ent.position, 1.35, ent);
  assert.deepEqual([ent.position.x, ent.position.z], [-1.8, -1.8], 'the projected bounds overlap, but the actual car does not');

  ent.position.x = ent.position.z = -0.3;
  controller.resolveHorizontalCollision(ent.position, 1.35, ent);
  assert.ok(Math.abs(ent.position.x + 0.93 * Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(ent.position.z + 0.93 * Math.SQRT1_2) < 1e-6, 'the shortest correction is perpendicular to the car side');
});

test('teleports preserve clear rounded corners and separated rotated cars', () => {
  for (const [mode, coordinate, heading] of [['person', -0.45, 0], ['car', -1.8, -Math.PI / 4]]) {
    const { controller, ent } = teleportHarness(mode, [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 30 }]);
    const arrival = controller.teleportActiveTo(coordinate, coordinate, heading);
    assert.deepEqual({ ...arrival }, { x: coordinate, z: coordinate }, `${mode} has room including the arrival margin`);
    controller.resolveHorizontalCollision(ent.position, mode === 'person' ? 0.48 : 1.35, mode === 'car' ? ent : null);
    assert.deepEqual([ent.position.x, ent.position.z], [coordinate, coordinate], 'teleport clearance agrees with movement');

    const blocked = controller.teleportActiveTo(-0.2, -0.2, heading);
    assert.notDeepEqual({ ...blocked }, { x: -0.2, z: -0.2 }, 'a real corner overlap still needs a different arrival');
  }
});

test('movement and teleports pass underneath elevated building sections', () => {
  for (const mode of ['person', 'car', 'cyclist', 'cargobike', 'helicopter']) {
    const { controller, ent } = teleportHarness(mode, [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, minY: 4, maxY: 30 }]);
    controller.getGroundHeight = () => 0;
    const y = mode === 'helicopter' ? 0.25 : 0;
    Object.assign(ent.position, { x: 5, y, z: 5 });
    controller.resolveHorizontalCollision(ent.position, mode === 'helicopter' ? 4.5 : 0.65, mode === 'car' ? ent : null);
    assert.deepEqual([ent.position.x, ent.position.z], [5, 5], `${mode} fits below the overhang`);
    assert.deepEqual({ ...controller.teleportActiveTo(5, 5, 0, y) }, { x: 5, z: 5 });
  }
});

test('building clearance uses the full player height beneath an overhang', () => {
  for (const [mode, height] of [['person', 1.9], ['car', 1.97], ['cyclist', 1.9], ['cargobike', 1.9], ['helicopter', 3.2]]) {
    const y = mode === 'helicopter' ? 0.25 : 0;
    const { controller, ent } = teleportHarness(mode, [{
      minX: 0, maxX: 10, minZ: 0, maxZ: 10, minY: y + height - 0.1, maxY: 30
    }]);
    controller.getGroundHeight = () => 0;
    Object.assign(ent.position, { x: 5, y, z: 5 });
    controller.resolveHorizontalCollision(ent.position, mode === 'helicopter' ? 4.5 : 0.65, mode === 'car' ? ent : null);
    assert.notDeepEqual([ent.position.x, ent.position.z], [5, 5], `${mode} intersects the underside`);
    assert.notDeepEqual({ ...controller.teleportActiveTo(5, 5, 0, y) }, { x: 5, z: 5 });
  }
});

test('players above a roof are clear once their body bottoms clear it', () => {
  for (const mode of ['person', 'car', 'cyclist', 'cargobike', 'helicopter']) {
    const { controller, ent } = teleportHarness(mode, [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 10 }]);
    controller.getGroundHeight = () => 10.1;
    const y = mode === 'helicopter' ? 10.35 : 10.1;
    Object.assign(ent.position, { x: 5, y, z: 5 });
    controller.resolveHorizontalCollision(ent.position, mode === 'helicopter' ? 4.5 : 0.65, mode === 'car' ? ent : null);
    assert.deepEqual([ent.position.x, ent.position.z], [5, 5], `${mode} clears the visible roof`);
    assert.deepEqual({ ...controller.teleportActiveTo(5, 5, 0, y) }, { x: 5, z: 5 });
  }
});

test('helicopter skids cannot pass through a roof below the body origin', () => {
  const { controller, ent } = teleportHarness('helicopter', [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 10 }]);
  Object.assign(ent.position, { x: 5, y: 10.2, z: 5 });
  controller.resolveHorizontalCollision(ent.position, 4.5);
  assert.notDeepEqual([ent.position.x, ent.position.z], [5, 5]);
  assert.notDeepEqual({ ...controller.teleportActiveTo(5, 5, 0, 10.2) }, { x: 5, z: 5 });
});

test('ground arrivals share movement shoreline limits while helicopters may remain above lower buildings', () => {
  const shore = z => ({ westX: -40 + z * 0.05, eastX: 40 + z * 0.05 });
  const { controller, ent } = teleportHarness('person', [], shore);
  const result = controller.teleportActiveTo(1000, -1000);
  assert.deepEqual({ ...result }, { x: 8.5, z: -470 });
  controller.resolveHorizontalCollision(ent.position, 0.48);
  assert.deepEqual([ent.position.x, ent.position.z], [result.x, result.z]);

  const heli = teleportHarness('helicopter', [{ minX: -30, maxX: 30, minZ: -30, maxZ: 30, maxY: 50 }]);
  heli.ent.position.y = 10;
  assert.deepEqual({ ...heli.controller.teleportActiveTo(0, 0) }, { x: 0, z: 0 });
  assert.equal(heli.ent.position.y, 92);
});

test('a displaced pedestrian samples ground and resets its feet at the resolved destination', () => {
  const { controller, ent } = teleportHarness('person', [{ minX: -4, maxX: 0, minZ: -10, maxZ: 10, maxY: 30 }]);
  assert.deepEqual({ ...controller.teleportActiveTo(-1, 0) }, { x: 3, z: 0 });
  assert.equal(ent.position.y, 0.22, 'the requested point was on the higher ground, but the clear arrival is lower');
  assert.deepEqual(ent.rig.resetArgs.slice(0, 2), [3, 0]);
});

test('failed or invalid teleports keep the current position and stop the player with bounded search', () => {
  const { controller, ent } = teleportHarness('car', [{ minX: -300, maxX: 300, minZ: -300, maxZ: 300, maxY: 500 }]);
  let checks = 0;
  const near = controller.nearColliders;
  controller.nearColliders = function (...args) { checks++; return near.apply(this, args); };
  assert.deepEqual({ ...controller.teleportActiveTo(0, 0) }, { x: 400, z: 400 });
  assert.ok(checks <= 2049, 'the search must be bounded even inside an enormous obstacle');
  assert.equal(ent.speed, 0);
  assert.equal(ent.vx, 0);
  assert.equal(ent.angularVel, 0);
  assert.deepEqual({ ...controller.teleportActiveTo(NaN, Infinity) }, { x: 400, z: 400 });
});

test('successive mode teleports keep parked players out of the arrival and default chase view', () => {
  const { controller, ent: car } = teleportHarness('car');
  const person = teleportHarness('person').ent;
  const cyclist = teleportHarness('cyclist').ent;
  const cargobike = teleportHarness('cargobike').ent;
  controller.entities = { car, person, cyclist, cargobike };
  person.position.x = 300;
  cyclist.position.x = 200;
  cargobike.position.x = 350;
  const heading = Math.PI / 2; // The first radial candidate is +X: its rear camera would sit on the parked car.
  assert.deepEqual({ ...controller.teleportActiveTo(0, 0, heading) }, { x: 0, z: 0 });
  const arrivals = [car];
  const radii = { car: 2.4, person: 0.48, cyclist: 1.0, cargobike: 1.45 };
  for (const mode of ['person', 'cyclist', 'cargobike']) {
    controller.activeMode = mode;
    const ent = controller.entities[mode];
    const actual = controller.teleportActiveTo(0, 0, heading);
    assert.notDeepEqual({ ...actual }, { x: 0, z: 0 });
    for (const parked of arrivals) {
      const dx = parked.position.x - actual.x, dz = parked.position.z - actual.z;
      const cameraBack = Math.cos(0.09) * ent.chaseDistance;
      const along = Math.max(0, Math.min(cameraBack, -dx));
      assert.ok(Math.hypot(dx, dz) > radii[parked.type] + radii[mode], 'player bodies must not overlap');
      assert.ok(Math.hypot(dx + along, dz) > radii[parked.type] + 0.5, 'the complete default chase corridor must be clear');
    }
    assert.deepEqual([car.position.x, car.position.z], [0, 0], 'switching modes leaves the parked car in place');
    arrivals.push(ent);
  }
});

test('player clearance respects altitude and permits a ground arrival under an airborne helicopter', () => {
  const { controller, ent } = teleportHarness('person');
  const helicopter = teleportHarness('helicopter').ent;
  helicopter.position.x = helicopter.position.z = 0;
  helicopter.position.y = 120;
  controller.entities.helicopter = helicopter;
  assert.deepEqual({ ...controller.teleportActiveTo(0, 0) }, { x: 0, z: 0 });
  assert.equal(ent.position.y, 0.22);
  helicopter.position.y = 1;
  assert.notDeepEqual({ ...controller.teleportActiveTo(0, 0) }, { x: 0, z: 0 }, 'a helicopter parked at street level must be avoided');
});

// The buildings' floor plans (js/buildings.js interiors): the walls are colliders, the inside is not, so the clearance
// checks must know the plans themselves, and the movement must put a player who is inside back out
function squarePlan(x0, z0, x1, z1, holes = []) {
  return { minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: 0, maxY: 200, ring: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }], holes };
}

test('a teleport refuses the inside of a building and arrives outside it', () => {
  for (const mode of ['person', 'car', 'cyclist', 'cargobike']) {
    const { controller, ent } = teleportHarness(mode);
    controller.setBuildingInteriors([squarePlan(0, 0, 10, 10)]);
    assert.equal(controller.isSpotClear(mode, 5, 5), false, `${mode}: the inside is not a clear spot`);
    assert.equal(controller.isSpotClear(mode, 12, 5), true, `${mode}: beside it is`);
    const result = controller.teleportActiveTo(5, 5, 0);
    assert.equal(controller.insideBuilding(result.x, result.z), null, `${mode} arrives outside`);
    assert.ok(Math.hypot(result.x - 5, result.z - 5) < 12, `${mode} arrives close by`);
    assert.deepEqual([ent.position.x, ent.position.z], [result.x, result.z]);
  }
  // The helicopter flies over it
  const { controller } = teleportHarness('helicopter');
  controller.setBuildingInteriors([squarePlan(0, 0, 10, 10)]);
  assert.deepEqual({ ...controller.teleportActiveTo(5, 5, 0) }, { x: 5, z: 5 });
});

test('a player inside a building is set outside across the nearest wall, never into the neighbour', () => {
  const { controller, ent } = teleportHarness('person');
  controller.setBuildingInteriors([squarePlan(0, 0, 10, 10), squarePlan(10, 0, 20, 10)]);
  // Nearest to the shared wall at x = 10: across it is the neighbour, so out through z = 0 instead
  Object.assign(ent.position, { x: 9.5, y: 0, z: 1.2 });
  assert.equal(controller.keepOutOfBuildings(ent.position, 0.48), true);
  assert.equal(controller.insideBuilding(ent.position.x, ent.position.z), null);
  assert.ok(Math.abs(ent.position.x - 9.5) < 1e-9 && Math.abs(ent.position.z - -1.08) < 1e-9, `out through the near wall: ${ent.position.x}, ${ent.position.z}`);
  // Outside already: nothing moves
  assert.equal(controller.keepOutOfBuildings(ent.position, 0.48), false);
  // A courtyard is outside the building
  controller.setBuildingInteriors([squarePlan(0, 0, 30, 30, [[{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }]])]);
  Object.assign(ent.position, { x: 15, y: 0, z: 15 });
  assert.equal(controller.keepOutOfBuildings(ent.position, 0.48), false);
  // ... and from the building's inside the courtyard is a way out too
  Object.assign(ent.position, { x: 15, y: 0, z: 9.5 });
  assert.equal(controller.keepOutOfBuildings(ent.position, 0.48), true);
  assert.ok(Math.abs(ent.position.z - 11.08) < 1e-9, `into the courtyard: ${ent.position.z}`);
  // Over the roof (a bridge): not inside
  controller.setBuildingInteriors([{ ...squarePlan(0, 0, 10, 10), maxY: 12 }]);
  assert.equal(controller.insideBuilding(5, 5, 14), null);
  assert.ok(controller.insideBuilding(5, 5, 3));
});
