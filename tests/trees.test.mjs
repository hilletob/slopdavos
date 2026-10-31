import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { SPECIES_HEIGHT, SPECIES_INDEX, TREE_SPECIES } from '../js/trees.js';

const dir = new URL('../assets/trees/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('ez-trees.json', dir), 'utf8'));
const bin = readFileSync(new URL('ez-trees.bin', dir));

test('the baked EZ-Tree models: mostly spruce and larch, within the triangle budget', () => {
  const count = (species) => manifest.models.filter((m) => m.species === species).length;
  assert.equal(count('spruce'), 4);
  assert.equal(count('larch'), 3);
  assert.equal(count('maple'), 2);
  assert.equal(count('birch'), 2);
  assert.deepEqual(manifest.models.filter((m) => m.species === 'spruce').map((m) => m.shape), ['young', 'medium', 'tall', 'broken']);
  assert.ok(existsSync(new URL('LICENSE-ez-tree.txt', dir)));
  for (const m of manifest.models) {
    const name = `${m.species} ${m.shape}`;
    assert.ok(m.triangles <= 12000, `${name}: ${m.triangles} triangles`);
    assert.ok(m.vertices < 65536, name);
    assert.equal(m.indexCount, m.triangles * 3, name);
    // (blocks inside the file and 4-byte aligned)
    for (const [key, bytes] of [['position', 6], ['normal', 3], ['uv', 4], ['aTree', 4]]) {
      assert.equal(m[key] % 4, 0, `${name} ${key}`);
      assert.ok(m[key] + m.vertices * bytes <= bin.length, `${name} ${key}`);
    }
    assert.ok(m.index + m.indexCount * 2 <= bin.length, name);
    // Sized to the species (trees.js scales them per tree), standing on the ground, leaf cards in the species' tile
    const s = SPECIES_INDEX[m.species];
    assert.equal(m.height, SPECIES_HEIGHT[s], name);
    assert.equal(m.tile, TREE_SPECIES[s].tile, name);
    assert.ok(Math.abs(m.min[1]) < 0.5 && m.max[1] > m.height * 0.9 && m.max[1] < m.height * 1.35, `${name}: ${m.min[1]}..${m.max[1]}`);
    const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length);
    const index = new Uint16Array(ab, m.index, m.indexCount);
    assert.ok(index.every((i) => i < m.vertices), name);
    assert.ok(m.cards > 500, `${name}: ${m.cards} leaf cards`);
  }
});
