import * as THREE from "three";

export function createLights(scene: THREE.Scene): void {
  const ambient = new THREE.HemisphereLight(0xcadfff, 0x1e2f32, 1.05);
  const sun = new THREE.DirectionalLight(0xfff0c9, 4.2);
  sun.position.set(-42, 64, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 160;

  const rim = new THREE.DirectionalLight(0x66d9ff, 1.3);
  rim.position.set(52, 22, -68);

  const startLineGlow = new THREE.PointLight(0xff3266, 140, 62, 1.9);
  startLineGlow.position.set(0, 9, 66);

  scene.add(ambient, sun, rim, startLineGlow);
}
