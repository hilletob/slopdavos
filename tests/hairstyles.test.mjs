import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonGeometry, HAIRSTYLE, PersonRig, rollHairstyle } from '../js/pedestrians.js';

const PART_MOHAWK = 8;
const PART_DREADS = 9;

function shares(female) {
  const n = 20000;
  const count = { mohawk: 0, dreads: 0, long: 0, other: 0 };
  for (let i = 0; i < n; i++) {
    const { hairstyle, hair } = rollHairstyle((i + 0.5) / n, female);
    assert.ok(hair >= 0 && hair <= 1, `hair ${hair} in 0..1`);
    if (hairstyle === HAIRSTYLE.MOHAWK) count.mohawk++;
    else if (hairstyle === HAIRSTYLE.DREADS) count.dreads++;
    else if (hair === 1) count.long++;
    else count.other++;
  }
  return Object.fromEntries(Object.entries(count).map(([k, v]) => [k, v / n]));
}

test('hairstyle shares: mohawks rare, dreadlocks occasional, long hair common', () => {
  const f = shares(true);
  const m = shares(false);
  for (const s of [f, m]) {
    assert.ok(s.mohawk > 0.01 && s.mohawk <= 0.05, `mohawk ${s.mohawk}`);
    assert.ok(s.dreads > s.mohawk && s.dreads <= 0.08, `dreads ${s.dreads}`);
    assert.ok(s.long > s.dreads, `long ${s.long}`);
  }
  assert.ok(f.long > 0.5, 'most women wear it long');
  assert.ok(m.mohawk > f.mohawk, 'mohawks are a little more common on men');
});

test('the pose buffer carries the hairstyle above the hair amount, in ranges the shaders tell apart', () => {
  const w = (o) => new PersonRig(o).pose.at(-1);
  assert.equal(w({ hair: 0.3 }), Math.fround(0.3)); // plain: unchanged, as the skiers' and hikers' beanies read it
  assert.ok(w({ hair: 1 }) <= 1);
  assert.ok(w({ hair: 0, hairstyle: HAIRSTYLE.MOHAWK }) === 2);
  assert.ok(w({ hair: 0.2, hairstyle: HAIRSTYLE.DREADS }) > 3.5);
  // the beanie test (hair < 0.4) can never be true on either
  assert.ok(w({ hair: 0, hairstyle: HAIRSTYLE.MOHAWK }) >= 0.42);
});

// Vertices of a part, and where the style unfolds them to
function partOf(geo, part) {
  const skin = geo.getAttribute('skin');
  const pos = geo.getAttribute('position');
  const delta = geo.getAttribute('hairDelta');
  const normal = geo.getAttribute('normal');
  const out = [];
  for (let v = 0; v < pos.count; v++) {
    if (skin.getW(v) !== part) continue;
    out.push({
      bind: [pos.getX(v), pos.getY(v), pos.getZ(v)],
      x: pos.getX(v) + delta.getX(v),
      y: pos.getY(v) + delta.getY(v),
      z: pos.getZ(v) + delta.getZ(v),
      nx: normal.getX(v)
    });
  }
  return out;
}

test('mohawk & dreadlocks stay light and fold to a point inside the head when not worn', () => {
  const budget = { 1: { mohawk: 60, dreads: 230, total: 2500 }, 0: { mohawk: 30, dreads: 80, total: 820 } };
  for (const detail of [1, 0]) {
    const geo = buildPersonGeometry(detail);
    const mohawk = partOf(geo, PART_MOHAWK);
    const dreads = partOf(geo, PART_DREADS);
    assert.ok(mohawk.length > 0 && mohawk.length <= budget[detail].mohawk, `mohawk ${mohawk.length} vertices`);
    assert.ok(dreads.length > 0 && dreads.length <= budget[detail].dreads, `dreadlocks ${dreads.length} vertices`);
    assert.ok(geo.getAttribute('position').count <= budget[detail].total, `person ${geo.getAttribute('position').count} vertices`);
    const fold = mohawk[0].bind;
    for (const v of [...mohawk, ...dreads]) assert.deepEqual(v.bind, fold);
    // ... and unfold around the head: a crest over the crown, ropes down to the shoulders and the back
    assert.ok(Math.max(...mohawk.map((v) => v.y)) > 1.8, 'the crest stands over the crown');
    assert.ok(Math.max(...mohawk.map((v) => Math.abs(v.x))) < 0.02, 'a narrow crest');
    assert.ok(Math.min(...dreads.map((v) => v.y)) < 1.4, 'ropes reach down the back');
    assert.ok(Math.max(...dreads.map((v) => v.z)) < 0.08, 'and leave the face free');
  }
});

test('the crest faces outwards (its triangles are not culled away)', () => {
  for (const detail of [1, 0]) {
    for (const v of partOf(buildPersonGeometry(detail), PART_MOHAWK)) {
      if (Math.abs(v.x) > 0.008) assert.equal(Math.sign(v.nx), Math.sign(v.x));
    }
  }
});
