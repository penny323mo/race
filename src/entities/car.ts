import * as THREE from "three";
import type { InputState } from "../input/keyboard";
import type { Vector2 } from "../types";

export interface CarEntity {
  readonly group: THREE.Group;
  readonly position: Vector2;
  readonly heading: number;
  readonly speedMetersPerSecond: number;
  reset(): void;
  constrainToTrack(position: Vector2, speedMultiplier: number): void;
  update(deltaSeconds: number, input: InputState): void;
}

export function createCar(): CarEntity {
  return new PrimitiveCar();
}

class PrimitiveCar implements CarEntity {
  public readonly group: THREE.Group;
  public position: Vector2 = { x: 0, z: 66 };
  public heading = Math.atan2(46, -12);
  public speedMetersPerSecond = 0;

  private readonly spawnPosition: Vector2 = { x: 0, z: 66 };
  private readonly spawnHeading = Math.atan2(46, -12);

  public constructor() {
    this.group = createCarMesh();
    this.applyTransform();
  }

  public reset(): void {
    this.position = { ...this.spawnPosition };
    this.heading = this.spawnHeading;
    this.speedMetersPerSecond = 0;
    this.applyTransform();
  }

  public constrainToTrack(position: Vector2, speedMultiplier: number): void {
    this.position = position;
    this.speedMetersPerSecond *= THREE.MathUtils.clamp(speedMultiplier, 0, 1);
    this.applyTransform();
  }

  public update(deltaSeconds: number, input: InputState): void {
    const dt = Math.min(deltaSeconds, 1 / 30);
    const acceleration = 32;
    const brakeForce = 44;
    const reverseAcceleration = 20;
    const rollingFriction = 6.4;
    const maxForwardSpeed = 40;
    const maxReverseSpeed = -12;

    if (input.accelerate) {
      this.speedMetersPerSecond += acceleration * dt;
    }

    if (input.brake) {
      if (this.speedMetersPerSecond > 1) {
        this.speedMetersPerSecond -= brakeForce * dt;
      } else {
        this.speedMetersPerSecond -= reverseAcceleration * dt;
      }
    }

    if (!input.accelerate && !input.brake) {
      this.speedMetersPerSecond = moveToward(this.speedMetersPerSecond, 0, rollingFriction * dt);
    }

    this.speedMetersPerSecond = THREE.MathUtils.clamp(
      this.speedMetersPerSecond,
      maxReverseSpeed,
      maxForwardSpeed
    );

    const steerInput = (input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0);
    const normalizedSpeed = THREE.MathUtils.clamp(Math.abs(this.speedMetersPerSecond) / maxForwardSpeed, 0, 1);
    const steeringAuthority = THREE.MathUtils.lerp(0.65, 1.72, normalizedSpeed);
    const reverseFactor = this.speedMetersPerSecond >= 0 ? 1 : -1;
    this.heading += steerInput * steeringAuthority * reverseFactor * dt;

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);

    this.position = {
      x: this.position.x + forwardX * this.speedMetersPerSecond * dt,
      z: this.position.z + forwardZ * this.speedMetersPerSecond * dt
    };

    this.applyTransform();
  }

  private applyTransform(): void {
    this.group.position.set(this.position.x, 0.72, this.position.z);
    this.group.rotation.y = this.heading;
  }
}

function createCarMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = "PlayerCar";

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd94336, roughness: 0.48, metalness: 0.08 });
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2b34, roughness: 0.38, metalness: 0.04 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.8 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d34a, roughness: 0.55 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.05, 5.2), bodyMaterial);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 1.1), accentMaterial);
  nose.position.set(0, 1.15, 2.1);
  nose.castShadow = true;
  group.add(nose);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 2.1), cabinMaterial);
  cabin.position.set(0, 1.34, -0.45);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.48, 20);
  const wheelPositions: readonly [number, number, number][] = [
    [-1.85, 0.36, 1.65],
    [1.85, 0.36, 1.65],
    [-1.85, 0.36, -1.65],
    [1.85, 0.36, -1.65]
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    group.add(wheel);
  }

  return group;
}

function moveToward(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) {
    return target;
  }

  return value + Math.sign(target - value) * maxDelta;
}
