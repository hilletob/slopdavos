import assert from 'node:assert/strict';

// A synthetic frame as a mission's objective.check(frame, state) sees it from js/missions.js: where the player is,
// in which mode, how fast, the step (dt) and the clock (t). frameWith(defaults) gives a file its own
// frame(over) with the defaults it needs (another mode, a step of 1/60 s, a vehicle's switches):
//
//   const frame = frameWith({ mode: 'car', dt: DT });
//   m.objectives[0].check(frame({ x: 10, speed: 5 }), state);
export const BASE_FRAME = Object.freeze({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0 });
export const frameWith = (defaults = {}) => (over = {}) => ({ ...BASE_FRAME, ...defaults, ...over });

// a ≈ b within eps, with the values in the message
export const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≈ ${b} ± ${eps}`);
