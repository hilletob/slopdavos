# Tests

Node's own test runner, no framework, no browser. `npm test` runs `node --test tests/*.cjs tests/*.mjs`; each file
runs in its own process, so globals a file sets (the DOM stubs below) stay within it. `npm run lint` covers `tests/` too.

```sh
npm test                                        # everything (about 1100 tests, a minute or two)
node --test tests/missions-golf.test.mjs        # one file
node --test --test-name-pattern="German" tests/missions-post.test.mjs   # the tests of a file whose name matches
```

## Two kinds of test file

**`.mjs`: the module imported as it is.** For code without three.js and without the DOM: the missions' data and
rules (`js/missions-data*.js`), the geodata, the clock, the weather, the i18n, the account merge … Import from `../js/…`
and call it. Most of the suite is written this way, and new tests should be too where the code allows it (keep the
logic three.js-free in a `*-data.js` module and test that). A few `.mjs` tests also read a source file as text to check
that something is wired up (a `case 'icon'` in `js/missions-world.js`, a preload in `play.html`).

**`.cjs` with `loadModule`: a module that imports three.js or the page.** `tests/helpers/module.cjs` `loadModule(source,
{ imports, globals })` rewrites the module's static `import`/`export` lines and runs the code in a `vm` context: every
import is a stub you hand it by specifier (`{ 'three/webgpu': { Vector3, PerspectiveCamera }, './terrain.js': … }`), a
missing one throws. The function bodies run unchanged. Used for the cameras, the controllers, the vehicle physics and
lights, the touch controls, the NYC map. A few `.cjs` files only read sources as text or run them in `vm` themselves.

## Helpers (`tests/helpers/`)

| File | What |
| --- | --- |
| `module.cjs` | `loadModule(source, { imports, globals, filename })`, above |
| `flat-terrain.cjs` | `flatTerrainImports`: stubs for `./terrain.js`, `./davos-frame.js`, `./air-obstacle-field.js` (a flat world at y = 0) to spread into `loadModule`'s imports |
| `three-stubs.cjs` | `Vector3`: a small stand-in with the methods the loaded modules call (add one when needed) |
| `dom-stub.mjs` | `loadI18n(options)`: stubs the page `js/i18n.js` needs (Node, NodeFilter, a loading document, window, `navigator.language` de-CH, a Map-backed localStorage) and then imports it; `stubPage(options)` stubs only. Options: `storage` (a Map, e.g. with the language already saved), `language` |
| `frames.mjs` | `frameWith(defaults)`: a `frame(over)` for a mission's `objective.check(frame, state)`, on foot at the origin unless the defaults say otherwise; `near(a, b, eps, msg)` |

**Mind the import order with the DOM stub.** Static imports are hoisted and run before the file's own code, so
`js/i18n.js` (and anything importing it) must come after the stub, by a dynamic import:

```js
import { loadI18n } from './helpers/dom-stub.mjs';

test('the texts have their German', async () => {
  const { setLanguage, t } = await loadI18n();
  setLanguage('de');
  assert.notEqual(t(POST_MISSION.title), POST_MISSION.title);
});
```

## Conventions

- A mission's texts that change as they are shown are made with `msg()` (`js/messages.js`); its German test makes the
  text from a set-up state and checks the English and `t(text)`.
- `tests/missions.test.mjs` checks every mission's shape (id, title, intro, mode, start, objectives that answer a
  frame); `tests/missions-progress.test.mjs` every mission's medals, colour and icon. A mission's own file checks
  what is particular to it: its list of ids, season, time, features, board, pins apart, preloads in `play.html`.
