// Texts written in both languages where they are made. The game puts English into the page and js/i18n.js puts German
// over it (also again after a switch of language); for a text made with msg() its German is known at the source,
// written beside the English, instead of being recognised afterwards by a pattern in js/i18n.js. Change the one and the
// other is right beside it. No imports and no DOM, so the three.js-free mission data modules can use it.
//
//   msg('{d} to the terrace · tank {pct} %', '{d} bis zur Terrasse · Tank {pct} %', { d: '212 m', pct: 70 })
//
// gives back '212 m to the terrace · tank 70 %'. `{name}` puts a value in as it is, `{name|t}` translated (a place's
// name, or a part made with msg() itself). `de` may be a function (params, translate) => text, for plurals and choices.

const LIMIT = 3000; // texts remembered (the most recent: a HUD line changes with every metre)
const made = new Map(); // English as given out -> { de, params }

/** Fills `{name}` and `{name|t}` from params (`tr` for the translated ones) */
export function fill(template, params, tr = (v) => v) {
  return template.replace(/\{(\w+)(\|t)?\}/g, (_, name, translated) => {
    const v = params[name];
    return String(translated ? tr(v == null ? '' : String(v)) : v ?? '');
  });
}

/** The English text, remembering its German */
export function msg(en, de, params = {}) {
  const text = fill(en, params);
  made.delete(text);
  made.set(text, { de, params });
  if (made.size > LIMIT) made.delete(made.keys().next().value);
  return text;
}

/** The German of a text made with msg(), or undefined; `translate` for the parts marked |t */
export function germanOf(text, translate) {
  const m = made.get(text);
  if (!m) return undefined;
  return typeof m.de === 'function' ? m.de(m.params, translate) : fill(m.de, m.params, translate);
}
