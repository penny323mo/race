import * as THREE from "three";
import type { CarEntity } from "../entities/car";
import type { InputState } from "../input/keyboard";
import type { Vector2 } from "../types";

export class AIDriver {
  private readonly car: CarEntity;
  private readonly splineSamples: readonly THREE.Vector3[];
  private engineForceMultiplier = 1.0;
  private stuckTimer = 0;
  private recoveryTimer = 0;

  public constructor(car: CarEntity, centerLine: readonly Vector2[]) {
    this.car = car;
    this.splineSamples = buildSplineSamples(centerLine, 512);
  }

  public get group(): THREE.Group {
    return this.car.group;
  }

  public reset(): void {
    this.engineForceMultiplier = 1.0;
    this.stuckTimer = 0;
    this.recoveryTimer = 0;
  }

  public update(deltaSeconds: number, playerPosition: Vector2): void {
    const dt = Math.min(deltaSeconds, 1 / 30);

    // Rubber-band: adjust speed based on gap to player
    const dx = this.car.position.x - playerPosition.x;
    const dz = this.car.position.z - playerPosition.z;
    const gap = Math.hypot(dx, dz);
    const isAhead = this.isAheadOfPlayer(playerPosition);

    if (isAhead && gap > 5) {
      this.engineForceMultiplier = THREE.MathUtils.lerp(this.engineForceMultiplier, 0.74, 1 - Math.exp(-dt * 1.5));
    } else if (!isAhead && gap > 5) {
      this.engineForceMultiplier = THREE.MathUtils.lerp(this.engineForceMultiplier, 1.30, 1 - Math.exp(-dt * 1.5));
    } else {
      this.engineForceMultiplier = THREE.MathUtils.lerp(this.engineForceMultiplier, 1.0, 1 - Math.exp(-dt * 1.5));
    }

    // Stuck detection: if speed is near zero for 3+ seconds, trigger a recovery
    if (Math.abs(this.car.speedMetersPerSecond) < 1.5) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
    }
    if (this.recoveryTimer > 0) {
      this.recoveryTimer -= dt;
    }

    let input = this.computeInput();

    if (this.stuckTimer > 1.2 || this.recoveryTimer > 0) {
      if (this.stuckTimer > 1.2) {
        // Start a 2.2s recovery sequence: reverse + opposite steer
        this.recoveryTimer = 1.8;
        this.stuckTimer = 0;
      }
      const nearest = this.findNearestSampleIndex(this.car.position);
      const ahead = this.findSampleAtDistance(nearest, 8);
      const dx = ahead.x - this.car.position.x;
      const dz = ahead.z - this.car.position.z;
      const targetAngle = Math.atan2(dx, dz);
      let steerError = targetAngle - this.car.heading;
      while (steerError > Math.PI) steerError -= Math.PI * 2;
      while (steerError < -Math.PI) steerError += Math.PI * 2;
      input = {
        accelerate: false,
        brake: false,
        reverse: true,
        steerLeft: steerError < 0,
        steerRight: steerError > 0,
        handbrake: false,
        nitro: false,
        reset: false
      };
    }

    this.car.update(deltaSeconds, input);
  }

  private computeInput(): InputState {
    // Find lookahead target on spline
    const pos = this.car.position;
    const nearest = this.findNearestSampleIndex(pos);
    const speed = Math.abs(this.car.speedMetersPerSecond);
    const lookaheadDistance = Math.max(14, speed * 0.82);
    const lookahead = this.findSampleAtDistance(nearest, lookaheadDistance);

    // Pure pursuit: compute steering direction
    const dx = lookahead.x - pos.x;
    const dz = lookahead.z - pos.z;
    const targetAngle = Math.atan2(dx, dz);
    let steerError = targetAngle - this.car.heading;
    while (steerError > Math.PI) steerError -= Math.PI * 2;
    while (steerError < -Math.PI) steerError += Math.PI * 2;

    const steerLeft = steerError > 0.03;
    const steerRight = steerError < -0.03;

    // Brake when entering a sharp corner at high speed
    const absSteerError = Math.abs(steerError);
    const shouldBrake = absSteerError > 0.12 && speed > 10;

    // Throttle based on rubber-band multiplier (suppress while braking)
    const throttle = !shouldBrake && (this.engineForceMultiplier >= 0.95 ||
      Math.random() < this.engineForceMultiplier);

    // Nitro on straights: fire when aligned with track and not at top speed
    const shouldNitro = throttle && absSteerError < 0.10 && speed < 36 && Math.random() < 0.42;

    return {
      accelerate: throttle,
      brake: shouldBrake,
      reverse: false,
      steerLeft,
      steerRight,
      reset: false,
      handbrake: false,
      nitro: shouldNitro
    };
  }

  private isAheadOfPlayer(playerPosition: Vector2): boolean {
    const aiIdx = this.findNearestSampleIndex(this.car.position);
    const playerIdx = this.findNearestSampleIndex(playerPosition);
    // Account for wrap-around
    const aiProgress = aiIdx / this.splineSamples.length;
    const playerProgress = playerIdx / this.splineSamples.length;
    const diff = aiProgress - playerProgress;
    if (diff > 0.5) return false;
    if (diff < -0.5) return true;
    return diff > 0;
  }

  private findNearestSampleIndex(pos: Vector2): number {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.splineSamples.length; i++) {
      const s = this.splineSamples[i];
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  private findSampleAtDistance(startIndex: number, distance: number): THREE.Vector3 {
    let accumulated = 0;
    let i = startIndex;
    while (accumulated < distance) {
      const next = (i + 1) % this.splineSamples.length;
      const step = this.splineSamples[i].distanceTo(this.splineSamples[next]);
      accumulated += step;
      i = next;
      if (i === startIndex) break;
    }
    return this.splineSamples[i];
  }
}

function buildSplineSamples(centerLine: readonly Vector2[], count: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(
    centerLine.map(p => new THREE.Vector3(p.x, 0, p.z)),
    true,
    "catmullrom",
    0.42
  );
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    samples.push(curve.getPointAt(i / count));
  }
  return samples;
}
