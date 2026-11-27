// node prepare.mjs <slug>:<osm id> … (from a scratchpad folder) → per building: the Mapillary photos with where each was
// taken (buildings/<slug>/photos.txt), a labelled contact sheet (buildings/<slug>/sheet.jpg, to look at before choosing),
// the files that name the building already; then the one line for the game's page that extracts all surveys
// (scripts/in-game.mjs). After it: start recv.py, run that line, then finish.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '../../../..') + '/';
const { DAVOS_DATA } = await import(root + 'js/davos-geodata.js');
const jobs = [];
for (const arg of process.argv.slice(2)) {
  const [slug, id] = arg.split(':');
  const b = DAVOS_DATA.buildings.find((x) => x.id === id);
  if (!b) { console.log(slug, id, 'no such OSM building'); continue; }
  const r = b.ring, n = r.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < r.length; i += 2) { cx += r[i] / n; cz += r[i + 1] / n; }
  const rad = Math.max(...Array.from({ length: n }, (_, i) => Math.hypot(r[2 * i] - cx, r[2 * i + 1] - cz)));
  execFileSync('node', [here + '/mapillary-photos.mjs', slug, id, '12'], { stdio: 'ignore' });
  const count = fs.readdirSync(`buildings/${slug}/photos`).length;
  if (count) execFileSync('python3', ['-I', here + '/contact-sheet.py', `buildings/${slug}`], { stdio: 'ignore' });
  const named = fs.readdirSync(root + 'js').filter((f) => f.endsWith('.js') && !/davos-geodata|names-data|shops-data/.test(f))
    .filter((f) => fs.readFileSync(root + 'js/' + f, 'utf8').includes(id));
  console.log(`${slug} ${id} ${b.name || ''}: centre ${cx.toFixed(0)} ${cz.toFixed(0)}, radius ${rad.toFixed(0)} m, ${count} photos` +
    (count ? ` → buildings/${slug}/sheet.jpg` : '') + (named.length ? `; named in ${named.join(', ')} (built already, or a mission's door?)` : ''));
  jobs.push([slug, [Math.round(cx), Math.round(cz)], Math.round(rad + 25)]);
}
console.log('\nIn the game (recv.py running):');
console.log(`const k = await import('/.claude/skills/gebaeude-nach-foto/scripts/in-game.mjs'); await k.extract(${JSON.stringify(jobs)})`);
