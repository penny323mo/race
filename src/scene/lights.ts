import * as THREE from "three";

export function createLights(scene: THREE.Scene): void {
  const ambient = new THREE.HemisphereLight(0xffffff, 0x405060, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 45, 20);
  scene.add(ambient, sun);
}
