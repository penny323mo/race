import * as THREE from "three";
import type { CarEntity } from "../entities/car";
import type { InputState } from "../input/keyboard";
import type { Vector2 } from "../types";

export class AIDriver {
  private readonly car: CarEntity;
  private readonly splineSamples: readonly THREE.Vector3[];
  private engineForceMultiplier = 1.0;

  public constructor(car: CarEntity, centerLine: readonly Vector2[]) {
    this.car = car;
    this.splineSamples = buildSplineSamples(centerLine, 512);
  }

  public get group(): THREE.Group {
    return this.car.group;
  }

  public update(deltaSeconds: number, playerPosition: Vector2): void {
    const dt = Math.min(deltaSeconds, 1 / 30);

    // Rubber-band: adjust speed based on gap to player
    const dx = this.car.position.x - playerPosition.x;
    const dz = this.car.position.z - playerPosition.z;
    const gap = Math.hypot(dx, dz);
    const isAhead = this.isAheadOfPlayer(playerPosition);

    if (isAhead && gap > 5) {
      this.engineForceMultiplier = THREE.MathUtils.lerp(this.engineForceMultiplier, 0.85, 1 - Math.exp(-dt * 1.5));
    } else if (!isAhead && gap > 5) {
      this.engineForceMultiplier = THREE.MathUtils.lerp(this.engineForceMultiplier, 1.10, 1 - Math.exp(-dt * 1.5));
    } else {
      this.engineForceMultiplier = THREE.MathUtils.lerp(this.engineForceMultiplier, 1.0, 1 - Math.exp(-dt * 1.5));
    }

    const input = this.computeInput();
    // Patch engine force via input — AIDriver overrides accelerate always true,
    // actual multiplier is applied in a wrapped update call
    this.car.update(deltaSeconds, input);
    // Rubber-band: post-update velocity scaling via angular damping is not directly accessible,
    // so we rely on the engineForce multiplier being baked into InputState via a thin wrapper.
    // Since CarEntity.update() doesn't expose force multiplier, we approximate:
    // when multiplier < 1, occasionally release accelerate to simulate slower AI.
    // This is handled by throttleInput below.
  }

  private computeInput(): InputState {
    // Find lookahead target on spline
    const pos = this.car.position;
    const nearest = this.findNearestSampleIndex(pos);
    const speed = Math.abs(this.car.speedMetersPerSecond);
    const lookaheadDistance = Math.max(12, speed * 0.5);
    const lookahead = this.findSampleAtDistance(nearest, lookaheadDistance);

    // Pure pursuit: compute steering direction
    const dx = lookahead.x - pos.x;
    const dz = lookahead.z - pos.z;
    const targetAngle = Math.atan2(dx, dz);
    let steerError = targetAngle - this.car.heading;
    while (steerError > Math.PI) steerError -= Math.PI * 2;
    while (steerError < -Math.PI) steerError += Math.PI * 2;

    const steerLeft = steerError > 0.04;
    const steerRight = steerError < -0.04;

    // Brake when entering a sharp corner at high speed
    const absSteerError = Math.abs(steerError);
    const shouldBrake = absSteerError > 0.30 && speed > 16;

    // Throttle based on rubber-band multiplier (suppress while braking)
    const throttle = !shouldBrake && (this.engineForceMultiplier >= 0.95 ||
      Math.random() < this.engineForceMultiplier);

    return {
      accelerate: throttle,
      brake: shouldBrake,
      steerLeft,
      steerRight,
      reset: false,
      handbrake: false
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
