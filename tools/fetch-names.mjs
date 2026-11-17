// tools/fetch-names.mjs — writes js/names-data.js: the geographic names of the Landschaft Davos for js/names.js (the
// map's labels and the summit names in the view). From swisstopo's swissNAMES3D (the national CSV download from
// data.geo.admin.ch; opendata.swiss terms "open use, must provide the source": © swisstopo): the summits and passes
// with their heights, the valleys, ridges, ravines, alps and field names, the lakes, glaciers and streams, the hamlets
// and the huts and mountain restaurants. Stops, lifts, streets and town quarters are left out (the map has its own).
//
// Each name: [name, x, z, height (m a.s.l.), kind, rank]. Kinds: see KINDS below. Rank 0 is shown first (the high
// and the main summits), 3 last (the field names, at the closest zooms only).
// usage: node tools/fetch-names.mjs [--refresh] [--csv dir/with/swissNAMES3D_*.csv]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FRAME, lv95ToWorld } from '../js/davos-frame.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '..', 'js', 'names-data.js');
const CACHE = path.join(DIR, 'data', 'cache', 'swissnames3d.json');
const URL = 'https://data.geo.admin.ch/ch.swisstopo.swissnames3d/swissnames3d_2025/swissnames3d_2025_2056.csv.zip';
const log = (...a) => console.log('[names]', ...a);
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

// swissNAMES3D's Objektart -> [kind, rank]
const KINDS = ['peak', 'pass', 'valley', 'ridge', 'ravine', 'area', 'field', 'place', 'hut', 'lake', 'glacier', 'stream', 'sight'];
const OBJEKTART = {
  'Alpiner Gipfel': ['peak', 0], Hauptgipfel: ['peak', 0], Gipfel: ['peak', 1], Haupthuegel: ['peak', 2], Huegel: ['peak', 2], Felskopf: ['peak', 2],
  Pass: ['pass', 1], Strassenpass: ['pass', 0],
  Haupttal: ['valley', 0], Tal: ['valley', 1], Grat: ['ridge', 2], Graben: ['ravine', 2],
  Gebiet: ['area', 1], 'Flurname swisstopo': ['field', 3], 'Lokalname swisstopo': ['field', 3],
  Ort: ['place', 1], Gebaeude: ['hut', 2], 'Offenes Gebaeude': ['hut', 2],
  See: ['lake', 1], Gletscher: ['glacier', 1], Fliessgewaesser: ['stream', 2],
  Wasserfall: ['sight', 2], Aussichtspunkt: ['sight', 2], 'Grotte, Hoehle': ['sight', 2]
};

function rows() {
  if (!process.argv.includes('--refresh') && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8')).rows;
  let dir = argOf('--csv'), tmp = null;
  if (!dir) {
    dir = tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swissnames3d-'));
    log('downloading', URL);
    execFileSync('curl', ['-sSfL', '-A', 'geodata fetch tool', '-o', path.join(tmp, 'n.zip'), URL], { stdio: 'inherit' });
    execFileSync('unzip', ['-o', '-q', path.join(tmp, 'n.zip'), '-d', tmp]);
  }
  const [e0, n0, e1, n1] = FRAME.lv95;
  const out = [];
  for (const file of ['swissNAMES3D_PKT.csv', 'swissNAMES3D_LIN.csv', 'swissNAMES3D_PLY.csv']) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    const head = lines[0].split(';');
    const col = (name) => head.indexOf(name);
    const [iArt, iName, iStatus, iLang, iType, iE, iN, iZ, iH] = ['OBJEKTART', 'NAME', 'STATUS', 'SPRACHCODE', 'NAMEN_TYP', 'E', 'N', 'Z', 'HOEHE'].map(col);
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(';');
      const E = Number(c[iE]), N = Number(c[iN]);
      if (!(E >= e0 && E <= e1 && N >= n0 && N <= n1) || !OBJEKTART[c[iArt]]) continue;
      out.push({ art: c[iArt], name: c[iName], status: c[iStatus], lang: c[iLang], type: c[iType], E, N, Z: Number(c[iZ]) || null, H: iH >= 0 ? Number(c[iH]) || null : null });
    }
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ source: URL, fetched: new Date().toISOString().slice(0, 10), rows: out }));
  return out;
}

const all = rows();
// One name per object: the official one before the customary ones (exonyms of the same lake or summit lie on the same
// point); the same name of the same kind again within 400 m (a stream's stretches, a field name's two labels) once.
all.sort((a, b) => (a.status === 'offiziell' ? 0 : 1) - (b.status === 'offiziell' ? 0 : 1) || (a.type === 'Exonym' ? 1 : 0) - (b.type === 'Exonym' ? 1 : 0));
const names = [];
for (const r of all) {
  const [kind, rank] = OBJEKTART[r.art];
  const { x, z } = lv95ToWorld(r.E, r.N);
  const k = KINDS.indexOf(kind);
  if (names.some((n) => n[4] === k && (Math.hypot(n[1] - x, n[2] - z) < 5 || (n[0] === r.name && Math.hypot(n[1] - x, n[2] - z) < 400)))) continue;
  names.push([r.name, Math.round(x), Math.round(z), Math.round(r.H || r.Z || 0), k, rank]);
}
names.sort((a, b) => a[5] - b[5] || b[3] - a[3]);

const data = {
  source: 'swisstopo swissNAMES3D 2025, opendata.swiss terms of use (open use, must provide the source)',
  fetched: new Date().toISOString().slice(0, 10),
  kinds: KINDS,
  names
};
fs.writeFileSync(OUT, `// js/names-data.js — GENERATED by tools/fetch-names.mjs, do not edit by hand.\n// The geographic names of Davos: [name, x, z, height (m a.s.l.), kind (index into kinds), rank] in the world frame of\n// js/davos-frame.js. © swisstopo (swissNAMES3D).\nexport const NAMES = ${JSON.stringify(data)};\n`);
log(`${names.length} names from ${all.length} rows: ${KINDS.map((k, i) => `${k} ${names.filter((n) => n[4] === i).length}`).join(', ')}`);
log(`wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
