import * as THREE from "three";

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  update(target: THREE.Vector3, heading: number, speedMetersPerSecond: number, isDrifting: boolean, deltaSeconds: number, isAirborne?: boolean): void;
  addShake(intensity: number): void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 9.5, 18);
  camera.lookAt(0, 0, 0);
  let previousHeading = 0;
  let roll = 0;
  let shakeIntensity = 0;
  let driftLateralCurrent = 0;

  return {
    camera,
    resize(width: number, height: number): void {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    addShake(intensity: number): void {
      shakeIntensity = Math.max(shakeIntensity, intensity);
    },
    update(target: THREE.Vector3, heading: number, speedMetersPerSecond: number, isDrifting: boolean, deltaSeconds: number, isAirborne = false): void {
      const dt = Math.min(deltaSeconds, 1 / 30);
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const speedRatio = THREE.MathUtils.clamp(Math.abs(speedMetersPerSecond) / 45, 0, 1);
      const airborneHeight = isAirborne ? Math.max(0, target.y - 1.0) : 0;

      // Heading delta / angular velocity (uses previousHeading from prior frame)
      const headingDelta = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
      const angularVelocity = headingDelta / Math.max(dt, 0.001);

      // Drift lateral offset: slide camera toward outside of turn so the slide is visible
      const driftLateralTarget = isDrifting
        ? THREE.MathUtils.clamp(angularVelocity * -0.46 * speedRatio, -4.2, 4.2)
        : 0;
      driftLateralCurrent = THREE.MathUtils.lerp(driftLateralCurrent, driftLateralTarget, 1 - Math.exp(-dt * (isDrifting ? 5.2 : 6.0)));

      const followDistance = THREE.MathUtils.lerp(11.5, 23, speedRatio) + airborneHeight * 1.4;
      const followHeight = THREE.MathUtils.lerp(6.6, 4.2, speedRatio) + airborneHeight * 1.8;
      const desiredPosition = new THREE.Vector3()
        .copy(target)
        .addScaledVector(forward, -followDistance)
        .add(new THREE.Vector3(0, followHeight, 0));

      // Lateral drift offset (right = cos(h), 0, -sin(h))
      desiredPosition.x += Math.cos(heading) * driftLateralCurrent;
      desiredPosition.z += -Math.sin(heading) * driftLateralCurrent;

      // Look further ahead at speed so road fills more of the frame
      const lookAheadDist = THREE.MathUtils.lerp(10, 30, speedRatio);
      const lookTarget = new THREE.Vector3()
        .copy(target)
        .addScaledVector(forward, lookAheadDist)
        .add(new THREE.Vector3(0, THREE.MathUtils.lerp(1.2, 0.4, speedRatio), 0));

      const positionSmoothing = 1 - Math.exp(-dt * THREE.MathUtils.lerp(8.6, 3.80, speedRatio));
      const driftFovBoost = isDrifting ? THREE.MathUtils.lerp(0, 10, speedRatio) : 0;
      const airborneFovBoost = isAirborne ? Math.min(12, airborneHeight * 2.2) : 0;
      const targetFov = THREE.MathUtils.lerp(62, 100, speedRatio) + driftFovBoost + airborneFovBoost;

      const rollMult = isDrifting ? 2.6 : 1.0;
      const rollLimit = isDrifting ? 0.40 : 0.095;
      const targetRoll = THREE.MathUtils.clamp(-angularVelocity * 0.035 * speedRatio * rollMult, -rollLimit, rollLimit);

      // Continuous drift rumble: gentle random shake proportional to drift speed
      if (isDrifting) {
        shakeIntensity = Math.max(shakeIntensity, speedRatio * 0.17);
      }
      // High-speed road vibration: subtle continuous shake above 40 m/s (144 km/h)
      const absSpeed = Math.abs(speedMetersPerSecond);
      if (absSpeed > 36) {
        shakeIntensity = Math.max(shakeIntensity, ((absSpeed - 36) / 10) * 0.028);
      }

      // Apply and decay shake before lookAt so camera rocks but still aims at car
      if (shakeIntensity > 0.001) {
        desiredPosition.x += (Math.random() - 0.5) * shakeIntensity * 1.1;
        desiredPosition.y += (Math.random() - 0.5) * shakeIntensity * 0.5;
        desiredPosition.z += (Math.random() - 0.5) * shakeIntensity * 0.5;
        shakeIntensity *= Math.exp(-dt * 6);
      }

      camera.position.lerp(desiredPosition, positionSmoothing);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 5.5));
      camera.updateProjectionMatrix();
      camera.lookAt(lookTarget);
      roll = THREE.MathUtils.lerp(roll, targetRoll, 1 - Math.exp(-dt * 7.5));
      camera.rotation.z += roll;
      previousHeading = heading;
    }
  };
}
