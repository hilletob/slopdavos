import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { countGpuAllocations, gpuCounts, textureBytes } from '../js/mem-hud.js';

test('a texture counts every mip of every layer by its format', () => {
  assert.equal(textureBytes({ width: 4, height: 4 }), 64);
  assert.equal(textureBytes({ width: 4, height: 4, mips: 3 }), 64 + 16 + 4);
  assert.equal(textureBytes({ width: 2, height: 2, layers: 6, format: 'rgba16float' }), 2 * 2 * 6 * 8);
  assert.equal(textureBytes({ width: 2, height: 2, format: 'r8unorm', samples: 4 }), 16);
});

test('the GPU counters follow what is made and destroyed, and do nothing without WebGPU', () => {
  assert.equal(countGpuAllocations({}), false);
  class GPUBuffer { destroy() { return 'destroyed'; } }
  class GPUTexture { destroy() {} }
  class GPUDevice {
    createBuffer() { return new GPUBuffer(); }
    createTexture() { return new GPUTexture(); }
    createShaderModule() { return {}; }
    createRenderPipeline() { return {}; }
    createRenderPipelineAsync() { return Promise.resolve({}); }
  }
  assert.equal(countGpuAllocations({ GPUDevice, GPUBuffer, GPUTexture }), true);
  const device = new GPUDevice();
  const buffer = device.createBuffer({ size: 128 });
  assert.ok(buffer instanceof GPUBuffer, 'the real object comes back');
  assert.equal(buffer.destroy(), 'destroyed', 'and is really destroyed');
  assert.equal(gpuCounts().bufferBytes, 0);
  const kept = device.createBuffer({ size: 256 });
  assert.equal(gpuCounts().bufferBytes, 256);
  assert.equal(gpuCounts().buffers, 1);
  kept.destroy();
  kept.destroy(); // (twice: counted once)
  assert.equal(gpuCounts().buffers, 0);
  device.createTexture({ size: { width: 2, height: 2 }, format: 'rgba8unorm' });
  assert.equal(gpuCounts().textureBytes, 16);
  device.createShaderModule({});
  assert.equal(gpuCounts().shaders, 1);
});

test('without the switch in the URL the read-out is not even loaded', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /from '\.\/mem-hud\.js'/);
  assert.match(main, /\/\[\?&\]memhud=\(1\|true\)\\b\/\.test\(location\.search\) \? await import\('\.\/mem-hud\.js'\) : null/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /mem-hud/, 'nor preloaded');
});
