import assert from 'node:assert/strict';
import test from 'node:test';
import { detectProfile, QUALITY_PROFILES } from '../js/quality.js';

const env = ({ ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0', touch = 0, memory, search = '', coarse = false, fine = true, screen = [1512, 982] } = {}) => ({
  navigator: { userAgent: ua, maxTouchPoints: touch, ...(memory !== undefined ? { deviceMemory: memory } : {}) },
  location: { search },
  screen: { width: screen[0], height: screen[1] },
  matchMedia: (q) => ({ matches: q === '(pointer: coarse)' ? coarse : q === '(any-pointer: fine)' ? fine : false })
});

test('the device profile: phones, tablets and small-memory devices get the mobile one', () => {
  assert.equal(detectProfile(env()).name, 'desktop');
  assert.equal(detectProfile(env({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1' })).name, 'mobile');
  // iPadOS asks for the desktop site but has a touch screen
  assert.equal(detectProfile(env({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', touch: 5 })).name, 'mobile');
  assert.equal(detectProfile(env({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/141.0 Mobile' })).name, 'mobile');
  assert.equal(detectProfile(env({ memory: 4 })).name, 'mobile');
  assert.equal(detectProfile(env({ memory: 8 })).name, 'desktop');
  assert.equal(detectProfile(env({ coarse: true, fine: false, screen: [800, 1280] })).name, 'mobile');
  assert.equal(detectProfile(env({ coarse: true, fine: true, screen: [1366, 768] })).name, 'desktop', 'a touch laptop with a trackpad');
});

test('?quality=mobile|desktop overrides the detection', () => {
  assert.equal(detectProfile(env({ search: '?quality=mobile' })).name, 'mobile');
  const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  assert.equal(detectProfile(env({ ua: iPhone, search: '?quality=desktop' })).name, 'desktop');
  assert.equal(detectProfile(env({ ua: iPhone, search: '?quality=ultra' })).name, 'mobile', 'unknown values are ignored');
});

test('the mobile profile never loads the high-resolution data and draws less', () => {
  const { desktop, mobile } = QUALITY_PROFILES;
  assert.deepEqual(Object.keys(mobile).sort(), Object.keys(desktop).sort(), 'both profiles set every setting');
  assert.equal(mobile.hires, false);
  assert.equal(mobile.sharpRoofs, false);
  assert.equal(mobile.ssr, false);
  assert.equal(mobile.shadows, false, 'no sun shadow maps (a render object and shader state per caster and cascade)');
  assert.ok(mobile.shadowMapSize > 0 && mobile.shadowMapSize <= 1024, '(small ones when switched back on)');
  for (const k of ['cars', 'bikes', 'pedestrians', 'skiers', 'crossCountrySkiers', 'treeShare', 'treeDistance', 'orthoFullNear', 'atlasScale']) {
    assert.ok(mobile[k] < desktop[k], `${k}: fewer / smaller on mobile`);
  }
});

test('the mobile profile is the lite one: compact vertices, a short precompile, small atlases and light lists', () => {
  const { desktop, mobile } = QUALITY_PROFILES;
  assert.equal(mobile.compactGeometry, true, 'indexed ground layers with 8-bit normals (js/gpu-memory.js)');
  assert.equal(desktop.compactGeometry, false, 'the desktop keeps its geometry as built');
  assert.equal(mobile.precompileAll, false, 'only the start view compiles: frustum culling off uploaded the whole valley');
  assert.equal(desktop.precompileAll, true);
  assert.equal(mobile.surroundingsFull, false);
  assert.ok(mobile.atlasScale <= 0.25);
  assert.ok(mobile.treeAtlas <= 512 && mobile.facadeAtlas <= 512);
  assert.ok(mobile.treeShare <= 0.25);
  const [lights, tile, slices, perCluster] = mobile.clusterLights;
  const [dLights, dTile, dSlices, dPerCluster] = desktop.clusterLights;
  assert.deepEqual(desktop.clusterLights, [256, 32, 28, 48], 'the desktop lighting as before');
  assert.ok(lights < dLights && tile >= dTile && slices < dSlices && perCluster < dPerCluster);
});

test('the WebGL 2 fallback tightens the mobile profile further, never the desktop one', async () => {
  const { QUALITY, setBackend } = await import('../js/quality.js');
  const saved = { ...QUALITY };
  try {
    Object.assign(QUALITY, QUALITY_PROFILES.mobile);
    setBackend(false);
    assert.equal(QUALITY.backend, 'WebGL 2');
    assert.ok(QUALITY.treeShare < QUALITY_PROFILES.mobile.treeShare);
    assert.ok(QUALITY.orthoFullNear < QUALITY_PROFILES.mobile.orthoFullNear);
    Object.assign(QUALITY, QUALITY_PROFILES.desktop);
    setBackend(false);
    for (const k of ['treeShare', 'orthoFullNear', 'shadows', 'bloomScale']) assert.equal(QUALITY[k], QUALITY_PROFILES.desktop[k], k);
  } finally {
    for (const k of Object.keys(QUALITY)) delete QUALITY[k];
    Object.assign(QUALITY, saved);
  }
});
