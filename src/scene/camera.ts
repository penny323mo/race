import * as THREE from "three";

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  update(target: THREE.Vector3, heading: number, speedMetersPerSecond: number, deltaSeconds: number): void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 9.5, 18);
  camera.lookAt(0, 0, 0);
  let previousHeading = 0;
  let roll = 0;

  return {
    camera,
    resize(width: number, height: number): void {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    update(target: THREE.Vector3, heading: number, speedMetersPerSecond: number, deltaSeconds: number): void {
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const speedRatio = THREE.MathUtils.clamp(Math.abs(speedMetersPerSecond) / 40, 0, 1);
      const followDistance = THREE.MathUtils.lerp(13.2, 22.5, speedRatio);
      const followHeight = THREE.MathUtils.lerp(7.5, 5.75, speedRatio);
      const desiredPosition = new THREE.Vector3()
        .copy(target)
        .addScaledVector(forward, -followDistance)
        .add(new THREE.Vector3(0, followHeight, 0));
      const lookTarget = new THREE.Vector3()
        .copy(target)
        .addScaledVector(forward, THREE.MathUtils.lerp(8.5, 17, speedRatio))
        .add(new THREE.Vector3(0, 1.05, 0));
      const dt = Math.min(deltaSeconds, 1 / 30);
      const positionSmoothing = 1 - Math.exp(-dt * THREE.MathUtils.lerp(8.4, 4.15, speedRatio));
      const targetFov = THREE.MathUtils.lerp(64, 86, speedRatio);
      const headingDelta = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
      const angularVelocity = headingDelta / Math.max(dt, 0.001);
      const targetRoll = THREE.MathUtils.clamp(-angularVelocity * 0.035 * speedRatio, -0.095, 0.095);

      camera.position.lerp(desiredPosition, positionSmoothing);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 5.5));
      camera.updateProjectionMatrix();
      camera.lookAt(lookTarget);
      roll = THREE.MathUtils.lerp(roll, targetRoll, 1 - Math.exp(-dt * 7.2));
      camera.rotation.z += roll;
      previousHeading = heading;
    }
  };
}
