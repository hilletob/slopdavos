// js/person-models.js
// Converted figures for the people's crowds: Microsoft Rocketbox avatars (MIT, https://github.com/microsoft/Microsoft-Rocketbox)
// re-skinned to the 15 bones of js/pedestrians.js and moved into its bind pose by tools/build-rocketbox.mjs
// (assets/models/rocketbox-<name>.glb: position, normal, uv, _SKIN and one colour atlas). A crowd made with
// dress: { model } (PersonCrowd) draws one, posed by the same PersonRig as everyone else.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const cache = new Map();

/**
 * The model `name` (e.g. 'police-m01'): a promise of { geometry, map, scale, female, alphaTest } — scale & female for
 * the PersonRig that poses it (PersonRig.setBuild), alphaTest > 0 for hair strands & lashes cut from the map's alpha
 */
export function loadPersonModel(name) {
  if (!cache.has(name)) {
    const url = new URL(`../assets/models/rocketbox-${name}.glb`, import.meta.url);
    cache.set(name, new GLTFLoader().loadAsync(url.href).then((gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) throw new Error(`[person-models] no mesh in ${url.pathname}`);
      const geometry = mesh.geometry;
      // (GLTFLoader keeps a custom attribute's name lower-cased: _SKIN -> _skin)
      geometry.setAttribute('skin', geometry.getAttribute('_skin'));
      geometry.deleteAttribute('_skin');
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.2);
      const map = mesh.material.map;
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      const alphaTest = mesh.material.alphaTest || 0;
      mesh.material.dispose();
      const extras = gltf.asset?.extras || {};
      return { name, geometry, map, alphaTest, scale: extras.scale || 1, female: !!extras.female };
    }));
  }
  return cache.get(name);
}
