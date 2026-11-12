// js/player-character.js
// What the player says about themselves, in their own words (play.html #figure-dialog, under the figures): the missions'
// writer (js/personal-text.js) writes for that character. Kept in this browser and, signed in, in the account's cloud
// save with the figure (js/account-merge.js WORLD_KEYS.character). No DOM in here.

export const CHARACTER_KEY = 'slopdavos-character';
export const CHARACTER_MAX = 300;

export const cleanCharacter = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHARACTER_MAX);

export function readCharacter(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CHARACTER_KEY);
    return typeof raw === 'string' ? cleanCharacter(JSON.parse(raw)) : '';
  } catch { return ''; }
}

/** Kept as JSON, like the rest of the world the cloud save carries; an empty text removes it */
export function rememberCharacter(text, storage = globalThis.localStorage) {
  const clean = cleanCharacter(text);
  try { if (clean) storage?.setItem(CHARACTER_KEY, JSON.stringify(clean)); else storage?.removeItem(CHARACTER_KEY); } catch { /* storage is optional */ }
  return clean;
}
