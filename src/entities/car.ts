import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d";
import type { InputState } from "../input/keyboard";
import type { Vector2 } from "../types";

export interface CarEntity {
  readonly group: THREE.Group;
  readonly position: Vector2;
  readonly heading: number;
  readonly speedMetersPerSecond: number;
  readonly lateralSpeedMetersPerSecond: number;
  readonly verticalSpeed: number;
  readonly isDrifting: boolean;
  readonly isReversing: boolean;
  readonly nitroFuel: number;          // 0–1
  readonly isNitroActive: boolean;
  applyImpulse(x: number, y: number, z: number): void;
  wakeUp(): void;
  reset(): void;
  constrainToTrack(position: Vector2, speedMultiplier: number): void;
  update(deltaSeconds: number, input: InputState): void;
}

export interface CarSpawnOptions {
  readonly position?: Vector2;
  readonly heading?: number;
}

export const DEFAULT_CAR_SPAWN_POSITION: Vector2 = { x: 0, z: 66 };
export const DEFAULT_CAR_SPAWN_HEADING = Math.atan2(44, -8);
const DEFAULT_CAR_SPAWN_BODY_Y = 1.5;

export function createCar(world: RAPIER.World, spawn: CarSpawnOptions = {}): CarEntity {
  return new RapierCar(world, spawn);
}

// Wheel index constants
const FL = 0; // front-left
const FR = 1; // front-right
const RL = 2; // rear-left
const RR = 3; // rear-right

class RapierCar implements CarEntity {
  public readonly group: THREE.Group;
  public position: Vector2;
  public heading: number;
  public speedMetersPerSecond = 0;
  public lateralSpeedMetersPerSecond = 0;
  public verticalSpeed = 0;
  public isDrifting = false;
  public isReversing = false;
  public nitroFuel = 1.0;
  public isNitroActive = false;

  private readonly visual: CarVisual;
  private readonly rigidBody: RAPIER.RigidBody;
  private readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  private readonly spawnPosition: Vector2;
  private readonly spawnHeading: number;

  private wheelSpin = 0;
  private visualSteer = 0;
  private bodyRoll = 0;
  private bodyPitch = 0;
  private rearSideFriction = 1.8;
  private smokeParticles: SmokeParticle[] = [];
  private nitroParticles: NitroParticle[] = [];
  private brakeDustParticles: SmokeParticle[] = [];
  private skidMarks: SkidMark[] = [];
  private skidTimer = 0;
  private wasHandbraking = false;
  private isLaunching = false;
  private isBrakingHard = false;
  private readonly headlightPL: THREE.PointLight;
  private readonly brakeLightPL: THREE.PointLight;
  private readonly underglowPL: THREE.PointLight;
  private readonly nitroPL: THREE.PointLight;

  public constructor(world: RAPIER.World, spawn: CarSpawnOptions) {
    this.spawnPosition = spawn.position ?? DEFAULT_CAR_SPAWN_POSITION;
    this.spawnHeading = spawn.heading ?? DEFAULT_CAR_SPAWN_HEADING;
    this.position = { ...this.spawnPosition };
    this.heading = this.spawnHeading;
    this.visual = createCarMesh();
    this.group = this.visual.group;

    // Chassis rigid body
    const initH = this.spawnHeading;
    const sinH = Math.sin(initH * 0.5);
    const cosH = Math.cos(initH * 0.5);
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.spawnPosition.x, DEFAULT_CAR_SPAWN_BODY_Y, this.spawnPosition.z)
      .setRotation({ x: 0, y: sinH, z: 0, w: cosH })
      .setLinearDamping(0.04)
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
      this.vehicle.setWheelSuspensionStiffness(i, i < 2 ? 43 : 27);
      this.vehicle.setWheelSuspensionCompression(i, 3.6);
      this.vehicle.setWheelSuspensionRelaxation(i, 2.8);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.40);
      this.vehicle.setWheelMaxSuspensionForce(i, 24000);
      this.vehicle.setWheelFrictionSlip(i, i < 2 ? 2.9 : 2.4);
      // Front wheels have more side grip (2.1 vs 1.8) — natural understeer bias
      // makes the car predictable and easy to set up for drifts
      this.vehicle.setWheelSideFrictionStiffness(i, i < 2 ? 2.3 : 1.85);
    }

    this.syncFromRigidBody();

    // Real illumination from headlights + brake lights
    this.headlightPL = new THREE.PointLight(0xfff5cc, 32, 22, 2.1);
    this.headlightPL.position.set(0, 1.2, 3.5);
    this.group.add(this.headlightPL);

    this.brakeLightPL = new THREE.PointLight(0xff1744, 6, 14, 2.3);
    this.brakeLightPL.position.set(0, 0.9, -3.3);
    this.group.add(this.brakeLightPL);

    // Neon underglow: sits under the chassis, color-coded to drift state
    this.underglowPL = new THREE.PointLight(0x3df4d6, 10, 11, 2.2);
    this.underglowPL.position.set(0, -0.55, 0);
    this.group.add(this.underglowPL);

    // Nitro exhaust: blue-white jet behind the car, off by default
    this.nitroPL = new THREE.PointLight(0x44aaff, 0, 12, 2.0);
    this.nitroPL.position.set(0, 0.5, -2.8);
    this.group.add(this.nitroPL);
  }

  public reset(): void {
    const h = this.spawnHeading;
    this.rigidBody.setTranslation({ x: this.spawnPosition.x, y: DEFAULT_CAR_SPAWN_BODY_Y, z: this.spawnPosition.z }, true);
    this.rigidBody.setRotation({ x: 0, y: Math.sin(h * 0.5), z: 0, w: Math.cos(h * 0.5) }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngularDamping(1.2);
    this.rearSideFriction = 1.8;
    this.isDrifting = false;
    this.wasHandbraking = false;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.nitroFuel = 1.0;
    this.isNitroActive = false;
    this.nitroPL.intensity = 0;
    this.vehicle.setWheelSideFrictionStiffness(RL, 1.8);
    this.vehicle.setWheelSideFrictionStiffness(RR, 1.8);
    this.syncFromRigidBody();
  }

  public applyImpulse(x: number, y: number, z: number): void {
    this.rigidBody.applyImpulse({ x, y, z }, true);
  }

  public wakeUp(): void {
    this.rigidBody.wakeUp();
  }

  // No-op: Rapier wall colliders handle boundaries
  public constrainToTrack(_position: Vector2, _speedMultiplier: number): void {}

  public update(deltaSeconds: number, input: InputState): void {
    const dt = Math.min(deltaSeconds, 1 / 30);
    this.rigidBody.wakeUp();
    this.syncFromRigidBody();

    const vel = this.rigidBody.linvel();
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const speed = vel.x * fwdX + vel.z * fwdZ;
    const absSpeed = Math.abs(speed);
    const steerInput = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const speedRatio = THREE.MathUtils.clamp(absSpeed / 50, 0, 1);

    // ── Steering: wider at low speed for drift setup ───────────────────
    // Extra counter-steer authority when actively drifting (more angle to catch slides)
    const driftSteerBoost = this.rearSideFriction < 0.70 ? 0.12 : 0;
    const maxSteer = THREE.MathUtils.lerp(0.58 + driftSteerBoost, 0.22, speedRatio);
    // Stability assist: only fires when player is NOT actively steering (prevents fighting drifts)
    const signedLateral = -vel.x * fwdZ + vel.z * fwdX;
    const playerSteering = Math.abs(steerInput) > 0.01;
    const assistStrength = (!input.handbrake && !playerSteering && absSpeed > 14)
      ? THREE.MathUtils.clamp(-signedLateral / 20, -0.15, 0.15)
      : 0;
    // Drift counter-steer: gentle correction when sliding — fades out as player steers
    const driftCS = (this.isDrifting && !input.handbrake && absSpeed > 8)
      ? THREE.MathUtils.clamp(-signedLateral / 12, -0.28, 0.28) * Math.max(0, 1 - Math.abs(steerInput) * 2.8)
      : 0;
    const totalSteer = THREE.MathUtils.clamp(steerInput * maxSteer + assistStrength + driftCS, -maxSteer, maxSteer);
    this.vehicle.setWheelSteering(FL, totalSteer);
    this.vehicle.setWheelSteering(FR, totalSteer);

    // ── Nitro: deplete when active, recharge when off ────────────────────
    const NITRO_DRAIN = 0.26;   // fuel/s while active
    const NITRO_CHARGE = 0.18;  // fuel/s while recharging
    this.isNitroActive = input.nitro && this.nitroFuel > 0.02 && input.accelerate;
    if (this.isNitroActive) {
      this.nitroFuel = Math.max(0, this.nitroFuel - NITRO_DRAIN * dt);
    } else {
      this.nitroFuel = Math.min(1, this.nitroFuel + NITRO_CHARGE * dt);
    }
    const nitroMult = this.isNitroActive ? 2.08 : 1.0;

    // ── Torque curve: sharp launch kick, peak mid-range, falls off at top ──
    let engineForceRL = 0, engineForceRR = 0;
    if (input.accelerate) {
      let rawForce: number;
      if (speedRatio < 0.06) {
        rawForce = THREE.MathUtils.lerp(12500, 8200, speedRatio / 0.06);
      } else if (speedRatio < 0.25) {
        rawForce = THREE.MathUtils.lerp(8200, 6600, (speedRatio - 0.06) / 0.19);
      } else if (speedRatio < 0.62) {
        rawForce = THREE.MathUtils.lerp(6600, 4400, (speedRatio - 0.25) / 0.37);
      } else {
        rawForce = THREE.MathUtils.lerp(4400, 3450, (speedRatio - 0.62) / 0.38);
      }
      engineForceRL = rawForce * nitroMult;
      engineForceRR = rawForce * nitroMult;
    }

    // ── Braking / reverse ────────────────────────────────────────────
    let brakeFL = 0, brakeFR = 0, brakeRL = 0, brakeRR = 0;
    const maxReverseSpeed = 12; // m/s cap for reverse
    if (input.reverse && !input.handbrake && speed > -maxReverseSpeed) {
      // Dedicated reverse key: applies backward force immediately, no speed prerequisite
      const reverseRatio = THREE.MathUtils.clamp((speed + maxReverseSpeed) / maxReverseSpeed, 0, 1);
      const revForce = THREE.MathUtils.lerp(1400, 3400, reverseRatio);
      engineForceRL = -revForce;
      engineForceRR = -revForce;
      this.isReversing = true;
      // Brake to slow forward motion first when going forward
      if (speed > 1) {
        brakeFL = 2400; brakeFR = 2400; brakeRL = 1600; brakeRR = 1600;
      }
    } else if (input.brake && (absSpeed < 1.2 || speed < 0) && !input.handbrake) {
      // Brake key also triggers reverse once nearly stopped
      const revSpeed = Math.min(1, (1.2 - Math.max(0, speed)) / 1.2);
      const revForce = THREE.MathUtils.lerp(1800, 3200, revSpeed);
      engineForceRL = -revForce;
      engineForceRR = -revForce;
      this.isReversing = true;
    } else if (input.brake) {
      // Brake force scaled to match boosted engine torque
      const brakeMag = THREE.MathUtils.lerp(1400, 7800, Math.pow(speedRatio, 0.52));
      const frontBias = THREE.MathUtils.lerp(0.64, 0.74, speedRatio);
      brakeFL = brakeMag * frontBias;
      brakeFR = brakeMag * frontBias;
      brakeRL = brakeMag * (1 - frontBias);
      brakeRR = brakeMag * (1 - frontBias);
      this.isReversing = false;
    } else {
      this.isReversing = false;
    }
    if (!input.accelerate && !input.handbrake && !input.brake && !input.reverse && absSpeed > 1) {
      // Engine braking: gentle so lift-off doesn't feel like hitting a wall
      const engBrake = THREE.MathUtils.lerp(160, 1180, speedRatio);
      brakeFL = engBrake * 0.50;
      brakeFR = engBrake * 0.50;
      brakeRL = engBrake;
      brakeRR = engBrake;
    }

    // ── Handbrake / drift ──────────────────────────────────────────────
    if (input.handbrake && absSpeed > 4) {
      this.rearSideFriction = THREE.MathUtils.lerp(this.rearSideFriction, 0.15, 1 - Math.exp(-dt * 10));
      this.isDrifting = true;
      brakeRL = 3600;
      brakeRR = 3600;
      // On drift entry: kick the rear out — applied at rear axle for yaw
      if (!this.wasHandbraking && absSpeed > 8 && Math.abs(steerInput) > 0.01) {
        const kickMag = steerInput * Math.min(absSpeed, 26) * 235;
        const lateralX = Math.cos(this.heading) * kickMag;
        const lateralZ = -Math.sin(this.heading) * kickMag;
        // Rear axle world position: 1.78 m behind car centre
        const rearX = this.group.position.x - Math.sin(this.heading) * 1.78;
        const rearY = this.group.position.y + 0.72;
        const rearZ = this.group.position.z - Math.cos(this.heading) * 1.78;
        this.rigidBody.applyImpulseAtPoint(
          { x: lateralX, y: 0, z: lateralZ },
          { x: rearX, y: rearY, z: rearZ },
          true
        );
      }
      // Freerer rotation during drift; throttle controls the drift angle
      this.rigidBody.setAngularDamping(0.15);
    } else {
      // Throttle-on during drift keeps rear friction low (throttle oversteer / power-slide)
      const poweredDrift = this.isDrifting && input.accelerate && absSpeed > 10;
      const frictionTarget = poweredDrift ? 0.18 : 1.8;
      // Snap back quickly on release: 5.5 initial recovery, then 7 once nearly recovered
      const recoveryRate = poweredDrift ? 1.8 : (this.rearSideFriction < 0.55 ? 7.5 : 9.0);
      this.rearSideFriction = THREE.MathUtils.lerp(this.rearSideFriction, frictionTarget, 1 - Math.exp(-dt * recoveryRate));
      this.isDrifting = this.rearSideFriction < 0.72 && absSpeed > 4;
      this.rigidBody.setAngularDamping(poweredDrift ? 0.30 : 1.26);
    }
    this.wasHandbraking = input.handbrake && absSpeed > 4;

    // Natural lateral slip counts as drifting only when truly sliding hard
    if (!this.isDrifting && this.lateralSpeedMetersPerSecond > 4.8 && absSpeed > 12) {
      this.isDrifting = true;
    }

    this.vehicle.setWheelSideFrictionStiffness(RL, this.rearSideFriction);
    this.vehicle.setWheelSideFrictionStiffness(RR, this.rearSideFriction);
    this.vehicle.setWheelEngineForce(RL, engineForceRL);
    this.vehicle.setWheelEngineForce(RR, engineForceRR);
    this.vehicle.setWheelBrake(FL, brakeFL);
    this.vehicle.setWheelBrake(FR, brakeFR);
    this.vehicle.setWheelBrake(RL, brakeRL);
    this.vehicle.setWheelBrake(RR, brakeRR);

    if (input.accelerate && !input.handbrake && speed > -1 && absSpeed < 10) {
      const launchAssist = THREE.MathUtils.lerp(300, 0, absSpeed / 10) * nitroMult;
      this.rigidBody.addForce({ x: fwdX * launchAssist, y: 0, z: fwdZ * launchAssist }, true);
    }

    this.vehicle.updateVehicle(dt);

    // Aerodynamic downforce: keeps car planted at high speed, suppressed mid-jump
    const rigidBodyY = this.rigidBody.translation().y;
    const isAirborne = rigidBodyY > 2.4;  // more than ~0.9 m above normal rest height
    if (absSpeed > 4 && !isAirborne) {
      this.rigidBody.addForce({ x: 0, y: -speedRatio * speedRatio * 6400, z: 0 }, true);
    }

    this.speedMetersPerSecond = speed;
    this.isLaunching = input.accelerate && absSpeed < 7 && absSpeed > 0.3 && !input.handbrake;
    this.isBrakingHard = input.brake && absSpeed > 18 && !input.handbrake;
    this.updateVisuals(dt, steerInput, input.brake, speedRatio);
    this.updateSmoke(dt);
    this.updateNitroTrail(dt);
    this.updateBrakeDust(dt, input.brake);
    this.updateSkidMarks(dt);
  }

  private syncFromRigidBody(): void {
    const t = this.rigidBody.translation();
    const r = this.rigidBody.rotation();
    this.position = { x: t.x, z: t.z };
    this.heading = Math.atan2(
      2 * (r.w * r.y + r.x * r.z),
      1 - 2 * (r.y * r.y + r.z * r.z)
    );
    const vel = this.rigidBody.linvel();
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    this.lateralSpeedMetersPerSecond = Math.abs(-vel.x * fwdZ + vel.z * fwdX);
    this.verticalSpeed = vel.y;
    this.group.position.set(t.x, t.y - 0.72, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);
  }

  private updateVisuals(dt: number, steerInput: number, isBraking: boolean, speedRatio: number): void {
    this.wheelSpin -= this.speedMetersPerSecond * dt * 3.6;
    const steerRate = THREE.MathUtils.lerp(17, 6, speedRatio);
    this.visualSteer = THREE.MathUtils.lerp(this.visualSteer, steerInput * 0.50, 1 - Math.exp(-dt * steerRate));

    for (let i = 0; i < 4; i++) {
      const angle = this.vehicle.wheelRotation(i) ?? (i < 2 ? 0 : this.wheelSpin);
      this.visual.allWheels[i].rotation.x = angle;
    }
    for (const wheel of this.visual.frontWheels) {
      wheel.rotation.y = this.visualSteer;
    }

    // Physics-based body roll and pitch from actual suspension compression
    const rest = 0.55;
    const flComp = rest - (this.vehicle.wheelSuspensionLength(FL) ?? rest);
    const frComp = rest - (this.vehicle.wheelSuspensionLength(FR) ?? rest);
    const rlComp = rest - (this.vehicle.wheelSuspensionLength(RL) ?? rest);
    const rrComp = rest - (this.vehicle.wheelSuspensionLength(RR) ?? rest);
    const targetRoll = ((frComp + rrComp) - (flComp + rlComp)) * 0.70;
    const targetPitch = ((rlComp + rrComp) - (flComp + frComp)) * 0.36;
    this.bodyRoll = THREE.MathUtils.lerp(this.bodyRoll, targetRoll, 1 - Math.exp(-dt * 9));
    this.bodyPitch = THREE.MathUtils.lerp(this.bodyPitch, targetPitch, 1 - Math.exp(-dt * 6));
    this.visual.bodyRoot.rotation.z = this.bodyRoll;
    this.visual.bodyRoot.rotation.x = this.bodyPitch;

    const driftRatio = THREE.MathUtils.clamp(1 - (this.rearSideFriction - 0.22) / (1.8 - 0.22), 0, 1);
    const streakScale = THREE.MathUtils.lerp(0.35, 2.0, speedRatio) * (1 + driftRatio * 1.5);
    this.visual.speedStreaks.scale.z = streakScale;
    this.visual.speedStreaks.position.z = THREE.MathUtils.lerp(-3.15, -9.0, speedRatio);
    this.visual.speedStreaks.visible = speedRatio > 0.06 || this.isDrifting;

    // Streaks: cyan→orange smooth transition via driftRatio; opacity scales with speed
    const streakOpacity = THREE.MathUtils.lerp(0.28, 0.86, speedRatio);
    const streakColor = new THREE.Color().lerpColors(new THREE.Color(0x3df4d6), new THREE.Color(1.0, 0.45, 0.1), driftRatio);
    (this.visual.speedStreaks.children as THREE.Mesh[]).forEach(m => {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(streakColor);
      mat.opacity = streakOpacity;
    });

    for (const light of this.visual.brakeLights) {
      light.material.emissiveIntensity = isBraking ? 2.2 : 0.75;
    }
    this.brakeLightPL.intensity = isBraking ? 16 : (this.isReversing ? 8 : 3);
    this.headlightPL.intensity = THREE.MathUtils.lerp(28, 60, speedRatio);
    this.headlightPL.distance = THREE.MathUtils.lerp(18, 38, speedRatio);

    // Underglow: cyan at rest/speed; during drift pulses orange with drift intensity
    if (this.isDrifting) {
      const driftIntensity = THREE.MathUtils.clamp(1 - (this.rearSideFriction - 0.22) / (0.72 - 0.22), 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0055);  // ~0.87 Hz throb
      const targetIntensity = THREE.MathUtils.lerp(12, 24, driftIntensity * pulse);
      this.underglowPL.color.setRGB(1, 0.38 + 0.12 * pulse, 0);
      this.underglowPL.intensity = THREE.MathUtils.lerp(this.underglowPL.intensity, targetIntensity, 1 - Math.exp(-dt * 10));
    } else {
      this.underglowPL.color.setHex(0x3df4d6);
      this.underglowPL.intensity = THREE.MathUtils.lerp(this.underglowPL.intensity, 9, 1 - Math.exp(-dt * 5));
    }

    // Nitro exhaust light: blue-white pulse with slight flicker
    if (this.isNitroActive) {
      const flicker = 0.8 + 0.2 * Math.random();
      this.nitroPL.intensity = THREE.MathUtils.lerp(this.nitroPL.intensity, 28 * flicker, 1 - Math.exp(-dt * 18));
    } else {
      this.nitroPL.intensity = THREE.MathUtils.lerp(this.nitroPL.intensity, 0, 1 - Math.exp(-dt * 8));
    }
  }

  private updateBrakeDust(dt: number, isBraking: boolean): void {
    if (isBraking && this.isBrakingHard && this.group.parent && Math.random() < 0.82) {
      for (const wheelIdx of [FL, FR]) {
        const hp = this.vehicle.wheelHardPoint(wheelIdx);
        const side = wheelIdx === FL ? -1 : 1;
        const wx = hp ? hp.x : this.group.position.x + Math.sin(this.heading) * 1.62 + Math.cos(this.heading) * (side * 1.88);
        const wz = hp ? hp.z : this.group.position.z + Math.cos(this.heading) * 1.62 - Math.sin(this.heading) * (side * 1.88);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.28 + Math.random() * 0.14, 5, 5),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.85, 0.90, 0.95),
            transparent: true, opacity: 0.28 + Math.random() * 0.14,
            depthWrite: false, blending: THREE.NormalBlending,
          })
        );
        mesh.position.set(wx + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.15, wz + (Math.random() - 0.5) * 0.4);
        this.group.parent.add(mesh);
        this.brakeDustParticles.push({ mesh, life: 0, maxLife: 0.38 + Math.random() * 0.26 });
      }
    }

    for (let i = this.brakeDustParticles.length - 1; i >= 0; i--) {
      const p = this.brakeDustParticles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      p.mesh.position.y += dt * 2.9;
      p.mesh.scale.setScalar(1 + t * 2.8);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - t * t);
      if (p.life >= p.maxLife) {
        p.mesh.parent?.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.brakeDustParticles.splice(i, 1);
      }
    }
  }

  private updateNitroTrail(dt: number): void {
    if (this.isNitroActive && this.group.parent) {
      // Spawn blue-white particles per frame from exhaust
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 5, 5),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.55 + Math.random() * 0.45, 0.80 + Math.random() * 0.20, 1.0),
            transparent: true, opacity: 0.82,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })
        );
        // Exhaust exit in world space (1.8m behind car centre, 0.4m up)
        const bwdX = -Math.sin(this.heading) * 2.2;
        const bwdZ = -Math.cos(this.heading) * 2.2;
        mesh.position.set(
          this.group.position.x + bwdX + (Math.random() - 0.5) * 0.9,
          this.group.position.y + 0.4,
          this.group.position.z + bwdZ + (Math.random() - 0.5) * 0.9
        );
        const speed = Math.abs(this.speedMetersPerSecond);
        const vMag = speed * 0.6 + 5 + Math.random() * 4;
        this.group.parent.add(mesh);
        this.nitroParticles.push({
          mesh,
          vx: bwdX / 2.2 * vMag + (Math.random() - 0.5) * 3,
          vy: 2.2 + Math.random() * 2.8,
          vz: bwdZ / 2.2 * vMag + (Math.random() - 0.5) * 3,
          life: 0,
          maxLife: 0.22 + Math.random() * 0.16,
        });
      }
    }

    for (let i = this.nitroParticles.length - 1; i >= 0; i--) {
      const p = this.nitroParticles[i];
      p.life += dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 1.4 * dt;
      const frac = p.life / p.maxLife;
      p.mesh.scale.setScalar(1 + frac * 5.2);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.82 * (1 - frac * frac);
      if (p.life >= p.maxLife) {
        p.mesh.parent?.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.nitroParticles.splice(i, 1);
      }
    }
  }

  private updateSmoke(dt: number): void {
    const shouldSpawn = this.isDrifting || this.isLaunching;
    if (shouldSpawn) {
      const spawnRate = this.isDrifting
        ? (Math.abs(this.speedMetersPerSecond) > 8 ? 0.88 : 0.4)
        : 0.38;
      if (this.smokeParticles.length < 64 && Math.random() < spawnRate) {
        for (const wheelIdx of [RL, RR]) {
          const hp = this.vehicle.wheelHardPoint(wheelIdx);
          const wx = hp ? hp.x : this.group.position.x + Math.sin(this.heading) * (-1.78) + Math.cos(this.heading) * (wheelIdx === RL ? -1.88 : 1.88);
          const wz = hp ? hp.z : this.group.position.z + Math.cos(this.heading) * (-1.78) - Math.sin(this.heading) * (wheelIdx === RL ? -1.88 : 1.88);
          const spread = (Math.random() - 0.5) * 1.2;
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.50 + Math.random() * 0.26, 6, 6),
            new THREE.MeshBasicMaterial({
              // Launch: thin white smoke; heavy drift: amber; light drift: white-gray
              color: this.isLaunching && !this.isDrifting
                ? new THREE.Color(0.95, 0.95, 0.95)
                : this.rearSideFriction < 0.45
                ? new THREE.Color(1.0, 0.72 + Math.random() * 0.1, 0.42)
                : new THREE.Color(0.88 + Math.random() * 0.12, 0.88, 0.88),
              transparent: true,
              opacity: 0.44 + Math.random() * 0.22,
              depthWrite: false,
              blending: THREE.NormalBlending,
            })
          );
          mesh.position.set(wx + spread, 0.3 + Math.random() * 0.2, wz + spread);
          mesh.rotation.y = Math.random() * Math.PI * 2;
          if (this.group.parent) this.group.parent.add(mesh);
          this.smokeParticles.push({ mesh, life: 0, maxLife: 0.80 + Math.random() * 0.65 });
        }
      }
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      p.mesh.position.y += dt * 3.1;
      p.mesh.rotation.y += dt * 0.9;
      p.mesh.scale.setScalar(1 + t * 8.6);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = (0.44 + 0.22) * (1 - t * t);
      if (p.life >= p.maxLife) {
        p.mesh.parent?.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.smokeParticles.splice(i, 1);
      }
    }
  }

  private updateSkidMarks(dt: number): void {
    // Spawn new marks while drifting (throttled)
    if (this.isDrifting && Math.abs(this.speedMetersPerSecond) > 4) {
      this.skidTimer -= dt;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.028;
        for (const wheelIdx of [RL, RR]) {
          if (this.skidMarks.length >= 120) {
            const old = this.skidMarks.shift()!;
            old.mesh.parent?.remove(old.mesh);
            old.mesh.geometry.dispose();
            old.mesh.material.dispose();
          }
          const hp = this.vehicle.wheelHardPoint(wheelIdx);
          const side = wheelIdx === RL ? -1 : 1;
          const wx = hp ? hp.x : this.group.position.x + Math.sin(this.heading) * -1.78 + Math.cos(this.heading) * (side * 1.88);
          const wz = hp ? hp.z : this.group.position.z + Math.cos(this.heading) * -1.78 - Math.sin(this.heading) * (side * 1.88);
          // Heavy drift (rearSideFriction very low) → amber-orange mark; light slip → near-black
          const skidColor = this.rearSideFriction < 0.55 ? 0x1e0c00 : 0x080808;
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.50, 0.92),
            new THREE.MeshBasicMaterial({ color: skidColor, transparent: true, opacity: 0.88, depthWrite: false })
          );
          mesh.rotation.x = -Math.PI / 2;
          mesh.rotation.z = this.heading;
          mesh.position.set(wx, 0.018, wz);
          if (this.group.parent) this.group.parent.add(mesh);
          this.skidMarks.push({ mesh, life: 0, maxLife: 8 + Math.random() * 4 });
        }
      }
    }

    // Front brake marks: narrow strips from FL/FR during hard braking
    if (this.isBrakingHard) {
      this.skidTimer -= dt;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.028;
        for (const wheelIdx of [FL, FR]) {
          if (this.skidMarks.length >= 120) {
            const old = this.skidMarks.shift()!;
            old.mesh.parent?.remove(old.mesh);
            old.mesh.geometry.dispose();
            old.mesh.material.dispose();
          }
          const hp = this.vehicle.wheelHardPoint(wheelIdx);
          const side = wheelIdx === FL ? -1 : 1;
          const wx = hp ? hp.x : this.group.position.x + Math.sin(this.heading) * 1.62 + Math.cos(this.heading) * (side * 1.88);
          const wz = hp ? hp.z : this.group.position.z + Math.cos(this.heading) * 1.62 - Math.sin(this.heading) * (side * 1.88);
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.22, 0.68),
            new THREE.MeshBasicMaterial({ color: 0x060606, transparent: true, opacity: 0.64, depthWrite: false })
          );
          mesh.rotation.x = -Math.PI / 2;
          mesh.rotation.z = this.heading;
          mesh.position.set(wx, 0.019, wz);
          if (this.group.parent) this.group.parent.add(mesh);
          this.skidMarks.push({ mesh, life: 0, maxLife: 6 + Math.random() * 3 });
        }
      }
    }

    // Age and fade all marks
    for (let i = this.skidMarks.length - 1; i >= 0; i--) {
      const s = this.skidMarks[i];
      s.life += dt;
      const fadeStart = s.maxLife * 0.72;
      if (s.life > fadeStart) {
        s.mesh.material.opacity = 0.5 * (1 - (s.life - fadeStart) / (s.maxLife - fadeStart));
      }
      if (s.life >= s.maxLife) {
        s.mesh.parent?.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.skidMarks.splice(i, 1);
      }
    }
  }
}

interface SmokeParticle {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface NitroParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface SkidMark {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
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

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xff3158, roughness: 0.34, metalness: 0.18, emissive: 0x2a0610, emissiveIntensity: 0.30 });
  const darkBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x161d25, roughness: 0.42, metalness: 0.12 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x59e7ff, roughness: 0.18, metalness: 0.02, emissive: 0x0c6680, emissiveIntensity: 0.58 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090b0d, roughness: 0.72, metalness: 0.08 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdce9f4, roughness: 0.22, metalness: 0.62, emissive: 0x172b33, emissiveIntensity: 0.28 });
  const neonMaterial = new THREE.MeshStandardMaterial({ color: 0x3df4d6, roughness: 0.24, emissive: 0x18bfa9, emissiveIntensity: 0.72 });
  const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2b8, roughness: 0.18, emissive: 0xffd35a, emissiveIntensity: 0.72 });
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

  const underglow = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.08, 4.2), neonMaterial);
  underglow.position.set(0, 0.16, -0.12); bodyRoot.add(underglow);

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
  const rimGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.58, 24);
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
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 5.8), speedStreakMaterial.clone());
    streak.position.set(x, 0.32, 0);
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

export function tintCar(group: THREE.Group, color: number): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (mat.color.getHex() === 0xff3158) {
        mat.color.setHex(color);
        mat.emissive.setHex(color >> 1);
      }
    }
  });
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
