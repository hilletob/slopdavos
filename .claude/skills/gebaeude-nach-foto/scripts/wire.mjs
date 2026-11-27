// node wire.mjs <slug> <buildFn> <var> <prevVar> "<comment>" [--footprints]   (from the repo's root)
// Wires a hand-built module in after the module <prevVar> (js/main.js: the import, the build line, the colliders;
// play.html: both modulepreloads; tests/boot.test.cjs: the count and its comment; --footprints: the module's name in
// tests/surveyed-footprints.test.mjs MODULES). Fails without changing anything if an anchor is missing.
import fs from 'node:fs';
const [slug, fn, v, prev, comment, flag] = process.argv.slice(2);
const edit = (file, f) => { const s = fs.readFileSync(file, 'utf8'), t = f(s); if (t === s) throw new Error(`${file}: nothing changed`); return [file, t]; };
const after = (s, anchor, add) => { const i = s.indexOf(anchor); if (i < 0) throw new Error('anchor missing: ' + anchor.slice(0, 70)); const j = s.indexOf('\n', i) + 1; return s.slice(0, j) + add + s.slice(j); };
const main = edit('js/main.js', (s) => {
  const imp = s.match(new RegExp(`import \\{ build\\w+ \\} from './[\\w-]+\\.js';\\n(?=[\\s\\S]*const ${prev} = skipped)`, 'g'));
  const prevImport = [...s.matchAll(/^import \{ (build\w+) \} from '\.\/([\w-]+)\.js';$/gm)].find((m) => s.includes(`const ${prev} = skipped('${prev}') ? { colliders: [] } : ${m[1]}(scene)`));
  if (!prevImport || !imp) throw new Error('no import for ' + prev);
  s = after(s, prevImport[0], `import { ${fn} } from './${slug}.js';\n`);
  s = after(s, `  const ${prev} = skipped('${prev}')`, `  const ${v} = skipped('${v}') ? { colliders: [] } : ${fn}(scene); // ${comment} (js/${slug}.js)\n`);
  if (!s.includes(`...${prev}.colliders, `)) throw new Error('no colliders of ' + prev);
  return s.replace(`...${prev}.colliders, `, `...${prev}.colliders, ...${v}.colliders, `);
});
const prevSlug = main[1].match(new RegExp(`build\\w+ \\} from './([\\w-]+)\\.js';\\nimport \\{ ${fn} \\}`))[1];
const html = edit('play.html', (s) => after(s, `  <link rel="modulepreload" href="./js/${prevSlug}-data.js" />`, `  <link rel="modulepreload" href="./js/${slug}.js" />\n  <link rel="modulepreload" href="./js/${slug}-data.js" />\n`));
const boot = edit('tests/boot.test.cjs', (s) => s.replace(/links\.length, (\d+)\); \/\/ \(/, (m, n) => `links.length, ${+n + 2}); // (+ js/${slug}.js, js/${slug}-data.js; `));
const out = [main, html, boot];
if (flag === '--footprints') out.push(edit('tests/surveyed-footprints.test.mjs', (s) => s.replace(/(const MODULES = \[[^\]]*)\]/, `$1, '${slug}']`)));
for (const [file, text] of out) fs.writeFileSync(file, text);
console.log('wired', slug, 'after', prev, '(' + prevSlug + ')');
