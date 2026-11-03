import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  dot,
  mix,
  min,
  max,
  pow,
  smoothstep,
  length,
  screenUV,
  screenSize
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { winter } from './season.js';
import { QUALITY } from './quality.js';

// Scene-linear color grading and lens bloom, composed in the existing final render pass.

// Exposure and white balance belong to the camera, independently of the physical lighting: js/day-cycle.js has them per
// time of day. Keep exposure restrained for ACES; stronger bloom stays selective so midtones retain their contrast.
//
// In winter the sunlit snow fields fill much of the frame at several times middle gray: at the summer exposure they ride
// ACES' shoulder into a flat white and spill bloom over everything, a milky veil. On a sunny winter day the camera
// stops down for the snow, keeps bloom to the true highlights (the bloom input is scaled by `bloomGate`, so lamps and
// neon still glow) and holds a little more contrast. Mixed in by season.js's `winter`; dusk and night keep
// their mood, so their factors stay at (nearly) neutral.

function createPostProcessing(renderer, sceneColor, reflections) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Exposure is applied before bloom so its threshold follows the image's exposed brightness.
  // RenderPipeline performs ACES and the output color-space conversion exactly once, after this graph.
  renderer.toneMappingExposure = 1.0;

  const exposure = uniform(1.0);
  const contrast = uniform(1.0);
  const saturation = uniform(1.0);
  const balance = uniform(new THREE.Vector3(1, 1, 1));
  const winterExposure = uniform(1.0);
  const winterContrast = uniform(1.0);
  const winterSaturation = uniform(1.0);
  const winterBloomGate = uniform(1.0);
  const exposed = max(sceneColor.rgb.add(reflections.rgb), vec3(0)).mul(exposure).mul(mix(float(1), winterExposure, winter)).mul(balance);

  // Limit only bloom's peak radiance, scaling RGB together to retain neon and lamp colors.
  // The original HDR image keeps its full range for the tone mapper's highlight shoulder.
  const peak = max(max(exposed.r, exposed.g), exposed.b);
  const bloomInput = vec4(exposed.mul(float(8.0).div(max(peak, 8.0))).mul(mix(float(1), winterBloomGate, winter)), 1.0);
  const bloomPass = bloom(bloomInput, 0.24, 0.40, 1.20);
  bloomPass.smoothWidth.value = 0.30;
  bloomPass.setResolutionScale(QUALITY.bloomScale); // (half resolution; a quarter on the mobile profile, js/quality.js)

  const outputNode = Fn(() => {
    const color = exposed.add(bloomPass.rgb).toVar();
    const luma = dot(color, vec3(0.2126, 0.7152, 0.0722)).toVar();

    // Gentle cool shadow / warm highlight separation; multiply rather than lifting the black level.
    const shadows = mix(vec3(0.965, 1.005, 1.045), vec3(1), smoothstep(0.02, 0.60, luma));
    const highlights = mix(vec3(1), vec3(1.035, 1.005, 0.965), smoothstep(0.60, 3.0, luma));
    color.mulAssign(shadows.mul(highlights));

    // Contrast pivots around middle gray and scales RGB together, avoiding per-channel gamma shifts.
    color.mulAssign(pow(max(luma, 0.0001).div(0.18), contrast.mul(mix(float(1), winterContrast, winter)).sub(1.0)));
    const gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    const chroma = max(max(color.r, color.g), color.b).sub(min(min(color.r, color.g), color.b));
    const vibrance = float(0.10).mul(float(1).sub(chroma.div(max(max(max(color.r, color.g), color.b), 0.0001))));
    color.assign(max(mix(vec3(gray), color, saturation.mul(mix(float(1), winterSaturation, winter)).add(vibrance)), vec3(0)));

    // Normalize by the corner radius so the lens falloff remains subtle in portrait and landscape.
    const aspect = screenSize.x.div(screenSize.y);
    const radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(length(vec2(aspect, 1).mul(0.5)));
    const vignette = float(1).sub(smoothstep(0.35, 1.0, radius).mul(0.12));
    return vec4(color.mul(vignette), 1.0);
  })();

  // A moment of the day (js/day-cycle.js sampleDay): uniforms only, js/main.js steps this every few seconds
  function applyLook(s) {
    exposure.value = s.exposure;
    contrast.value = s.contrast;
    saturation.value = s.saturation;
    balance.value.set(s.balanceR, s.balanceG, s.balanceB);
    bloomPass.strength.value = s.bloom;
    bloomPass.threshold.value = s.threshold;
    winterExposure.value = s.wExposure;
    winterContrast.value = s.wContrast;
    winterSaturation.value = s.wSaturation;
    winterBloomGate.value = s.wBloomGate;
  }

  return { outputNode, applyLook };
}

export { createPostProcessing };
