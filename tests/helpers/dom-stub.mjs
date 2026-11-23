// The page as js/i18n.js needs it outside a browser: Node and NodeFilter for its tree walk, a document that is still
// loading (so the observer never starts), a window that takes the languagechange event, the browser's language
// (German, de-CH, so a test does not depend on the machine's locale) and a localStorage kept in a Map.
//
// js/i18n.js reads these globals when it is first imported, so stub first and import it after, dynamically:
//
//   import { loadI18n } from './helpers/dom-stub.mjs';
//   const { t, setLanguage } = await loadI18n();          // at the top level or inside a test
//
// (a static `import … from '../js/i18n.js'` would be hoisted above the stub). Each test file runs in its own process,
// so the stubs stay within the file.

// Sets up the globals; Node, NodeFilter, document and window only where they are missing, the localStorage always
// (backed by `storage`, which is returned). Returns the Map the localStorage keeps its entries in.
export function stubPage({ storage = new Map(), language = 'de-CH' } = {}) {
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  Object.defineProperty(globalThis, 'navigator', { value: { language }, configurable: true });
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.window ??= { dispatchEvent() {} };
  return storage;
}

// stubPage(options), then js/i18n.js
export async function loadI18n(options) {
  stubPage(options);
  return import('../../js/i18n.js');
}
