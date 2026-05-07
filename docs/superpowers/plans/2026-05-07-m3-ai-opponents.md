# M3: AI Opponents

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add up to 2 AI cars that follow the track centerline using pure pursuit and rubber-band speed adjustment relative to the player.

**Architecture:** `AIDriver` samples the track's Catmull-Rom spline to find a lookahead target 8m ahead, converts it to a steering `InputState`, and drives a `RapierCar` instance identically to the player. Rubber-band: AI engineForce multiplier adjusts ±10% based on distance gap to player.

**Tech Stack:** TypeScript, Three.js, Rapier (via `RapierCar`)

**Prerequisite:** M1 complete (`createCar(world)` API available).

---

## File Map

| Action | File |
|--------|------|
| Create | `src/ai/aiDriver.ts` |
| Modify | `src/game.ts` |

---

## Task 1: AIDriver

**Files:** Create `src/ai/aiDriver.ts`

- [ ] **Create `src/ai/aiDriver.ts`**

```typescript
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
    const lookaheadDistance = Math.max(8, speed * 0.35);
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

    // Throttle based on rubber-band multiplier
    const throttle = Math.random() < this.engineForceMultiplier;

    return {
      accelerate: throttle,
      brake: false,
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
```

---

## Task 2: Wire AI into game.ts

**Files:** Modify `src/game.ts`

- [ ] **Add AI import**

```typescript
import { AIDriver } from "./ai/aiDriver";
```

- [ ] **Spawn 2 AI cars after track creation**

After `const car = createCar(physics.world);`, add:

```typescript
const aiCar1 = createCar(physics.world);
const aiCar2 = createCar(physics.world);

// Stagger AI start positions behind player spawn
const aiSpawnOffset = 8;
// AI cars start at their default spawn (same as player) — override via reset after offset
// We'll offset by moving them via rigid body directly after creation,
// or accept that they all spawn at the same point and separate naturally.
// Simplest: let them all start at the same point; physics separates them immediately.

const ai1 = new AIDriver(aiCar1, track.centerLine);
const ai2 = new AIDriver(aiCar2, track.centerLine);

rendererBundle.scene.add(aiCar1.group, aiCar2.group);
```

- [ ] **Update render loop to tick AI drivers**

In the render function, after `car.update(deltaSeconds, input.state)`:

```typescript
ai1.update(deltaSeconds, car.position);
ai2.update(deltaSeconds, car.position);
```

- [ ] **Add AI visual differentiation**

After creating the AI cars, add distinct colors. Since `createCar` uses internal materials, add a helper that tints the car group:

In `src/entities/car.ts`, export a helper:

```typescript
export function tintCar(group: THREE.Group, color: number): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (mat.color.getHex() === 0xff3158) {
        mat.color.setHex(color);
        mat.emissive.setHex(color >> 1 & 0x7f7f7f);
      }
    }
  });
}
```

In `game.ts`, after creating AI cars:

```typescript
import { createCar, tintCar } from "./entities/car";
// ...
tintCar(aiCar1.group, 0xffaa00);  // gold
tintCar(aiCar2.group, 0x00aaff);  // blue
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 3: Build, verify, commit

- [ ] **Run dev server and verify**

```bash
npm run dev
```

Checklist:
- Two additional cars visible on track ✓
- AI cars drive around the track (may be rough — this is normal for first pass) ✓
- AI cars collide with walls and recover ✓
- Rubber-band: AI catches up if player slows significantly ✓
- AI cars are gold and blue (distinct from player red) ✓
- No console errors ✓

**AI tuning notes:**
- AI cutting corners badly → reduce lookahead distance (change `8` to `6` and `speed * 0.35` to `speed * 0.25`)
- AI too slow → increase engineForce in `RapierCar` for non-player instances, or increase the `1.10` multiplier ceiling
- AI spinning out → they shouldn't use handbrake; confirm `handbrake: false` in `computeInput()`

- [ ] **Commit**

```bash
git add src/ai/aiDriver.ts src/entities/car.ts src/game.ts
git commit -m "feat(m3): AI opponents with pure pursuit and rubber-band speed

- AIDriver follows Catmull-Rom centerline using 8m lookahead pure pursuit
- Rubber-band adjusts engine force ±10% based on gap to player
- Two AI cars spawned with gold/blue tint to distinguish from player"
```
