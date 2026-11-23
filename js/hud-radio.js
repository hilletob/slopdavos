// js/hud-radio.js
// The radio in the speed cluster (play.html #hud-radio; the station from js/car-radio.js): the station's logo
// (assets/logos/radio/) or, until that has loaded, its name; a click goes on to the next station and after the last one
// to off (a struck-out radio then, which switches it on again). It pulses while it tunes in and is dimmed without a
// signal.

/** The station's logo, or null */
export const radioLogo = (station) => (station?.logo ? new URL(`../assets/logos/radio/${station.logo}`, import.meta.url).href : null);

/** Binds the cluster's radio button to `radio`; gives back the render to call when the radio or the mode changes */
export function bindRadioBadge(element, radio) {
  const logo = element?.querySelector('img'), name = element?.querySelector('.gauge-radio-name');
  let shown;
  logo?.addEventListener('load', () => { if (shown) { logo.hidden = false; name.hidden = true; } });
  logo?.addEventListener('error', () => { logo.hidden = true; name.hidden = !shown; });
  element?.addEventListener('click', () => { radio.cycle(); element.blur(); }); // (Space is the jump, not this button)
  return function render() {
    if (!element) return;
    element.hidden = !radio.available();
    if (element.hidden) return;
    const station = radio.station;
    element.classList.toggle('is-off', !station);
    element.classList.toggle('is-tuning', !!station && radio.status === 'tuning');
    element.classList.toggle('is-lost', !!station && radio.status === 'error');
    if (station === shown) return;
    shown = station;
    element.title = station ? station.name : 'Radio off';
    element.setAttribute('aria-label', element.title);
    name.textContent = station ? station.short : '';
    name.hidden = !station;
    logo.hidden = true;
    if (station?.logo) logo.src = radioLogo(station);
    else logo.removeAttribute('src');
  };
}
