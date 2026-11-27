// node finish.mjs <slug>:<osm id> … (from the scratchpad folder, after in-game.mjs extract() wrote recv/<slug>.json)
// → per building: which surveyed batches are its (the share of each batch's points inside OSM's footprint, the OSM
// building its middle stands in), recv/<slug>.sel.json with the chosen ones, buildings/<slug>/survey.txt (analyse-
// building.mjs), ground.json, osm.txt (its footprint and its neighbours'), the OSM-against-survey gap (osm-gap.mjs), and
// prompt-<slug>.txt filled from brief-template.md but for {{PHOTO_NOTE}} and {{NOTE}}, which are mine to write.
// A batch is chosen when its middle stands in the building's footprint, or most of its points do, or its middle
// stands in no OSM building and some of its points are inside; `<slug>:<osm id>:<b,b,…>` overrides the choice.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '../../../..') + '/';
const { DAVOS_DATA } = await import(root + 'js/davos-geodata.js');
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < (r[j] - r[i]) * (z - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
const centre = (r) => { let x = 0, z = 0; const n = r.length / 2; for (let i = 0; i < r.length; i += 2) { x += r[i] / n; z += r[i + 1] / n; } return [x, z]; };
const { SHOPS_DATA } = await import(root + 'js/shops-data.js');
const template = fs.readFileSync(path.join(here, '../brief-template.md'), 'utf8');
for (const arg of process.argv.slice(2)) {
  const [slug, id, force] = arg.split(':');
  const b = DAVOS_DATA.buildings.find((x) => x.id === id);
  // (a building OSM gives no name: the name of the hotel or shop js/shops-data.js places inside it)
  const name = b.name || SHOPS_DATA.find((p) => inRing(b.ring, p.x, p.z) && ['hotel', 'restaurant', 'school', 'supermarket', 'bakery', 'cafe'].includes(p.kind))?.name || slug;
  const D = JSON.parse(fs.readFileSync(`recv/${slug}.json`, 'utf8'));
  console.log(`\n## ${slug} ${name} (${id})`);
  const chosen = [];
  for (const o of D) {
    const p = o.tris.flatMap((t) => [[t[0], t[2]], [t[3], t[5]], [t[6], t[8]]]);
    const share = p.filter(([x, z]) => inRing(b.ring, x, z)).length / p.length;
    const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, mz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const holder = DAVOS_DATA.buildings.find((x) => inRing(x.ring, mx, mz));
    const take = force ? force.split(',').includes(String(o.b)) : holder?.id === id || share > 0.5 || (!holder && share > 0.1);
    if (take) chosen.push(o);
    const ys = o.tris.flatMap((t) => [t[1], t[4], t[7]]);
    console.log(`  ${take ? '✔' : ' '} ${o.u} batch ${o.b}: x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} z ${Math.min(...zs).toFixed(0)}..${Math.max(...zs).toFixed(0)} y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}, ${(share * 100).toFixed(0)} % inside` +
      (holder ? `, middle in ${holder.id} ${holder.name || ''}` : ', middle in no OSM building') + (take && holder && holder.id !== id ? '  ← holds a neighbour too' : ''));
  }
  fs.writeFileSync(`recv/${slug}.sel.json`, JSON.stringify(chosen));
  fs.writeFileSync(`buildings/${slug}/survey.txt`, execFileSync('node', [here + '/analyse-building.mjs', `recv/${slug}.sel.json`]));
  fs.copyFileSync(`recv/${slug}.ground.json`, `buildings/${slug}/ground.json`);
  const [cx, cz] = centre(b.ring), lines = [`## ${slug}`];
  for (const n of DAVOS_DATA.buildings) { const [x, z] = centre(n.ring); if (Math.hypot(x - cx, z - cz) < 60) lines.push(`${n.id} ${n.name || ''} ${n.kind || ''} ${x.toFixed(0)} ${z.toFixed(0)} ${JSON.stringify(n.ring.map((v) => Math.round(v * 10) / 10))}`); }
  fs.writeFileSync(`buildings/${slug}/osm.txt`, lines.join('\n') + '\n');
  console.log('  ' + execFileSync('node', [here + '/osm-gap.mjs', `recv/${slug}.sel.json`, id]).toString().trim().split('\n').pop());
  const fn = 'build' + slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const survey = chosen.map((o) => `${o.u} batch ${o.b}`).join(', ');
  const brief = template.replace(/\{\{REPO\}\}/g, root.replace(/\/$/, '')).replace(/\{\{NAME\}\}/g, name).replace(/\{\{ADDRESS\}\}/g, 'Davos').replace(/\{\{OSM\}\}/g, id)
    .replace(/\{\{SLUG_UPPER\}\}/g, slug.replace(/-/g, '_').toUpperCase()).replace(/\{\{SLUG\}\}/g, slug).replace(/\{\{FN\}\}/g, fn)
    .replace(/\{\{GREP\}\}/g, name.split(' ').slice(-1)[0]).replace(/\{\{DIR\}\}/g, path.resolve(`buildings/${slug}`) + '/')
    .replace(/\{\{SURVEY\}\}/g, survey).replace(/\{\{OSM_FILE\}\}/g, 'osm.txt').replace('(under "## ' + slug + '")', '');
  fs.writeFileSync(`prompt-${slug}.txt`, brief);
  console.log(`  → prompt-${slug}.txt (still to write: {{PHOTO_NOTE}}, {{NOTE}}; the address)`);
}
