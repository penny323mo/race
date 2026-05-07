import * as THREE from "three";

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, 0);
  return { camera };
}
