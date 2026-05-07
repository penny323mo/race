import * as THREE from "three";

export function createLights(scene: THREE.Scene): void {
  const ambient = new THREE.HemisphereLight(0xf7fbff, 0x405060, 1.4);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(34, 58, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 160;
  scene.add(ambient, sun);
}
