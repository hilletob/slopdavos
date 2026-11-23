// js/vehicle-specs.js
// The travel modes' measures in one place: one descriptor per mode of the controllers (js/controllers.js), read by
// every module that needs the same number. Pure data (no imports), so that the tests can load it as it is.
//
//   box:     the vehicle's outline, m (half width across, half length along, top over the ground) and mass, kg: the
//            walls' oriented box of a driven car, cargo bike or groomer (js/controllers.js collisionBody), the parked
//            stand-ins' boxes (PARKED_DIMS) and the enterable footprints (js/vehicle-depots.js VEHICLE_FOOTPRINTS)
//   contact: the player's box and mass against the other vehicles (the traffic, js/traffic.js; the trains, trams and
//            buses, js/rhb.js, js/trams.js, js/vbd.js). The car's against the traffic is its box (or the body it
//            wears, car.dims); against the trains, trams and buses it is RAIL_CAR_CONTACT. A mode without one (the
//            helicopter, the train) counts as the car's box and the pedestrian's mass where it is not left out.
//   topSpeedKmh: the speed meter's full scale (js/main.js; the cargo bike has none: 80)
//   topdown: the bird's-eye camera's base height, m (js/cameras.js)
//   camera:  the chase, action and pov presets' per-mode numbers (js/cameras.js); what is left out takes the default
//            there (CAMERA_DEFAULTS)
//
// The bodies the car wears in the GTA mode (js/gta-takeover.js) carry their own measures: a traffic car's from its
// body spec and TRAFFIC_MASS, the quad's from js/quad.js QUAD_MODEL, the bus's from js/gta-takeover.js BUS.

export const VEHICLE_SPECS = {
  person: {
    contact: { halfW: 0.32, halfL: 0.32, mass: 80 },
    topSpeedKmh: 30, // (the run's boosted 8.2 m/s)
    topdown: 28,
    camera: {}
  },
  car: {
    box: { halfW: 0.93, halfL: 2.33, top: 1.97, mass: 1700 }, // the VW T3 (js/vw-t3.js)
    topSpeedKmh: 130,
    topdown: 45,
    camera: { lookUpBias: 0.45, action: { side: 2.65, back: 3.6 }, pov: { forward: 0.55, eye: 1.52 } }
  },
  cyclist: {
    box: { halfW: 0.3, halfL: 0.85, top: 1.1 }, // the parked bicycle's
    contact: { halfW: 0.35, halfL: 0.85, mass: 95 },
    topSpeedKmh: 69,
    topdown: 34,
    camera: { pov: { forward: 0.35, eye: 1.55 } }
  },
  cargobike: {
    box: { halfW: 0.38, halfL: 1.34 },
    contact: { halfW: 0.38, halfL: 1.34, mass: 140 },
    topdown: 34,
    camera: { lookUpBias: 0.8, lookAhead: 0.35, pov: { forward: -0.5, eye: 1.55 } }
  },
  helicopter: {
    box: { halfW: 1.3, halfL: 4.6, top: 3.4 }, // the H145's fuselage and skids, parked
    topSpeedKmh: 188,
    topdown: 90,
    camera: { lookUpBias: 0.2, action: { side: 4.2, back: 8.5 }, pov: { forward: 1.65, eye: 1.65 } }
  },
  snowcat: {
    box: { halfW: 2.2, halfL: 3.6, top: 3.45, mass: 9000 }, // over the tracks and blade wings, blade lip to comb; roof rack
    topSpeedKmh: 25,
    topdown: 45,
    camera: { action: { side: 3.6, back: 5.4 }, pov: { forward: 1.1, eye: 2.35 } } // (pov: the driver's seat, high in the cab)
  },
  rhb: {
    topSpeedKmh: 60,
    topdown: 65,
    camera: { action: { side: 3.4, back: 9 }, pov: { forward: 0.6, eye: 2.75 } } // (pov: behind the raked windscreen)
  }
};
VEHICLE_SPECS.car.contact = VEHICLE_SPECS.car.box;
VEHICLE_SPECS.snowcat.contact = VEHICLE_SPECS.snowcat.box;

/** The modes the controllers know, in the order of the touch screen's mode buttons */
export const MODES = Object.keys(VEHICLE_SPECS);

/** The camera presets' numbers for a mode that has none of its own (the pedestrian's; js/cameras.js) */
export const CAMERA_DEFAULTS = { lookUpBias: 1.55, lookAhead: 5.2, action: { side: 0.95, back: 2.8 }, pov: { forward: 0.35, eye: 1.68 } };

/** The car's box against the trains, trams and buses (narrower and shorter than the T3's box against the traffic) */
export const RAIL_CAR_CONTACT = { halfW: 0.86, halfL: 2.18 };

/** A traffic car's mass by its body type (js/traffic.js, and the same body worn by the player's car, js/gta-takeover.js) */
export const TRAFFIC_MASS = { van: 2400, suv: 1800, hatch: 1300, sedan: 1600, taxi: 1600, truck: 7500 };
export const TRAFFIC_MASS_DEFAULT = 1600;

/**
 * The player's box against another vehicle in `mode`: the mode's own contact box, else `carBox` (the car, and the
 * modes without one)
 */
export function playerContact(mode, carBox) {
  return (mode !== 'car' && VEHICLE_SPECS[mode]?.contact) || carBox;
}

/** The player's mass in `mode`: the car's body's (`dims`, the body it wears) or the T3's; a mode without one 80 kg */
export function playerMass(mode, dims = null) {
  if (mode === 'car') return dims?.mass ?? VEHICLE_SPECS.car.box.mass;
  return VEHICLE_SPECS[mode]?.contact?.mass ?? VEHICLE_SPECS.person.contact.mass;
}
