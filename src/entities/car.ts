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

  private readonly visual: CarVisual;
  private readonly spawnPosition: Vector2 = { x: 0, z: 66 };
  private readonly spawnHeading = Math.atan2(46, -12);
  private wheelSpin = 0;
  private visualSteer = 0;
  private bodyLean = 0;

  public constructor() {
    this.visual = createCarMesh();
    this.group = this.visual.group;
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
    const acceleration = 38;
    const brakeForce = 52;
    const reverseAcceleration = 23;
    const rollingFriction = 7.4;
    const maxForwardSpeed = 46;
    const maxReverseSpeed = -14;

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

    const steerInput = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const normalizedSpeed = THREE.MathUtils.clamp(Math.abs(this.speedMetersPerSecond) / maxForwardSpeed, 0, 1);
    const steeringAuthority = THREE.MathUtils.lerp(0.72, 1.95, normalizedSpeed);
    const reverseFactor = this.speedMetersPerSecond >= 0 ? 1 : -1;
    this.heading += steerInput * steeringAuthority * reverseFactor * dt;

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);

    this.position = {
      x: this.position.x + forwardX * this.speedMetersPerSecond * dt,
      z: this.position.z + forwardZ * this.speedMetersPerSecond * dt
    };

    this.applyTransform();
    this.updateVisuals(dt, steerInput, input.brake, normalizedSpeed);
  }

  private applyTransform(): void {
    this.group.position.set(this.position.x, 0.72, this.position.z);
    this.group.rotation.y = this.heading;
  }

  private updateVisuals(dt: number, steerInput: number, isBraking: boolean, speedRatio: number): void {
    this.wheelSpin -= this.speedMetersPerSecond * dt * 2.4;
    this.visualSteer = THREE.MathUtils.lerp(this.visualSteer, steerInput * 0.42, 1 - Math.exp(-dt * 12));
    this.bodyLean = THREE.MathUtils.lerp(this.bodyLean, -steerInput * speedRatio * 0.08, 1 - Math.exp(-dt * 7));

    for (const wheel of this.visual.allWheels) {
      wheel.rotation.x = this.wheelSpin;
    }

    for (const wheel of this.visual.frontWheels) {
      wheel.rotation.y = this.visualSteer;
    }

    this.visual.bodyRoot.rotation.z = this.bodyLean;
    this.visual.speedStreaks.scale.z = THREE.MathUtils.lerp(0.35, 1.85, speedRatio);
    this.visual.speedStreaks.position.z = THREE.MathUtils.lerp(-3.15, -5.2, speedRatio);
    this.visual.speedStreaks.visible = speedRatio > 0.18;

    for (const light of this.visual.brakeLights) {
      light.material.emissiveIntensity = isBraking ? 2.2 : 0.75;
    }
  }
}

interface CarVisual {
  readonly group: THREE.Group;
  readonly bodyRoot: THREE.Group;
  readonly allWheels: readonly THREE.Group[];
  readonly frontWheels: readonly THREE.Group[];
  readonly brakeLights: readonly THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[];
  readonly speedStreaks: THREE.Group;
}

function createCarMesh(): CarVisual {
  const group = new THREE.Group();
  group.name = "PlayerCar";
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3158,
    roughness: 0.34,
    metalness: 0.18,
    emissive: 0x2a0610,
    emissiveIntensity: 0.15
  });
  const darkBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x161d25, roughness: 0.42, metalness: 0.12 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x59e7ff,
    roughness: 0.18,
    metalness: 0.02,
    emissive: 0x0c6680,
    emissiveIntensity: 0.3
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090b0d, roughness: 0.72, metalness: 0.08 });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xdce9f4,
    roughness: 0.24,
    metalness: 0.45,
    emissive: 0x172b33,
    emissiveIntensity: 0.18
  });
  const neonMaterial = new THREE.MeshStandardMaterial({
    color: 0x3df4d6,
    roughness: 0.24,
    emissive: 0x18bfa9,
    emissiveIntensity: 1.35
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff2b8,
    roughness: 0.18,
    emissive: 0xffd35a,
    emissiveIntensity: 1.4
  });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff174c,
    roughness: 0.2,
    emissive: 0xff174c,
    emissiveIntensity: 0.75
  });
  const speedStreakMaterial = new THREE.MeshBasicMaterial({
    color: 0x3df4d6,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const body = new THREE.Mesh(createSportsBodyGeometry(), bodyMaterial);
  body.position.y = 0.54;
  body.castShadow = true;
  bodyRoot.add(body);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.18, 0.48), darkBodyMaterial);
  splitter.position.set(0, 0.38, 2.9);
  splitter.castShadow = true;
  bodyRoot.add(splitter);

  const cabin = new THREE.Mesh(createCabinGeometry(), glassMaterial);
  cabin.position.set(0, 1.12, -0.45);
  cabin.castShadow = true;
  bodyRoot.add(cabin);

  const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.26, 0.82), darkBodyMaterial);
  roofScoop.position.set(0, 1.95, -0.68);
  roofScoop.castShadow = true;
  bodyRoot.add(roofScoop);

  const rearWing = new THREE.Group();
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.18, 0.62), darkBodyMaterial);
  wingBlade.position.set(0, 1.75, -2.72);
  wingBlade.castShadow = true;
  rearWing.add(wingBlade);
  for (const x of [-1.52, 1.52]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), darkBodyMaterial);
    support.position.set(x, 1.28, -2.55);
    support.castShadow = true;
    rearWing.add(support);
  }
  bodyRoot.add(rearWing);

  const underglow = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 4.1), neonMaterial);
  underglow.position.set(0, 0.18, -0.12);
  bodyRoot.add(underglow);

  const headlightGeometry = new THREE.BoxGeometry(0.78, 0.18, 0.1);
  for (const x of [-1.1, 1.1]) {
    const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    headlight.position.set(x, 0.86, 2.88);
    bodyRoot.add(headlight);
  }

  const brakeLights: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  const brakeGeometry = new THREE.BoxGeometry(0.68, 0.18, 0.12);
  for (const x of [-1.1, 1.1]) {
    const brakeLight = new THREE.Mesh(brakeGeometry, brakeLightMaterial.clone());
    brakeLight.position.set(x, 0.86, -2.9);
    brakeLights.push(brakeLight);
    bodyRoot.add(brakeLight);
  }

  const wheelGeometry = new THREE.CylinderGeometry(0.54, 0.54, 0.54, 28);
  const rimGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.58, 20);
  const wheelPositions: readonly [number, number, number][] = [
    [-1.88, 0.42, 1.62],
    [1.88, 0.42, 1.62],
    [-1.88, 0.42, -1.78],
    [1.88, 0.42, -1.78]
  ];
  const allWheels: THREE.Group[] = [];
  const frontWheels: THREE.Group[] = [];

  for (const [index, [x, y, z]] of wheelPositions.entries()) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    wheelGroup.add(wheel);

    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);
    group.add(wheelGroup);
    allWheels.push(wheelGroup);
    if (index < 2) {
      frontWheels.push(wheelGroup);
    }
  }

  const speedStreaks = new THREE.Group();
  for (const x of [-0.85, 0.85]) {
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 4.8), speedStreakMaterial);
    streak.position.set(x, 0.34, 0);
    speedStreaks.add(streak);
  }
  speedStreaks.position.set(0, 0.22, -3.4);
  speedStreaks.visible = false;
  group.add(speedStreaks);

  return { group, bodyRoot, allWheels, frontWheels, brakeLights, speedStreaks };
}

function createSportsBodyGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    -1.65, 0.0, 2.65, 1.65, 0.0, 2.65, 1.95, 0.0, 0.25, -1.95, 0.0, 0.25,
    -1.62, 0.0, -2.7, 1.62, 0.0, -2.7, 1.28, 0.78, 2.2, -1.28, 0.78, 2.2,
    -1.58, 1.0, 0.15, 1.58, 1.0, 0.15, 1.18, 0.74, -2.45, -1.18, 0.74, -2.45
  ]);
  const indices = [
    0, 1, 6, 1, 7, 6, 1, 2, 7, 2, 9, 7, 2, 5, 9, 5, 10, 9, 5, 4, 10, 4, 11, 10,
    4, 3, 11, 3, 8, 11, 3, 0, 8, 0, 6, 8, 6, 7, 8, 7, 9, 8, 8, 9, 11, 9, 10, 11,
    0, 3, 2, 0, 2, 1, 3, 4, 5, 3, 5, 2
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCabinGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    -0.92, 0, 0.9, 0.92, 0, 0.9, 1.18, 0, -0.95, -1.18, 0, -0.95,
    -0.62, 0.74, 0.55, 0.62, 0.74, 0.55, 0.84, 0.62, -0.68, -0.84, 0.62, -0.68
  ]);
  const indices = [
    0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 3, 0, 7, 0, 4, 7,
    4, 5, 7, 5, 6, 7
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function moveToward(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) {
    return target;
  }

  return value + Math.sign(target - value) * maxDelta;
}
