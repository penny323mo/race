import * as THREE from "three";

export function createLights(scene: THREE.Scene): void {
  // Deep night sky: very dark blue-purple ambient, no fake daylight
  const ambient = new THREE.HemisphereLight(0x0e1b3a, 0x06080d, 0.40);

  // Moon-like cool directional: low intensity, subtle blue-silver
  const moon = new THREE.DirectionalLight(0x8ab4d4, 2.0);
  moon.position.set(-42, 64, 34);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -90;
  moon.shadow.camera.right = 90;
  moon.shadow.camera.top = 90;
  moon.shadow.camera.bottom = -90;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 160;

  // Cyan rim from opposite side for neon depth
  const rim = new THREE.DirectionalLight(0x3df4d6, 1.10);
  rim.position.set(52, 22, -68);

  // Start/finish line glow — bright magenta beacon
  const startLineGlow = new THREE.PointLight(0xff3266, 170, 55, 1.8);
  startLineGlow.position.set(0, 9, 66);

  // Mid-track cyan fill light
  const checkpointGlow = new THREE.PointLight(0x3df4d6, 122, 52, 1.9);
  checkpointGlow.position.set(46, 8, 54);

  // Far corner accent to keep track readable in darkness
  const cornerFill = new THREE.PointLight(0xff8c2a, 75, 55, 2.1);
  cornerFill.position.set(-60, 6, -52);

  // Far back-sector fill: warm amber to light the north straight
  const backSectorFill = new THREE.PointLight(0xff9944, 52, 44, 2.0);
  backSectorFill.position.set(-28, 7, -38);

  scene.add(ambient, moon, rim, startLineGlow, checkpointGlow, cornerFill, backSectorFill);
}
