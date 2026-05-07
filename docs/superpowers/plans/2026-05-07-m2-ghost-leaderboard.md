# M2: Ghost Lap + Local Leaderboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the player's best lap as a ghost that replays on subsequent laps, and persist up to 10 best lap times in localStorage with a Tab-toggled HUD panel.

**Architecture:** `GhostRecorder` captures `{x, y, z, heading, t}` frames each tick, compressing every 3rd on lap completion. `GhostCar` reads frames from localStorage and lerp-interpolates a semi-transparent mesh. `Leaderboard` manages localStorage reads/writes. Both wired into the existing `game.ts` render loop alongside the existing car.

**Tech Stack:** TypeScript, Three.js (for ghost mesh), localStorage

**Prerequisite:** M1 complete (Rapier car provides `position: Vector2`, `heading`, `isDrifting`).

---

## File Map

| Action | File |
|--------|------|
| Create | `src/race/ghostRecorder.ts` |
| Create | `src/race/ghostCar.ts` |
| Create | `src/race/leaderboard.ts` |
| Modify | `src/hud/overlay.ts` |
| Modify | `src/game.ts` |

---

## Task 1: GhostRecorder

**Files:** Create `src/race/ghostRecorder.ts`

- [ ] **Create `src/race/ghostRecorder.ts`**

```typescript
export interface GhostFrame {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly t: number;
}

export class GhostRecorder {
  private frames: GhostFrame[] = [];
  private elapsed = 0;

  public record(x: number, y: number, z: number, heading: number, deltaSeconds: number): void {
    this.elapsed += Math.max(deltaSeconds, 0);
    this.frames.push({ x, y, z, heading, t: this.elapsed });
  }

  public finish(): readonly GhostFrame[] {
    // Keep every 3rd frame to reduce storage
    const compressed = this.frames.filter((_, i) => i % 3 === 0);
    this.frames = [];
    this.elapsed = 0;
    return compressed;
  }

  public reset(): void {
    this.frames = [];
    this.elapsed = 0;
  }
}
```

---

## Task 2: Leaderboard

**Files:** Create `src/race/leaderboard.ts`

- [ ] **Create `src/race/leaderboard.ts`**

```typescript
const LEADERBOARD_KEY = "neon-ridge.leaderboard";
const GHOST_KEY = "neon-ridge.ghost";
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  readonly lapTimeSeconds: number;
  readonly date: string;
}

export function saveGhostFrames(frames: readonly import("./ghostRecorder").GhostFrame[]): void {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(frames));
  } catch {
    // localStorage full — skip
  }
}

export function loadGhostFrames(): readonly import("./ghostRecorder").GhostFrame[] | null {
  try {
    const raw = localStorage.getItem(GHOST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLeaderboardEntry(lapTimeSeconds: number): void {
  const entries = loadLeaderboard();
  entries.push({ lapTimeSeconds, date: new Date().toLocaleDateString() });
  entries.sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));
  } catch {
    // skip
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
```

---

## Task 3: GhostCar

**Files:** Create `src/race/ghostCar.ts`

- [ ] **Create `src/race/ghostCar.ts`**

```typescript
import * as THREE from "three";
import type { GhostFrame } from "./ghostRecorder";

export class GhostCar {
  public readonly group: THREE.Group;
  private readonly frames: readonly GhostFrame[];
  private elapsed = 0;
  private active = false;

  public constructor(frames: readonly GhostFrame[]) {
    this.frames = frames;
    this.group = createGhostMesh();
    this.group.visible = false;
  }

  public start(): void {
    this.elapsed = 0;
    this.active = true;
    this.group.visible = true;
  }

  public stop(): void {
    this.active = false;
    this.group.visible = false;
  }

  public update(deltaSeconds: number): void {
    if (!this.active || this.frames.length < 2) return;
    this.elapsed += deltaSeconds;

    const last = this.frames[this.frames.length - 1];
    if (this.elapsed > last.t) {
      this.group.visible = false;
      return;
    }

    // Binary search for surrounding frames
    let lo = 0;
    let hi = this.frames.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t <= this.elapsed) lo = mid; else hi = mid;
    }

    const a = this.frames[lo];
    const b = this.frames[hi];
    const span = b.t - a.t;
    const alpha = span > 0.0001 ? (this.elapsed - a.t) / span : 0;

    const x = a.x + (b.x - a.x) * alpha;
    const y = a.y + (b.y - a.y) * alpha;
    const z = a.z + (b.z - a.z) * alpha;
    const heading = a.heading + angleDiff(b.heading, a.heading) * alpha;

    this.group.position.set(x, y - 0.72, z);
    this.group.rotation.y = heading;
    this.group.visible = true;
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function createGhostMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = "GhostCar";

  const mat = new THREE.MeshStandardMaterial({
    color: 0x3df4d6,
    emissive: 0x18bfa9,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
  });

  // Simplified body
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 5.5), mat);
  body.position.y = 0.8;
  group.add(body);

  // Four wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3df4d6, transparent: true, opacity: 0.28, depthWrite: false });
  const wheelGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.54, 12);
  for (const [x, y, z] of [[-1.88, 0.42, 1.62], [1.88, 0.42, 1.62], [-1.88, 0.42, -1.78], [1.88, 0.42, -1.78]] as [number, number, number][]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  return group;
}
```

---

## Task 4: Update HudOverlay — leaderboard panel

**Files:** Modify `src/hud/overlay.ts`

- [ ] **Add leaderboard panel to `HudOverlay`**

Add these imports at top of `src/hud/overlay.ts`:

```typescript
import { loadLeaderboard } from "../race/leaderboard";
```

Add `private leaderboardVisible = false;` and `private readonly leaderboardElement: HTMLDivElement;` as class fields.

In the constructor, after `root.appendChild(this.helpElement)`, add:

```typescript
this.leaderboardElement = document.createElement("div");
this.leaderboardElement.className = "leaderboard";
this.leaderboardElement.style.display = "none";
root.appendChild(this.leaderboardElement);

window.addEventListener("keydown", (e) => {
  if (e.code === "Tab") {
    e.preventDefault();
    this.leaderboardVisible = !this.leaderboardVisible;
    this.leaderboardElement.style.display = this.leaderboardVisible ? "block" : "none";
    if (this.leaderboardVisible) this.refreshLeaderboard();
  }
});
```

Add `refreshLeaderboard()` method:

```typescript
private refreshLeaderboard(): void {
  const entries = loadLeaderboard();
  if (entries.length === 0) {
    this.leaderboardElement.innerHTML = `<div class="leaderboard__title">BEST LAPS</div><div class="leaderboard__empty">No laps recorded yet</div>`;
    return;
  }
  const rows = entries
    .map((e, i) => `<div class="leaderboard__row"><span class="leaderboard__rank">${i + 1}</span><span class="leaderboard__time">${formatTime(e.lapTimeSeconds)}</span><span class="leaderboard__date">${e.date}</span></div>`)
    .join("");
  this.leaderboardElement.innerHTML = `<div class="leaderboard__title">BEST LAPS <span class="leaderboard__hint">[Tab]</span></div>${rows}`;
}
```

Add leaderboard CSS to `src/style.css`:

```css
.leaderboard {
  position: fixed;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  background: rgba(8, 14, 22, 0.88);
  border: 1px solid rgba(61, 244, 214, 0.35);
  border-radius: 8px;
  padding: 16px 20px;
  min-width: 220px;
  font-family: 'Courier New', monospace;
  color: #e8f4f0;
  z-index: 10;
  backdrop-filter: blur(6px);
}
.leaderboard__title { font-size: 11px; letter-spacing: 2px; color: #3df4d6; margin-bottom: 10px; text-transform: uppercase; }
.leaderboard__hint { color: #aaa; font-size: 10px; }
.leaderboard__row { display: flex; gap: 12px; margin-bottom: 6px; font-size: 13px; }
.leaderboard__rank { color: #3df4d6; width: 16px; }
.leaderboard__time { font-variant-numeric: tabular-nums; flex: 1; }
.leaderboard__date { color: #888; font-size: 11px; }
.leaderboard__empty { color: #666; font-size: 12px; }
```

---

## Task 5: Wire ghost and leaderboard into game.ts

**Files:** Modify `src/game.ts`

- [ ] **Add ghost/leaderboard imports**

```typescript
import { GhostRecorder } from "./race/ghostRecorder";
import { GhostCar } from "./race/ghostCar";
import { loadGhostFrames, saveGhostFrames, saveLeaderboardEntry } from "./race/leaderboard";
```

- [ ] **Add ghost setup before the render loop**

After `const lapTracker = new LapTracker(track.centerLine);`, add:

```typescript
const ghostRecorder = new GhostRecorder();
const savedFrames = loadGhostFrames();
const ghostCar = savedFrames ? new GhostCar(savedFrames) : null;
if (ghostCar) {
  rendererBundle.scene.add(ghostCar.group);
  ghostCar.start();
}
```

- [ ] **Record and save ghost inside the render loop**

In the render function, after `car.update(deltaSeconds, input.state)`:

```typescript
const t = this.rigidBody?.translation();  // access via car.group.position instead:
ghostRecorder.record(
  car.group.position.x,
  car.group.position.y + 0.72,
  car.group.position.z,
  car.heading,
  deltaSeconds
);
ghostCar?.update(deltaSeconds);
```

On lap completion (inside `if (raceMoment?.type === "lap")`):

```typescript
const frames = ghostRecorder.finish();
const lapTime = raceMoment.lapTimeSeconds;
saveLeaderboardEntry(lapTime);
if (raceMoment.bestLapTimeSeconds === lapTime) {
  // This is a new best lap — save ghost
  saveGhostFrames(frames);
}
ghostRecorder.reset();
ghostCar?.stop();
// Restart ghost from beginning
const newFrames = loadGhostFrames();
if (newFrames && ghostCar) {
  ghostCar.start();
}
```

On reset (inside `if (input.consumeReset())`), also add:

```typescript
ghostRecorder.reset();
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

---

## Task 6: Build check, visual verify, commit

- [ ] **Run dev server and verify**

```bash
npm run dev
```

Checklist:
- Complete a lap — ghost appears on next lap ✓
- Ghost is semi-transparent cyan ✓
- Ghost follows correct racing line ✓
- Tab shows leaderboard with lap times ✓
- Tab again hides leaderboard ✓
- Refresh page — ghost and leaderboard persist ✓

- [ ] **Commit**

```bash
git add src/race/ghostRecorder.ts src/race/ghostCar.ts src/race/leaderboard.ts src/hud/overlay.ts src/game.ts src/style.css
git commit -m "feat(m2): ghost lap replay and local leaderboard

- GhostRecorder captures frames each tick, compresses on lap finish
- GhostCar lerp-interpolates semi-transparent cyan mesh from saved frames
- Only best-lap ghost saved to localStorage
- Leaderboard stores up to 10 entries, Tab to show/hide"
```
