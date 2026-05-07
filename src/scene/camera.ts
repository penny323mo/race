import * as THREE from "three";

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  update(target: THREE.Vector3, heading: number, deltaSeconds: number): void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, 0);

  return {
    camera,
    resize(width: number, height: number): void {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    update(target: THREE.Vector3, heading: number, deltaSeconds: number): void {
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const desiredPosition = new THREE.Vector3()
        .copy(target)
        .addScaledVector(forward, -16)
        .add(new THREE.Vector3(0, 8.4, 0));
      const lookTarget = new THREE.Vector3().copy(target).addScaledVector(forward, 8).add(new THREE.Vector3(0, 1.1, 0));
      const smoothing = 1 - Math.exp(-Math.min(deltaSeconds, 1 / 30) * 6.4);

      camera.position.lerp(desiredPosition, smoothing);
      camera.lookAt(lookTarget);
    }
  };
}
