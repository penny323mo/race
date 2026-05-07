import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { InputState } from "../input/keyboard";
import type { Vector2 } from "../types";

export interface CarEntity {
  readonly group: THREE.Group;
  readonly position: Vector2;
  readonly heading: number;
  readonly speedMetersPerSecond: number;
  readonly isDrifting: boolean;
  reset(): void;
  constrainToTrack(position: Vector2, speedMultiplier: number): void;
  update(deltaSeconds: number, input: InputState): void;
}

export function createCar(world: RAPIER.World): CarEntity {
  return new RapierCar(world);
}

// Wheel index constants
const FL = 0; // front-left
const FR = 1; // front-right
const RL = 2; // rear-left
const RR = 3; // rear-right

class RapierCar implements CarEntity {
  public readonly group: THREE.Group;
  public position: Vector2 = { x: 0, z: 66 };
  public heading = Math.atan2(44, -8);
  public speedMetersPerSecond = 0;
  public isDrifting = false;

  private readonly visual: CarVisual;
  private readonly rigidBody: RAPIER.RigidBody;
  private readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  private readonly spawnPosition: Vector2 = { x: 0, z: 66 };
  private readonly spawnHeading = Math.atan2(44, -8);

  private wheelSpin = 0;
  private visualSteer = 0;
  private bodyLean = 0;
  private rearSideFriction = 1.8;
  private smokeParticles: SmokeParticle[] = [];

  public constructor(world: RAPIER.World) {
    this.visual = createCarMesh();
    this.group = this.visual.group;

    // Chassis rigid body
    const initH = this.spawnHeading;
    const sinH = Math.sin(initH * 0.5);
    const cosH = Math.cos(initH * 0.5);
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.spawnPosition.x, 1.5, this.spawnPosition.z)
      .setRotation({ x: 0, y: sinH, z: 0, w: cosH })
      .setLinearDamping(0.05)
      .setAngularDamping(1.2);
    this.rigidBody = world.createRigidBody(rbDesc);

    // Chassis collider
    const chassisDesc = RAPIER.ColliderDesc.cuboid(1.82, 0.38, 2.25)
      .setTranslation(0, 0.1, 0)
      .setFriction(0.4)
      .setRestitution(0.05)
      .setDensity(120);
    world.createCollider(chassisDesc, this.rigidBody);

    // Vehicle controller
    this.vehicle = world.createVehicleController(this.rigidBody);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;

    const suspDir = { x: 0, y: -1, z: 0 };
    const axle = { x: -1, y: 0, z: 0 };
    const suspRest = 0.55;
    const radius = 0.54;
    const wheelOffset = { FL: [-1.88, -0.28, 1.62], FR: [1.88, -0.28, 1.62], RL: [-1.88, -0.28, -1.78], RR: [1.88, -0.28, -1.78] };

    for (const [wx, wy, wz] of Object.values(wheelOffset)) {
      this.vehicle.addWheel({ x: wx, y: wy, z: wz }, suspDir, axle, suspRest, radius);
    }

    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, 22);
      this.vehicle.setWheelSuspensionCompression(i, 2.4);
      this.vehicle.setWheelSuspensionRelaxation(i, 2.4);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.4);
      this.vehicle.setWheelMaxSuspensionForce(i, 14000);
      this.vehicle.setWheelFrictionSlip(i, 2.2);
      this.vehicle.setWheelSideFrictionStiffness(i, 1.8);
    }

    this.syncFromRigidBody();
  }

  public reset(): void {
    const h = this.spawnHeading;
    this.rigidBody.setTranslation({ x: this.spawnPosition.x, y: 1.5, z: this.spawnPosition.z }, true);
    this.rigidBody.setRotation({ x: 0, y: Math.sin(h * 0.5), z: 0, w: Math.cos(h * 0.5) }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.rearSideFriction = 1.8;
    this.vehicle.setWheelSideFrictionStiffness(RL, 1.8);
    this.vehicle.setWheelSideFrictionStiffness(RR, 1.8);
    this.syncFromRigidBody();
  }

  // No-op: Rapier wall colliders handle boundaries
  public constrainToTrack(_position: Vector2, _speedMultiplier: number): void {}

  public update(deltaSeconds: number, input: InputState): void {
    const dt = Math.min(deltaSeconds, 1 / 30);

    // 1. Read current state from rigid body (post-last-step position)
    this.syncFromRigidBody();

    // 2. Compute input forces
    const speed = this.vehicle.currentVehicleSpeed();
    const steerInput = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 46, 0, 1);
    const maxSteer = THREE.MathUtils.lerp(0.52, 0.28, speedRatio);
    const steerAngle = steerInput * maxSteer;

    const engineForce = input.accelerate ? 1800 : 0;
    const brakeForce = input.brake ? (speed > 1 ? 2400 : 600) : 0;

    // 3. Apply to front wheels (steer) and rear wheels (drive)
    this.vehicle.setWheelSteering(FL, steerAngle);
    this.vehicle.setWheelSteering(FR, steerAngle);
    this.vehicle.setWheelEngineForce(RL, engineForce);
    this.vehicle.setWheelEngineForce(RR, engineForce);
    this.vehicle.setWheelBrake(FL, brakeForce * 0.4);
    this.vehicle.setWheelBrake(FR, brakeForce * 0.4);
    this.vehicle.setWheelBrake(RL, brakeForce * 0.6);
    this.vehicle.setWheelBrake(RR, brakeForce * 0.6);

    // 4. Drift: adjust rear side friction
    if (input.handbrake && Math.abs(speed) > 2) {
      this.rearSideFriction = THREE.MathUtils.lerp(this.rearSideFriction, 0.22, 1 - Math.exp(-dt * 18));
      this.isDrifting = true;
      // Handbrake: lock rear wheels
      this.vehicle.setWheelBrake(RL, 3200);
      this.vehicle.setWheelBrake(RR, 3200);
    } else {
      this.rearSideFriction = THREE.MathUtils.lerp(this.rearSideFriction, 1.8, 1 - Math.exp(-dt * 4));
      this.isDrifting = this.rearSideFriction < 0.9 && Math.abs(speed) > 3;
    }
    this.vehicle.setWheelSideFrictionStiffness(RL, this.rearSideFriction);
    this.vehicle.setWheelSideFrictionStiffness(RR, this.rearSideFriction);

    // 5. Tell vehicle to update (prepares velocities; world.step() integrates them)
    this.vehicle.updateVehicle(dt);

    // 6. Visual updates
    this.speedMetersPerSecond = speed;
    this.updateVisuals(dt, steerInput, input.brake, speedRatio);
    this.updateSmoke(dt);
  }

  private syncFromRigidBody(): void {
    const t = this.rigidBody.translation();
    const r = this.rigidBody.rotation();
    this.position = { x: t.x, z: t.z };
    this.heading = Math.atan2(
      2 * (r.w * r.y + r.x * r.z),
      1 - 2 * (r.y * r.y + r.z * r.z)
    );
    this.group.position.set(t.x, t.y - 0.72, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);
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

    const driftRatio = THREE.MathUtils.clamp(1 - (this.rearSideFriction - 0.22) / (1.8 - 0.22), 0, 1);
    const streakScale = THREE.MathUtils.lerp(0.35, 1.85, speedRatio) * (1 + driftRatio * 1.2);
    this.visual.speedStreaks.scale.z = streakScale;
    this.visual.speedStreaks.position.z = THREE.MathUtils.lerp(-3.15, -5.2, speedRatio);
    this.visual.speedStreaks.visible = speedRatio > 0.12 || this.isDrifting;

    // Drift: streaks turn orange
    const streakColor = this.isDrifting ? new THREE.Color(1.0, 0.45, 0.1) : new THREE.Color(0x3df4d6);
    (this.visual.speedStreaks.children as THREE.Mesh[]).forEach(m => {
      (m.material as THREE.MeshBasicMaterial).color.copy(streakColor);
    });

    for (const light of this.visual.brakeLights) {
      light.material.emissiveIntensity = isBraking ? 2.2 : 0.75;
    }
  }

  private updateSmoke(dt: number): void {
    if (this.isDrifting) {
      if (this.smokeParticles.length < 12 && Math.random() < 0.6) {
        const side = Math.random() > 0.5 ? -1 : 1;
        const wheelWorldX = this.group.position.x + Math.sin(this.heading) * (-1.78) + Math.cos(this.heading) * (side * 1.88);
        const wheelWorldZ = this.group.position.z + Math.cos(this.heading) * (-1.78) - Math.sin(this.heading) * (side * 1.88);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.5, 0.8),
          new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.55, depthWrite: false })
        );
        mesh.position.set(wheelWorldX, 0.4, wheelWorldZ);
        this.group.parent?.add(mesh);
        this.smokeParticles.push({ mesh, life: 0, maxLife: 0.5 + Math.random() * 0.4 });
      }
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      p.mesh.position.y += dt * 1.2;
      p.mesh.scale.setScalar(1 + t * 2.5);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      if (p.life >= p.maxLife) {
        p.mesh.parent?.remove(p.mesh);
        this.smokeParticles.splice(i, 1);
      }
    }
  }
}

interface SmokeParticle {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
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

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xff3158, roughness: 0.34, metalness: 0.18, emissive: 0x2a0610, emissiveIntensity: 0.15 });
  const darkBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x161d25, roughness: 0.42, metalness: 0.12 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x59e7ff, roughness: 0.18, metalness: 0.02, emissive: 0x0c6680, emissiveIntensity: 0.3 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090b0d, roughness: 0.72, metalness: 0.08 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdce9f4, roughness: 0.24, metalness: 0.45, emissive: 0x172b33, emissiveIntensity: 0.18 });
  const neonMaterial = new THREE.MeshStandardMaterial({ color: 0x3df4d6, roughness: 0.24, emissive: 0x18bfa9, emissiveIntensity: 1.35 });
  const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2b8, roughness: 0.18, emissive: 0xffd35a, emissiveIntensity: 1.4 });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({ color: 0xff174c, roughness: 0.2, emissive: 0xff174c, emissiveIntensity: 0.75 });
  const speedStreakMaterial = new THREE.MeshBasicMaterial({ color: 0x3df4d6, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });

  const body = new THREE.Mesh(createSportsBodyGeometry(), bodyMaterial);
  body.position.y = 0.54; body.castShadow = true; bodyRoot.add(body);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.18, 0.48), darkBodyMaterial);
  splitter.position.set(0, 0.38, 2.9); bodyRoot.add(splitter);
  const cabin = new THREE.Mesh(createCabinGeometry(), glassMaterial);
  cabin.position.set(0, 1.12, -0.45); cabin.castShadow = true; bodyRoot.add(cabin);
  const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.26, 0.82), darkBodyMaterial);
  roofScoop.position.set(0, 1.95, -0.68); bodyRoot.add(roofScoop);

  const rearWing = new THREE.Group();
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.18, 0.62), darkBodyMaterial);
  wingBlade.position.set(0, 1.75, -2.72); rearWing.add(wingBlade);
  for (const x of [-1.52, 1.52]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), darkBodyMaterial);
    support.position.set(x, 1.28, -2.55); rearWing.add(support);
  }
  bodyRoot.add(rearWing);

  const underglow = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 4.1), neonMaterial);
  underglow.position.set(0, 0.18, -0.12); bodyRoot.add(underglow);

  for (const x of [-1.1, 1.1]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.1), headlightMaterial);
    headlight.position.set(x, 0.86, 2.88); bodyRoot.add(headlight);
  }

  const brakeLights: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  for (const x of [-1.1, 1.1]) {
    const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.18, 0.12), brakeLightMaterial.clone());
    brakeLight.position.set(x, 0.86, -2.9);
    brakeLights.push(brakeLight); bodyRoot.add(brakeLight);
  }

  const wheelGeometry = new THREE.CylinderGeometry(0.54, 0.54, 0.54, 28);
  const rimGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.58, 20);
  const wheelPositions: readonly [number, number, number][] = [
    [-1.88, 0.42, 1.62], [1.88, 0.42, 1.62],
    [-1.88, 0.42, -1.78], [1.88, 0.42, -1.78]
  ];
  const allWheels: THREE.Group[] = [];
  const frontWheels: THREE.Group[] = [];

  for (const [index, [x, y, z]] of wheelPositions.entries()) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2; wheel.castShadow = true; wheelGroup.add(wheel);
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2; wheelGroup.add(rim);
    group.add(wheelGroup);
    allWheels.push(wheelGroup);
    if (index < 2) frontWheels.push(wheelGroup);
  }

  const speedStreaks = new THREE.Group();
  for (const x of [-0.85, 0.85]) {
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 4.8), speedStreakMaterial.clone());
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
