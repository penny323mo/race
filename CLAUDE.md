# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server at http://localhost:5173
npm run build        # type-check (tsc --noEmit) then bundle with Vite
npm run preview      # serve the dist/ build locally
```

There is no test suite. Verification is done visually in the browser.

## Architecture

**Entry point:** `src/main.ts` instantiates `Game` and calls `game.start()`.

**Game loop (`src/game.ts`):** The `Game` class is the composition root. `start()` constructs all subsystems in order (renderer → camera → input → physics → track → car → HUD → lap tracker), wires them together, then runs a `requestAnimationFrame` loop. Each frame: consume input → update car kinematics → resolve track boundary → advance lap tracker → step physics → update camera → render.

**Two track representations run in parallel:**
- `buildTrackSamples()` — 256-point Catmull-Rom spline used for all visual ribbon geometry (road surface, curbs, barriers, markings).
- `buildSegments()` — straight-segment polygon from the 8 raw centerline points, used exclusively by `resolveTrackBoundary()` for boundary collision math.

Both are built from the same `centerLine: Vector2[]` constant in `createTrack()`.

**Car physics is geometric, not Rapier-driven.** `PrimitiveCar.update()` integrates speed and heading directly. `resolveTrackBoundary()` in `src/entities/track.ts` projects the car position onto the nearest segment and pushes it back within `driveableHalfWidth`. Rapier (`src/physics/world.ts`) holds only static wall box colliders — it is stepped each frame but does not currently control the car.

**Lap tracking (`src/race/lapTracker.ts`):** Checkpoints are the 8 centerline points. Index 0 is start/finish; indices 1–7 are gates. `nextCheckpointIndex` advances sequentially; crossing index 0 is only valid after all gates are cleared.

**Rendering (`src/scene/renderer.ts`):** Three.js `EffectComposer` pipeline: `RenderPass → UnrealBloomPass → OutputPass`. Bloom gives neon emissive materials their glow. The render camera is swapped in each frame via `renderPass.camera = camera`.

**HUD (`src/hud/overlay.ts`):** Pure DOM, appended as a child of the root element alongside the canvas. Kept in DOM (not WebGL) so text stays crisp.

**Coordinate system:** Y-up. The track lies in the XZ plane. `Vector2` throughout the codebase means `{x, z}` — no Y component.
