# M1: Rapier Dynamic Vehicle Physics + Drift System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the kinematic car controller with a Rapier `DynamicRayCastVehicleController` that supports real suspension physics and a Space-bar handbrake drift mechanic.

**Architecture:** `RapierCar` implements the existing `CarEntity` interface unchanged — `game.ts` needs only two line changes (pass `physics.world` to `createCar`, remove boundary resolution block). Drift is implemented by reducing `setWheelSideFrictionStiffness` on rear wheels while Space is held; `game.ts` detects drift onset and calls `hud.flash("DRIFT!")`.

**Tech Stack:** `@dimforge/rapier3d-compat ^0.15`, Three.js, TypeScript

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/input/keyboard.ts` |
| Modify | `src/physics/world.ts` |
| Modify | `src/entities/car.ts` |
| Modify | `src/game.ts` |
| Modify | `src/hud/overlay.ts` |
| Modify | `src/style.css` |

---

## Task 1: Add handbrake key to keyboard input

**Files:** Modify `src/input/keyboard.ts`

- [ ] **Add `handbrake` to `InputState` and wire Space key**

Replace the full file content:

```typescript
export interface InputState {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  reset: boolean;
  handbrake: boolean;
}

export class KeyboardInput {
  public readonly state: InputState = {
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    reset: false,
    handbrake: false
  };

  private resetRequested = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const handled = this.setKey(event.code, true);
    if (handled) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const handled = this.setKey(event.code, false);
    if (handled) {
      event.preventDefault();
    }
  };

  public constructor(target: Window = window) {
    target.addEventListener("keydown", this.handleKeyDown);
    target.addEventListener("keyup", this.handleKeyUp);
  }

  public consumeReset(): boolean {
    if (!this.resetRequested) {
      return false;
    }
    this.resetRequested = false;
    return true;
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  private setKey(code: string, isPressed: boolean): boolean {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        this.state.accelerate = isPressed;
        return true;
      case "KeyS":
      case "ArrowDown":
        this.state.brake = isPressed;
        return true;
      case "KeyA":
      case "ArrowLeft":
        this.state.steerLeft = isPressed;
        return true;
      case "KeyD":
      case "ArrowRight":
        this.state.steerRight = isPressed;
        return true;
      case "KeyR":
        this.state.reset = isPressed;
        if (isPressed) {
          this.resetRequested = true;
        }
        return true;
      case "Space":
        this.state.handbrake = isPressed;
        return true;
      default:
        return false;
    }
  }
}
```

- [ ] **Verify TypeScript compiles**

```bash
cd /Users/a123/race && npx tsc --noEmit
```
Expected: no errors (other files don't reference `handbrake` yet so no break).

---

## Task 2: Add ground plane collider to physics world

**Files:** Modify `src/physics/world.ts`

The Rapier vehicle controller's wheel raycasts need a physical surface to detect. Add a large static cuboid at Y=0 acting as the ground.

- [ ] **Add `createGroundCollider` and call it in `createPhysicsWorld`**

```typescript
import RAPIER from "@dimforge/rapier3d-compat";
import type { TrackSegment } from "../types";

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  step(deltaSeconds: number): void;
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await initRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  createGroundCollider(world);

  return {
    world,
    step(deltaSeconds: number): void {
      world.timestep = Math.min(deltaSeconds, 1 / 30);
      world.step();
    }
  };
}

function createGroundCollider(world: RAPIER.World): void {
  const desc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
    .setTranslation(0, -0.1, 0)
    .setFriction(0.8)
    .setRestitution(0.0);
  world.createCollider(desc);
}

async function initRapier(): Promise<void> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]): void => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("using deprecated parameters for the initialization function")
    ) {
      return;
    }
    originalWarn(...args);
  };

  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
}

export function createTrackBoundaryColliders(
  world: RAPIER.World,
  segments: readonly TrackSegment[],
  roadWidth: number,
  wallHeight: number,
  wallThickness: number
): void {
  for (const segment of segments) {
    createWallCollider(world, segment, roadWidth * 0.5 + wallThickness * 0.5, wallHeight, wallThickness);
    createWallCollider(world, segment, -(roadWidth * 0.5 + wallThickness * 0.5), wallHeight, wallThickness);
  }
}

function createWallCollider(
  world: RAPIER.World,
  segment: TrackSegment,
  sideOffset: number,
  wallHeight: number,
  wallThickness: number
): void {
  const rotationHalfAngle = segment.angle * 0.5;
  const desc = RAPIER.ColliderDesc.cuboid((segment.length + 14) * 0.5, wallHeight * 0.5, wallThickness * 0.5)
    .setTranslation(
      segment.center.x + segment.normal.x * sideOffset,
      wallHeight * 0.5,
      segment.center.z + segment.normal.z * sideOffset
    )
    .setRotation({
      x: 0,
      y: Math.sin(rotationHalfAngle),
      z: 0,
      w: Math.cos(rotationHalfAngle)
    });
  world.createCollider(desc);
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

---

## Task 3: Implement RapierCar

**Files:** Modify `src/entities/car.ts`

This is the largest change. `RapierCar` replaces `PrimitiveCar` internally. The `CarEntity` interface stays identical. The exported `createCar` function gains a required `world` parameter.

`RapierCar.update()` pattern per frame:
1. Sync `this.position`, `this.heading`, `this.speedMetersPerSecond` from rigid body (post-last-step values)
2. Apply to `this.group` transform
3. Compute engine force / steering / handbrake from input
4. Call `vehicle.updateVehicle(dt)` (prepares velocities for the upcoming `world.step()`)

Drift: when `input.handbrake` is true, rear wheel `sideFrictionStiffness` drops to `0.22`; released, it lerps back to `1.8` via `driftRecovery` accumulator.

- [ ] **Replace `src/entities/car.ts` with the new implementation**

```typescript
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
      // Spawn smoke particle at rear wheel positions
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
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: error on `game.ts` (`createCar` now requires `world` argument) — fix in Task 4.

---

## Task 4: Update game.ts

**Files:** Modify `src/game.ts`

Two changes: pass `physics.world` to `createCar`, remove boundary resolution block, add drift flash detection.

- [ ] **Apply changes to `src/game.ts`**

Replace the `start()` method body (within the `Game` class):

```typescript
public async start(): Promise<void> {
  const rendererBundle = createRenderer(this.root);
  const cameraRig = createCameraRig();
  const input = new KeyboardInput();
  const physics = await createPhysicsWorld();
  createLights(rendererBundle.scene);

  const ground = createGround();
  const track = createTrack();
  const environment = createEnvironment();
  const car = createCar(physics.world);   // pass world
  const hud = new HudOverlay(this.root);
  const lapTracker = new LapTracker(track.centerLine);
  const clock = new THREE.Clock();
  let wasDrifting = false;
  createTrackBoundaryColliders(physics.world, track.segments, track.roadWidth, track.wallHeight, track.wallThickness);

  rendererBundle.scene.add(ground, environment, track.group, car.group);
  rendererBundle.scene.add(cameraRig.camera);

  const handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    rendererBundle.resize(width, height);
    cameraRig.resize(width, height);
  };

  window.addEventListener("resize", handleResize);

  const render = (): void => {
    const deltaSeconds = clock.getDelta();
    if (input.consumeReset()) {
      car.reset();
      lapTracker.resetCurrentLap();
      hud.flash("Reset to start", "yellow");
    }
    car.update(deltaSeconds, input.state);
    physics.step(deltaSeconds);

    const raceMoment = lapTracker.update(car.position, deltaSeconds);
    if (raceMoment?.type === "checkpoint") {
      hud.flash(`Gate ${raceMoment.checkpoint}/${raceMoment.checkpointTotal}`, "cyan");
    } else if (raceMoment?.type === "lap") {
      hud.flash(`Lap ${raceMoment.lap - 1} complete`, "magenta");
    }

    if (car.isDrifting && !wasDrifting) {
      hud.flash("DRIFT!", "yellow");
    }
    wasDrifting = car.isDrifting;

    cameraRig.update(car.group.position, car.heading, car.speedMetersPerSecond, deltaSeconds);
    const lapSnapshot = lapTracker.getSnapshot();
    hud.update({
      speedKph: Math.abs(car.speedMetersPerSecond) * 3.6,
      lap: lapSnapshot.lap,
      checkpoint: lapSnapshot.checkpointProgress,
      checkpointTotal: lapSnapshot.checkpointTotal,
      currentLapTimeSeconds: lapSnapshot.currentLapTimeSeconds,
      bestLapTimeSeconds: lapSnapshot.bestLapTimeSeconds,
      isOffTrack: false,
      speedRatio: THREE.MathUtils.clamp(Math.abs(car.speedMetersPerSecond) / 46, 0, 1)
    });
    rendererBundle.render(cameraRig.camera);
    this.animationFrameId = window.requestAnimationFrame(render);
  };

  handleResize();
  render();
}
```

Also update the imports at the top of `game.ts` — remove the `resolveTrackBoundary` import:

```typescript
import { createCar } from "./entities/car";
import { createEnvironment } from "./entities/environment";
import { createTrack } from "./entities/track";   // remove resolveTrackBoundary
```

- [ ] **Verify TypeScript compiles with zero errors**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

---

## Task 5: Update HUD — remove isOffTrack warning, add controls hint for handbrake

**Files:** Modify `src/hud/overlay.ts`

- [ ] **Add Space to the controls hint**

In `HudOverlay` constructor, change the `helpElement.innerHTML`:

```typescript
this.helpElement.innerHTML = `
  <div class="controls__line"><strong>Goal</strong> hit green gates in order, then cross the checkered line.</div>
  <div class="controls__line"><kbd>W</kbd>/<kbd>↑</kbd> accelerate &nbsp; <kbd>S</kbd>/<kbd>↓</kbd> brake</div>
  <div class="controls__line"><kbd>A</kbd>/<kbd>D</kbd> steer &nbsp; <kbd>Space</kbd> handbrake &nbsp; <kbd>R</kbd> reset</div>
`;
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 6: Build and verify visually

- [ ] **Run dev server**

```bash
npm run dev
```
Open `http://localhost:5173`

- [ ] **Verify checklist in browser**
  - Car drives on track using WASD ✓
  - Car bounces realistically over the ground (suspension visible) ✓
  - Holding Space + steering causes rear to slide ✓
  - Smoke particles appear at rear wheels during drift ✓
  - Speed streaks turn orange during drift ✓
  - "DRIFT!" flashes in HUD when drift begins ✓
  - `R` resets car to start position ✓
  - Car collides with track walls (bounces off, doesn't clip) ✓
  - No console errors ✓

**Physics tuning notes** (adjust these values in `RapierCar` constructor if behaviour is off):
- Car flips easily → reduce `setWheelMaxSuspensionForce` or increase `setAngularDamping`
- Drift too sticky → reduce `0.22` in drift friction target
- Drift too loose → increase `0.22` or reduce lerp speed `18`
- Suspension too bouncy → increase `setWheelSuspensionCompression/Relaxation`

---

## Task 7: Build check and commit

- [ ] **Production build**

```bash
npm run build
```
Expected: completes without TypeScript errors or Vite warnings about missing exports.

- [ ] **Commit**

```bash
git add src/input/keyboard.ts src/physics/world.ts src/entities/car.ts src/game.ts src/hud/overlay.ts
git commit -m "feat(m1): Rapier dynamic vehicle physics with handbrake drift system

- Replace kinematic PrimitiveCar with RapierCar using DynamicRayCastVehicleController
- Four-wheel raycast suspension with tuned stiffness and damping
- Space handbrake drops rear side friction to 0.22 for drift
- Smoke particles and orange speed streaks during drift
- HUD DRIFT! flash on drift onset
- Ground plane collider enables suspension raycasts"
```
