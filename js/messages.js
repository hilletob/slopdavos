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
// The records of the parts a text is made of (a value that is itself a text made with msg(), or a list of them), kept
// with it: its German still finds theirs once msg() has forgotten them
function partsOf(params) {
  let parts = null;
  const keep = (v) => { if (typeof v === 'string' && made.has(v)) (parts ||= new Map()).set(v, made.get(v)); };
  for (const v of Object.values(params)) { if (Array.isArray(v)) v.forEach(keep); else keep(v); }
  return parts;
}

export function msg(en, de, params = {}) {
  const text = fill(en, params);
  const parts = partsOf(params);
  made.delete(text);
  made.set(text, { de, params, parts });
  if (made.size > LIMIT) made.delete(made.keys().next().value);
  return text;
}

/** The record msg() keeps of a text ({ de, params }), or undefined: js/i18n.js keeps it with the node that shows the text,
 *  so that a text on show longer than the last LIMIT texts still finds its German after a switch of language */
export const madeOf = (text) => made.get(text);

/** The German of a record of madeOf(); `translate` for the parts marked |t */
export function germanFrom(m, translate) {
  const tr = m.parts ? (v) => { const part = m.parts.get(v); return part ? germanFrom(part, translate) : translate(v); } : translate;
  return typeof m.de === 'function' ? m.de(m.params, tr) : fill(m.de, m.params, tr);
}

const rendering = new Set(); // (texts whose German is being made: a part that is the text itself falls back, no loop)

/** The German of a text made with msg(), or undefined */
export function germanOf(text, translate) {
  const m = made.get(text);
  if (!m || rendering.has(text)) return undefined;
  rendering.add(text);
  try { return germanFrom(m, translate); } finally { rendering.delete(text); }
}
