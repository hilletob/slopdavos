import * as THREE from 'three/webgpu';
import { groundHeight, tunnelFloor } from './terrain.js';

// The presets' haze was tuned for New York's harbour air; over the Swiss plateau the Alps stand out 50-80 km away on a
// clear day, so the aerial haze (which thins with altitude, see createAerialFogNode) is much lighter.
const HAZE = 0.3;
import {
  Fn,
  float,
  vec3,
  vec4,
  uniform,
  mix,
  fog,
  pmremTexture,
  positionWorld,
  cameraPosition,
  length,
  normalize,
  max,
  exp,
  abs,
  select,
  smoothstep
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { cityUniforms } from './tsl-materials.js';
import { winter } from './season.js';
import { QUALITY } from './quality.js';
import { TIME_PRESETS, createSample, sampleDay, presetMinute } from './day-cycle.js';

// js/lighting.js
// Physically-Based Atmospheric Sky (Preetham SkyMesh + Beer-Powder Clouds),
// Live PMREMGenerator IBL Cubemap, Three.js r186 SunLight (2-Cascade CSM),
// and Occlusion-Aware Urban Canyon Global Illumination for Three.js r186 WebGPURenderer

// The shadow passes draw every caster with one shared override material, onto which the renderer copies each caster's
// alphaTest. Material's alphaTest setter bumps the material version whenever the value crosses 0, so every
// leaf-card / opaque alternation in the render list (a few per frame) left every later render object of the pass with a
// stale version, and three.js then rehashed the override material's whole borrowed node graph (customProgramCacheKey is
// never cached for an override material) for nearly every shadow draw: ~65 ms of JS per frame. Each caster has its own
// render object, built with its own alphaTest (still part of the cache key, as an enumerable own property), so the
// bump is not needed to keep their pipelines apart.
function stabiliseShadowPassMaterial(scene) {
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, scn, camera, target) {
    previous.call(this, renderer, scn, camera, target);
    const mat = scn.overrideMaterial;
    if (!mat || mat.isShadowPassMaterial !== true || Object.prototype.hasOwnProperty.call(mat, 'alphaTest')) return;
    Object.defineProperty(mat, 'alphaTest', {
      get() { return this._alphaTest; },
      set(value) { this._alphaTest = value; },
      enumerable: true,
      configurable: true
    });
  };
}

// A sunny winter day in the Alps: cold, dry air after a snowfall, the Tinzenhorn sharp 15 km away under a deep blue
// sky. Summer's turbidity and haze (warm, moist air) made the snowy valley read milky, the white haze over white snow.
// Mixed in by season.js's `winter` (js/day-cycle.js has the values, w*): `wHaze` scales the aerial perspective's density;
// the sky's Preetham parameters go towards a low-turbidity, low-Mie atmosphere with fewer clouds. Dusk and night keep
// (most of) their mood.

// The environment map (baked from the sky, bakeEnvironmentMap: six faces and their blur) only follows the sky when it has
// visibly moved on, and not more often than this. The fog samples it too.
const MIN_BAKE_MS = 8000;
const BAKE_SUN_COS = Math.cos(4 * Math.PI / 180);
// Where the sky's radiance leaves off rising in a straight line, and where it ends
const SKY_KNEE = 1.0, SKY_TOP = 2.4;
const GLINT_FULL = 2.5; // the direct light at which glints reach full strength
// In a bore (the camera under the mountain) neither sun nor sky reach anyone: the fill light takes the lamps' colour (the
// lining itself is lit by its own shader, js/tunnels.js), or the cars are black silhouettes against it at night. Metres of
// mountain above the floor that make it a bore, not an open cut; how fast the light changes, per second.
const BORE_COVER = 6, BORE_RATE = 2.5;
const BORE_SKY = new THREE.Color().setRGB(1.0, 0.62, 0.3), BORE_GROUND = new THREE.Color().setRGB(0.6, 0.38, 0.2);
const BORE_FILL = 2.2, BORE_ENV = 0.08;

class LightingSystem {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.activePresetId = 'golden';

    // Assign SunLight its node implementation for WebGPURenderer (Light.registerNode since r187; r186 used the library)
    if (SunLight.registerNode) {
      SunLight.registerNode(SunLightNode);
    } else if (renderer && renderer.library) {
      renderer.library.addLight(SunLightNode, SunLight);
    }

    this.scene.fog = new THREE.FogExp2(0xdcc5ae, 0.00024);
    // Leave scene.background = null because SkyMesh renders the 360° sky dome, and setting
    // a THREE.Color on scene.background sets forceClear=true in WebGPURenderer's Background.update,
    // which would otherwise clear Cascade 0 when rendering Cascade 1 in SunShadowNode!
    this.scene.background = null;

    // Physical Preetham SkyMesh + Beer-Powder Clouds (from three/addons/objects/SkyMesh.js). Its unit box must contain
    // the camera wherever it flies over the 1:1 harbour (Manhattan alone is 13.6 km long; it renders at the far plane
    // whatever its size)
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(200000);
    this.sky.turbidity.value = 8.0;
    this.sky.rayleigh.value = 2.8;
    this.sky.mieCoefficient.value = 0.008;
    this.sky.mieDirectionalG.value = 0.88;
    this.sky.cloudScale.value = 0.00018;
    this.sky.cloudSpeed.value = 0.000015;
    this.sky.cloudCoverage.value = 0.36;
    this.sky.cloudDensity.value = 0.38;
    this.sky.cloudElevation.value = 0.52;

    // Calibrate SkyMesh raw radiance (EE=1000 * 0.04) into standard exposure=1.0 HDR range
    this.uSkyExposure = uniform(0.148);
    this.uNightFactor = uniform(0.0);
    this.uTwilightBlue = uniform(0.0);
    this.uNightSkyColor = uniform(new THREE.Color(0x0b1528));
    const rawSkyNode = this.sky.material.colorNode;
    this.sky.material.colorNode = Fn(() => {
      const raw = rawSkyNode;
      const up = normalize(positionWorld.sub(cameraPosition)).y;
      const dayCol = raw.rgb.mul(this.uSkyExposure).add(vec3(0.01, 0.028, 0.10).mul(this.uTwilightBlue).mul(smoothstep(0.02, 0.4, up))).toVar();
      // The sky round the sun and the disc, without limit in the model, end in a soft shoulder (scaled together, so that
      // they keep their colour): a bright glow and a small bloom, not a white wall over half the view
      const peak = max(max(dayCol.r, dayCol.g), dayCol.b).toVar();
      const limited = float(SKY_KNEE).add(float(SKY_TOP - SKY_KNEE).mul(float(1).sub(exp(peak.sub(SKY_KNEE).div(SKY_TOP - SKY_KNEE).negate())))).div(peak);
      const finalSky = mix(dayCol.mul(select(peak.greaterThan(SKY_KNEE), limited, float(1))), this.uNightSkyColor, this.uNightFactor);
      return vec4(finalSky, float(1.0));
    })();

    // In reversedDepthBuffer mode ([1..0]), camera.far is z = 0.0 (whereas SkyMesh defaults to z = w)
    if (renderer && renderer.reversedDepthBuffer) {
      const rawSkyVertexNode = this.sky.material.vertexNode;
      this.sky.material.vertexNode = Fn(() => {
        const pos = rawSkyVertexNode.toVar();
        pos.z.assign(0.0);
        return pos;
      })();
    }

    this.scene.add(this.sky);

    // Reusable PMREMGenerator & offscreen envScene (mirrors webgpu_generator_city.html)
    this.pmremGenerator = renderer ? new THREE.PMREMGenerator(renderer) : null;
    this.envScene = new THREE.Scene();
    this.envRenderTarget = null;

    // Three.js r186 SunLight with automatic 2-Cascade Shadow Map (SunLightShadow + SunShadowNode)
    // Shines from its position vector toward the origin (no .target needed)
    this.sunLight = new SunLight(0xffca92, 5.8);
    this.sunLight.position.set(0, 1, 0);
    this.sunLight.castShadow = QUALITY.shadows;
    // 3072x3072 per cascade = 6144x3072 2-cascade shadow atlas (an 8192x4096 one cost ~20% fps and caused hitches),
    // 2048 where the device allows less. The near cascade spans ~0.35-55 m of the view at street level (see update)
    const maxTex = (renderer && renderer.backend && renderer.backend.device && renderer.backend.device.limits.maxTextureDimension2D) || 4096;
    // (the mobile profile, js/quality.js, draws none; re-enabled for testing, 1024 per cascade over a shorter range:
    // 16 MB instead of 144 MB)
    const tile = QUALITY.shadowMapSize || (maxTex >= 6144 ? 3072 : 2048);
    this.sunLight.shadow.mapSize.set(tile, tile);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 200;
    // Suppress shadow acne along the surface normal in world units
    // so short casters like cars, curbs, tree trunks, and pedestrians keep crisp contact shadows
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);
    stabiliseShadowPassMaterial(this.scene);

    // Subtle Hemisphere Sky + Warm Terracotta/Limestone Ground Bounce Fill
    // (Kept intentionally lower than sunLight so urban canyon shadows remain deep and crisp)
    this.hemiLight = new THREE.HemisphereLight(0x9abbe6, 0xc88a62, 1.05);
    this.hemiLight.position.set(0, 300, 0);
    this.scene.add(this.hemiLight);

    this.sunDisc = 1;
    this.bore = 0; // 0 outside .. 1 in a bore
    this.boreAt = 0;
    this.hemiSky = new THREE.Color();
    this.hemiGround = new THREE.Color();
    this.direct = 0;
    this.fill = 0;
    this.env = 0;
    this.sample = createSample();
    this.baked = { at: -Infinity, x: 0, y: 0, z: 0, night: -1, exposure: -1, turbidity: -1, w: -1 };
    this.bakes = 0;
    this.applyPreset('golden');

    // Sky-matched aerial perspective (replaces the flat FogExp2 colour): distant surfaces fade into the baked sky
    // radiance just above the horizon in their view direction (sun glow included), through an exponential haze layer
    // so helicopter / observatory views stay clearer than the horizon.
    this.uFogDensity = uniform(TIME_PRESETS.golden.fogDensity * HAZE);
    this.uWinterHaze = uniform(TIME_PRESETS.golden.wHaze);
    this.uFogHeight = uniform(900.0);
    if (this.envRenderTarget) this.scene.fogNode = this.createAerialFogNode();
  }

  createAerialFogNode() {
    const toFrag = positionWorld.sub(cameraPosition);
    const dist = length(toFrag);
    const dir = toFrag.div(max(dist, 0.001));
    const horizonDir = normalize(vec3(dir.x, max(dir.y, 0.015), dir.z));
    const skyColor = pmremTexture(this.envRenderTarget.texture, horizonDir, float(0.3)).rgb;
    // Mean haze density exp(-y / H) along the ray between the fragment and the camera
    const H = this.uFogHeight;
    const ya = max(positionWorld.y, 0.0);
    const yb = max(cameraPosition.y, 0.0);
    const dy = yb.sub(ya);
    const ea = exp(ya.div(H).negate());
    const eb = exp(yb.div(H).negate());
    const meanDensity = select(abs(dy).greaterThan(1.0), ea.sub(eb).mul(H).div(dy), ea);
    const tau = this.uFogDensity.mul(mix(float(1), this.uWinterHaze, winter)).mul(dist).mul(meanDensity);
    return fog(skyColor, float(1.0).sub(exp(tau.mul(tau).negate())));
  }

  bakeEnvironmentMap() {
    if (!this.pmremGenerator) return;
    // Bake physical SkyMesh (without solar disc) into scene.environment for realistic canyon IBL.
    // Reuses a single RenderTarget so texture identity never changes.
    this.sky.showSunDisc.value = 0;
    this.envScene.add(this.sky);
    this.envRenderTarget = this.pmremGenerator.fromScene(this.envScene, 0, 0.1, 100, {
      renderTarget: this.envRenderTarget
    });
    this.scene.environment = this.envRenderTarget.texture;
    this.sky.showSunDisc.value = this.sunDisc;
    this.scene.add(this.sky);
  }

  /** The light of a named time of day, at once (the constructor; the game goes by applySample) */
  applyPreset(presetId) {
    const minute = presetMinute(presetId, winter.value) ?? presetMinute('golden', winter.value);
    this.applySample(sampleDay(minute, winter.value, this.sample), winter.value, true);
  }

  /**
   * The light of a moment of the day (js/day-cycle.js sampleDay), `w` the season's blend. js/main.js steps this every few
   * seconds: only uniforms change, so nothing recompiles; `bake` forces the environment map, which otherwise follows when
   * the sky has moved on far enough.
   */
  applySample(s, w, bake = false) {
    this.activePresetId = s.presetId;

    this.sunLight.color.setRGB(s.lightColorR, s.lightColorG, s.lightColorB, THREE.SRGBColorSpace);
    this.direct = s.sunIntensity;
    this.sunLight.position.set(s.sunDirX, s.sunDirY, s.sunDirZ);
    this.sunLight.updateMatrixWorld();

    this.hemiSky.setRGB(s.hemiSkyR, s.hemiSkyG, s.hemiSkyB, THREE.SRGBColorSpace);
    this.hemiGround.setRGB(s.hemiGroundR, s.hemiGroundG, s.hemiGroundB, THREE.SRGBColorSpace);
    this.fill = s.hemiIntensity;
    this.env = s.envIntensity;
    this.applyBore();

    this.scene.fog.color.setRGB(s.fogColorR, s.fogColorG, s.fogColorB, THREE.SRGBColorSpace);
    this.scene.fog.density = s.fogDensity;
    if (this.uFogDensity) this.uFogDensity.value = s.fogDensity * HAZE;
    if (this.uWinterHaze) this.uWinterHaze.value = s.wHaze;

    // The physical Preetham SkyMesh, its air between the summer's and the winter's by the season's blend
    const sky = this.sky;
    sky.turbidity.value = s.turbidity + (s.wTurbidity - s.turbidity) * w;
    sky.rayleigh.value = s.rayleigh + (s.wRayleigh - s.rayleigh) * w;
    sky.mieCoefficient.value = (s.mieCoefficient + (s.wMieCoefficient - s.mieCoefficient) * w) * s.skyMie;
    sky.cloudCoverage.value = s.cloudCoverage + (s.wCloudCoverage - s.cloudCoverage) * w;
    sky.mieDirectionalG.value = s.mieDirectionalG;
    sky.cloudDensity.value = s.cloudDensity;
    sky.sunPosition.value.set(s.skyDirX, s.skyDirY, s.skyDirZ);
    this.sunDisc = s.sunDisc;
    sky.showSunDisc.value = s.sunDisc;
    this.uSkyExposure.value = s.skyExposure;
    this.uNightFactor.value = s.nightFactor;
    this.uTwilightBlue.value = s.twilightBlue;

    // (the glints on glass and paint: as strong as the light they mirror, none in the gap between sun and moon)
    cityUniforms.uSunColor.value.setRGB(s.lightColorR, s.lightColorG, s.lightColorB, THREE.SRGBColorSpace).multiplyScalar(Math.min(1, s.sunIntensity / GLINT_FULL));
    cityUniforms.uSkyTopColor.value.setRGB(s.skyTopR, s.skyTopG, s.skyTopB, THREE.SRGBColorSpace);
    cityUniforms.uSkyHorizonColor.value.setRGB(s.skyHorizonR, s.skyHorizonG, s.skyHorizonB, THREE.SRGBColorSpace);
    cityUniforms.uSkySunDir.value.set(s.sunDirX, s.sunDirY, s.sunDirZ); // (glints on glass and paint: the light that is there)
    cityUniforms.uInteriorGlow.value = s.interiorGlow;
    cityUniforms.uRoadWetness.value = s.roadWetness;
    if (cityUniforms.uCanyonBounce) cityUniforms.uCanyonBounce.value = s.canyonBounce;

    const b = this.baked;
    const now = performance.now();
    const moved = now - b.at >= MIN_BAKE_MS && (
      s.skyDirX * b.x + s.skyDirY * b.y + s.skyDirZ * b.z < BAKE_SUN_COS
      || Math.abs(s.nightFactor - b.night) > 0.02
      || Math.abs(s.skyExposure - b.exposure) > 0.1 * b.exposure
      || Math.abs(sky.turbidity.value - b.turbidity) > 0.4
      || Math.abs(w - b.w) > 0.05);
    if (bake || moved) {
      this.bakeEnvironmentMap();
      b.at = now; b.x = s.skyDirX; b.y = s.skyDirY; b.z = s.skyDirZ;
      b.night = s.nightFactor; b.exposure = s.skyExposure; b.turbidity = sky.turbidity.value; b.w = w;
      this.bakes++;
    }
  }

  /** The direct light, the fill and the environment, by the day's values and how far the camera is into a bore */
  applyBore() {
    const k = this.bore;
    this.sunLight.intensity = this.direct * (1 - k);
    this.hemiLight.color.copy(this.hemiSky).lerp(BORE_SKY, k);
    this.hemiLight.groundColor.copy(this.hemiGround).lerp(BORE_GROUND, k);
    this.hemiLight.intensity = this.fill + (BORE_FILL - this.fill) * k;
    this.scene.environmentIntensity = this.env + (BORE_ENV - this.env) * k;
  }

  updateBore(p) {
    const now = performance.now(), dt = Math.min(0.1, (now - this.boreAt) / 1000);
    this.boreAt = now;
    const floor = tunnelFloor(p.x, p.z, p.y - 2);
    const inside = Number.isFinite(floor) && groundHeight(p.x, p.z) - floor > BORE_COVER ? 1 : 0;
    if (inside === this.bore) return;
    const step = BORE_RATE * dt;
    this.bore = Math.abs(inside - this.bore) <= step ? inside : this.bore + Math.sign(inside - this.bore) * step;
    this.applyBore();
  }

  update(focusPos) {
    if (focusPos) this.updateBore(focusPos);
    // SunLightShadow automatically fits & texel-snaps its 2 cascades to the view camera frustum
    // every frame inside SunShadowNode.renderShadow(), splitting [near, far] halfway between a uniform and a
    // logarithmic split (the near cascade ends at ~far / 4). Shadows only where they read: 200 m at street level (the
    // last 10 % fade out; past that the sun-facing / averted sides still shade the buildings), which keeps the near
    // cascade sharp (~0.35-55 m) and the far cascade's casters few. Expanded with altitude (helicopter / observatory)
    // so shadows reach all the way down to street level (altitude above Davos' terrain, not above the lake).
    const altitude = focusPos && Number.isFinite(focusPos.y) ? Math.max(0, focusPos.y - groundHeight(focusPos.x, focusPos.z)) : 0;
    const street = QUALITY.mobile ? 110 : 200;
    this.sunLight.shadow.camera.far = Math.max(street, Math.min(QUALITY.shadowFarMax, street - 40 + altitude * 1.6));
  }
}

export { LightingSystem };
