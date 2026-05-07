# M4: Drift-Optimised Tracks + Elevation + Audio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `TrackConfig` so tracks are data-driven, redesign Neon Ridge for drift (wider, sweepier corners), add Canyon Run with -4m to +10m elevation using trimesh ground colliders, and synthesise engine + drift audio entirely via Web Audio API.

**Architecture:** `TrackPoint {x,y,z}` replaces `Vector2` in centerLines. `buildTrackSamples()` passes Y to `CatmullRomCurve3`. For elevated tracks, a Rapier `trimesh` collider built from the road ribbon mesh replaces the flat ground cuboid. Audio: a single `AudioEngine` manages `OscillatorNode` instances, called each frame with current speed and drift state.

**Tech Stack:** TypeScript, Three.js, Rapier (`ColliderDesc.trimesh`), Web Audio API

**Prerequisite:** M1 complete.

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/types.ts` |
| Create | `src/entities/tracks/neonRidge.ts` |
| Create | `src/entities/tracks/canyonRun.ts` |
| Modify | `src/entities/track.ts` |
| Modify | `src/physics/world.ts` |
| Create | `src/audio/audioEngine.ts` |
| Modify | `src/game.ts` |
| Modify | `src/style.css` |

---

## Task 1: Add TrackPoint type

**Files:** Modify `src/types.ts`

- [ ] **Append `TrackPoint` to `src/types.ts`**

```typescript
export interface Vector2 {
  readonly x: number;
  readonly z: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface TrackSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  readonly center: Vector2;
  readonly length: number;
  readonly angle: number;
  readonly normal: Vector2;
}

// Used for track centerLines — supports elevation via y
export interface TrackPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrackConfig {
  readonly name: string;
  readonly centerLine: readonly TrackPoint[];
  readonly roadWidth: number;
  readonly unlockCondition: "always" | "complete-track-1";
}
```

---

## Task 2: Neon Ridge track config

**Files:** Create `src/entities/tracks/neonRidge.ts`

Wider (34m), sweepier corners for drift. Flat (y=0). Three long sweeping arcs and one hairpin.

- [ ] **Create `src/entities/tracks/neonRidge.ts`**

```typescript
import type { TrackConfig } from "../../types";

export const neonRidgeConfig: TrackConfig = {
  name: "Neon Ridge",
  roadWidth: 34,
  unlockCondition: "always",
  centerLine: [
    { x:   0, y: 0, z:  72 },   // start/finish
    { x:  52, y: 0, z:  58 },   // long right sweep entry
    { x:  82, y: 0, z:  14 },   // sweep apex
    { x:  70, y: 0, z: -38 },   // fast right-hand kink
    { x:  18, y: 0, z: -76 },   // hairpin approach
    { x: -10, y: 0, z: -82 },   // hairpin apex (tight)
    { x: -48, y: 0, z: -62 },   // left sweep out of hairpin
    { x: -82, y: 0, z: -14 },   // long left arc
    { x: -68, y: 0, z:  40 },   // back straight entry
    { x: -22, y: 0, z:  68 },   // last long left-hand sweep
  ]
};
```

---

## Task 3: Canyon Run track config

**Files:** Create `src/entities/tracks/canyonRun.ts`

Mountain canyon, -4m to +10m elevation, drift-oriented sweeps at elevation transitions.

- [ ] **Create `src/entities/tracks/canyonRun.ts`**

```typescript
import type { TrackConfig } from "../../types";

export const canyonRunConfig: TrackConfig = {
  name: "Canyon Run",
  roadWidth: 30,
  unlockCondition: "complete-track-1",
  centerLine: [
    { x:   0, y:  0, z:  70 },   // start (flat)
    { x:  50, y:  2, z:  52 },   // right sweep, gentle rise
    { x:  78, y:  8, z:  10 },   // long uphill straight
    { x:  72, y: 10, z: -30 },   // mountain hairpin (highest point)
    { x:  38, y:  7, z: -58 },   // downhill right sweep
    { x:  -8, y:  2, z: -72 },   // valley approach (wide)
    { x: -50, y: -4, z: -55 },   // valley floor long left arc (lowest point)
    { x: -76, y: -1, z: -12 },   // valley exit left sweep
    { x: -68, y:  3, z:  28 },   // uphill return
    { x: -32, y:  1, z:  58 },   // final sweeping left-hander
    { x:  -8, y:  0, z:  70 },   // connect to start
  ]
};
```

---

## Task 4: Refactor createTrack to accept TrackConfig

**Files:** Modify `src/entities/track.ts`

This is the largest change in M4. `buildTrackSamples` gains a `y` component. `createTrack` accepts `TrackConfig`. The road ribbon vertices follow spline Y. All material setup is unchanged.

- [ ] **Update `buildTrackSamples` signature and `createTrack` signature**

In `src/entities/track.ts`, change:

```typescript
// OLD
export function createTrack(): TrackEntity { ... }
// the centerLine was hardcoded inside

// NEW — add import and accept config
import type { TrackConfig, TrackPoint, TrackSegment, Vector2 } from "../types";

export function createTrack(config: TrackConfig): TrackEntity {
  const group = new THREE.Group();
  group.name = "Track";

  const { centerLine, roadWidth } = config;
  const wallHeight = 2.9;
  const wallThickness = 1.25;
  const samples = buildTrackSamples(centerLine, 256);
  const segments = buildSegments(samples.map(s => s.point));
  // ... rest of mesh construction unchanged, using roadWidth from config
```

- [ ] **Update `buildTrackSamples` to use `TrackPoint` Y**

```typescript
interface TrackSample {
  readonly point: Vector2;      // x, z only — used for boundary/segment logic
  readonly point3: THREE.Vector3; // x, y, z — used for ribbon geometry
  readonly tangent: Vector2;
  readonly normal: Vector2;
  readonly angle: number;
}

function buildTrackSamples(centerLine: readonly TrackPoint[], count: number): TrackSample[] {
  const curve = new THREE.CatmullRomCurve3(
    centerLine.map(p => new THREE.Vector3(p.x, p.y, p.z)),
    true,
    "catmullrom",
    0.42
  );
  const samples: TrackSample[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const pt3 = curve.getPointAt(t);
    const tangent3 = curve.getTangentAt(t).normalize();
    const tangent: Vector2 = { x: tangent3.x, z: tangent3.z };
    const normal: Vector2 = { x: -tangent.z, z: tangent.x };
    samples.push({
      point: { x: pt3.x, z: pt3.z },
      point3: pt3,
      tangent,
      normal,
      angle: Math.atan2(tangent.z, tangent.x)
    });
  }
  return samples;
}
```

- [ ] **Update `createTrackRibbon` to use `point3.y` for vertex height**

```typescript
function createTrackRibbon(
  samples: readonly TrackSample[],
  innerOffset: number,
  outerOffset: number,
  yOffset: number,        // small offset above road surface
  material: THREE.Material
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const sample of samples) {
    const py = sample.point3.y + yOffset;
    vertices.push(
      sample.point.x + sample.normal.x * innerOffset, py, sample.point.z + sample.normal.z * innerOffset
    );
    vertices.push(
      sample.point.x + sample.normal.x * outerOffset, py, sample.point.z + sample.normal.z * outerOffset
    );
  }

  for (let i = 0; i < samples.length; i++) {
    const next = (i + 1) % samples.length;
    const a = i * 2, b = a + 1, c = next * 2, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
```

- [ ] **Update `TrackEntity` to expose ribbon geometry for physics collider**

Add `roadMesh: THREE.Mesh` to `TrackEntity` interface:

```typescript
export interface TrackEntity {
  readonly group: THREE.Group;
  readonly centerLine: readonly Vector2[];   // x,z only — for LapTracker
  readonly segments: readonly TrackSegment[];
  readonly roadWidth: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly roadMesh: THREE.Mesh;             // for trimesh collider
  readonly hasElevation: boolean;
}
```

In `createTrack()`, keep a reference to the road ribbon mesh and return it:

```typescript
const road = createTrackRibbon(samples, -roadWidth * 0.5, roadWidth * 0.5, 0.08, roadMaterial);
road.receiveShadow = true;
group.add(road);
// ...
const hasElevation = centerLine.some(p => Math.abs(p.y) > 0.1);
return { group, centerLine: centerLine.map(p => ({ x: p.x, z: p.z })), segments, roadWidth, wallHeight, wallThickness, roadMesh: road, hasElevation };
```

- [ ] **Update all other helper functions that used the old `TrackSample.point.x/z` for 3D positioning**

In `addDashedCenterLines`, `addCurbs`, `addCurveBarriers`, etc., replace:
- `sample.point.x` → `sample.point3.x`
- `sample.point.z` → `sample.point3.z`
- Hardcoded Y values like `0.23` → `sample.point3.y + 0.23`

This ensures decorative meshes follow the elevation.

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 5: Trimesh ground collider for elevated tracks

**Files:** Modify `src/physics/world.ts`

- [ ] **Add `createRoadSurfaceCollider` function**

```typescript
export function createRoadSurfaceCollider(world: RAPIER.World, roadMesh: THREE.Mesh): void {
  roadMesh.updateWorldMatrix(true, false);
  const geometry = roadMesh.geometry;
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const indexAttr = geometry.getIndex();
  if (!indexAttr) return;

  const vertices = new Float32Array(posAttr.array);
  const indices = new Uint32Array(indexAttr.array);

  const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
    .setFriction(0.85)
    .setRestitution(0.0);
  world.createCollider(desc);
}
```

- [ ] **Update `createPhysicsWorld` export — remove auto ground for elevated tracks**

The flat ground cuboid stays for Neon Ridge (flat). For Canyon Run, replace it with trimesh. This is controlled from `game.ts` based on `track.hasElevation`.

In `world.ts`, export `createGroundCollider` so it can be called conditionally:

```typescript
export function createGroundCollider(world: RAPIER.World): void {
  const desc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
    .setTranslation(0, -0.1, 0)
    .setFriction(0.8)
    .setRestitution(0.0);
  world.createCollider(desc);
}
```

Remove the `createGroundCollider(world)` call from inside `createPhysicsWorld()`. It's now called from `game.ts`.

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 6: Update game.ts for track selection and physics

**Files:** Modify `src/game.ts`

- [ ] **Add track selection and conditional collider setup**

```typescript
import { neonRidgeConfig } from "./entities/tracks/neonRidge";
import { canyonRunConfig } from "./entities/tracks/canyonRun";
import { createGroundCollider, createRoadSurfaceCollider } from "./physics/world";
import type { TrackConfig } from "./types";

// Track selection — read from localStorage, default to Neon Ridge
function getActiveTrackConfig(): TrackConfig {
  const hasCompletedTrack1 = localStorage.getItem("neon-ridge.leaderboard") !== null;
  const selected = localStorage.getItem("neon-ridge.selected-track");
  if (selected === "canyon-run" && hasCompletedTrack1) {
    return canyonRunConfig;
  }
  return neonRidgeConfig;
}
```

In `start()`, replace `createTrack()` with:

```typescript
const activeConfig = getActiveTrackConfig();
const track = createTrack(activeConfig);

if (track.hasElevation) {
  createRoadSurfaceCollider(physics.world, track.roadMesh);
} else {
  createGroundCollider(physics.world);
}
```

Also update `LapTracker` — it expects `readonly Vector2[]` for centerLine, which is now provided correctly since `TrackEntity.centerLine` was already mapped to `Vector2[]`.

---

## Task 7: Web Audio engine sounds

**Files:** Create `src/audio/audioEngine.ts`

- [ ] **Create `src/audio/audioEngine.ts`**

```typescript
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly engineOsc: OscillatorNode;
  private readonly engineGain: GainNode;
  private readonly tireOsc: OscillatorNode;
  private readonly tireGain: GainNode;
  private started = false;

  public constructor() {
    this.ctx = new AudioContext();

    // Engine: sawtooth oscillator, frequency tracks speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 80;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();

    // Tire noise: white noise approximated with a high-freq sawtooth
    this.tireOsc = this.ctx.createOscillator();
    this.tireOsc.type = "sawtooth";
    this.tireOsc.frequency.value = 800;
    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.value = 0;

    // Add bandpass filter to shape tire noise
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2200;
    filter.Q.value = 0.8;
    this.tireOsc.connect(filter);
    filter.connect(this.tireGain);
    this.tireGain.connect(this.ctx.destination);
    this.tireOsc.start();
  }

  public start(): void {
    if (!this.started && this.ctx.state === "suspended") {
      this.ctx.resume();
      this.started = true;
    }
  }

  public update(speedMetersPerSecond: number, isDrifting: boolean): void {
    const speed = Math.abs(speedMetersPerSecond);
    const t = this.ctx.currentTime;

    // Engine frequency: 80 Hz idle → 260 Hz at max speed
    const targetFreq = 80 + speed * 3.2;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);

    // Engine gain: 0 at rest, 0.08 at speed
    const targetGain = speed > 0.5 ? 0.08 : 0.0;
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.1);

    // Tire screech: ramp up when drifting
    const tireTarget = isDrifting ? 0.22 : 0.0;
    this.tireGain.gain.setTargetAtTime(tireTarget, t, isDrifting ? 0.04 : 0.25);
  }

  public playImpact(): void {
    // Short white-noise burst for wall collision
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  public playCheckpoint(): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
```

---

## Task 8: Wire audio into game.ts

**Files:** Modify `src/game.ts`

- [ ] **Add AudioEngine import and instantiation**

```typescript
import { AudioEngine } from "./audio/audioEngine";
```

After `const hud = new HudOverlay(this.root);`:

```typescript
const audio = new AudioEngine();
// Resume audio context on first user gesture
window.addEventListener("keydown", () => audio.start(), { once: true });
```

- [ ] **Call audio.update() each frame**

In the render loop, after `physics.step(deltaSeconds)`:

```typescript
audio.update(car.speedMetersPerSecond, car.isDrifting);
```

- [ ] **Play checkpoint sound on gate/lap events**

Inside `if (raceMoment?.type === "checkpoint")`:

```typescript
audio.playCheckpoint();
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 9: Build, verify, commit

- [ ] **Run dev server**

```bash
npm run dev
```

Checklist (Neon Ridge):
- Track is visibly wider (34m) with sweepier corners ✓
- Engine hum increases with speed ✓
- Tire screech on drift ✓
- Checkpoint ping on gate pass ✓

Checklist (Canyon Run — needs track 1 lap first to unlock):
- Start a lap on Neon Ridge, complete it
- Reload page — Canyon Run option appears (or set `localStorage.setItem("neon-ridge.selected-track","canyon-run")` in console)
- Track visibly climbs and descends ✓
- Car follows elevation naturally (suspension handles slope) ✓
- No falling-through-floor bugs ✓

**Trimesh tuning note:** If car clips through road on steep slopes, add a `setContactSkin(0.02)` call to the trimesh collider desc, or reduce maximum speed.

- [ ] **Commit**

```bash
git add src/types.ts src/entities/tracks/ src/entities/track.ts src/physics/world.ts src/audio/audioEngine.ts src/game.ts src/style.css
git commit -m "feat(m4): drift-optimised tracks with elevation and Web Audio synthesis

- TrackPoint {x,y,z} type enables elevation in centerLine data
- Neon Ridge redesigned: 34m wide, sweepier corners for drift lines
- Canyon Run: 11 points, -4m to +10m elevation, mountain hairpin
- Rapier trimesh collider for elevated track road surface
- AudioEngine: sawtooth engine hum, filtered tire screech, impact/checkpoint sounds"
```
