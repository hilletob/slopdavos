// js/hud-keybar.js
// The key bar at the bottom (play.html #hud-controls-hint): what the register of actions (js/actions.js) lists now, a key
// or two and a label each. A switch's state only recolours its key (no fresh rise-in of the bar).

/** Binds the bar to the register; gives back its render (the register calls it on every change) */
export function bindKeyBar(element, actions) {
  let shown = '';
  const render = () => {
    if (!element) return;
    const hints = actions.hints();
    const key = hints.map((h) => `${h.kbd.join('+')}|${h.label}`).join(',');
    if (key === shown) {
      element.childNodes.forEach((item, i) => item.classList?.toggle('is-on', !!hints[i]?.on));
      return;
    }
    shown = key;
    const items = hints.map(({ kbd, label, on }) => {
      const item = document.createElement('span');
      item.className = on ? 'hint is-on' : 'hint';
      for (const k of kbd) {
        const kb = document.createElement('kbd');
        kb.textContent = k;
        item.appendChild(kb);
      }
      const text = document.createElement('span');
      text.className = 'hint-label';
      text.textContent = label;
      item.appendChild(text);
      return item;
    });
    element.replaceChildren(...items);
  };
  actions.subscribe(render);
  return render;
}
