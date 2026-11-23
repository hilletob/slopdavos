// js/hud-location.js
// Where you are, in the HUD (play.html #hud-location): the place's name over its street corner, drawn as a pair of
// street-name signs. js/city-config.js getLocationLabel gives the label: "place · street & street", "near street",
// a place or a street alone.

/** A renderer for `element`; `roads`: the mapped streets' names, `places`: the landmarks' (a label naming one is a place) */
export function createLocationSign(element, { roads = [], places = [] } = {}) {
  const roadNames = new Set(roads);
  const placeNames = new Set(places);
  let shown = '';
  return function render(label) {
    if (!element || label === shown) return;
    shown = label;
    let place = '';
    let streets = label;
    const split = label.indexOf(' · ');
    if (split >= 0) {
      place = label.slice(0, split);
      streets = label.slice(split + 3);
    } else if (placeNames.has(label) || (!label.includes(' & ') && !roadNames.has(label))) {
      place = label;
      streets = '';
    }
    const nodes = [];
    if (place) {
      const el = document.createElement('div');
      el.className = 'location-place';
      el.textContent = place;
      nodes.push(el);
    }
    if (streets) {
      const row = document.createElement('div');
      row.className = 'location-signs';
      if (streets.startsWith('near ')) {
        streets = streets.slice(5);
        const near = document.createElement('span');
        near.className = 'location-near';
        near.textContent = 'near';
        row.appendChild(near);
      }
      for (const name of streets.split(' & ')) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    element.replaceChildren(...nodes);
  };
}
