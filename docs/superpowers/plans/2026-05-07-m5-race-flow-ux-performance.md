# M5: Race Flow, Track UX, Stability, and Performance Polish

> **For agentic workers:** Implement this plan task-by-task. Keep each task independently buildable, verify with `npm run build`, and run a browser smoke test after UI or gameplay-loop changes.

**Goal:** Turn the current feature-rich prototype into a cleaner playable loop by fixing race-state correctness, making track selection explicit, scoping persistence per track, improving AI starts, and reducing long-session runtime risk.

**Current baseline:** M1-M4 are mostly present: Rapier vehicle physics, drift visuals, ghost replay, leaderboard, two AI cars, two track configs, elevated road collider support, Web Audio, touch controls, key remapping, minimap, and GitHub Pages deployment. Before adding larger gameplay features, the next pass should stabilize state ownership and player-facing flow.

---

## Review Findings Driving M5

- Lap time currently advances even before the race has started because `LapTracker.update()` is called every frame outside the `raceStarted` guard.
- The start flow begins automatically after the countdown; audio unlock is gesture-based, but gameplay state is not explicitly tied to a start command.
- Leaderboard and ghost storage keys are global (`neon-ridge.leaderboard`, `neon-ridge.ghost`), so Canyon Run and Neon Ridge can overwrite or unlock each other's data.
- Track selection is hidden behind `T`, with no proper start menu or unlocked/locked track UI.
- AI cars are created with the same spawn transform as the player, creating avoidable overlap and first-second instability.
- Browser smoke works, but there is no repeatable automated smoke script or test harness.
- Long-running VFX now disposes smoke/spark particles, but broader scene/audio cleanup is still incomplete if `Game.dispose()` is ever used by HMR or app remounts.
- Production build emits a large chunk warning around the Three/Rapier bundle; not urgent, but worth tracking before adding more heavy features.

---

## Non-Goals

- No multiplayer.
- No backend or Supabase.
- No asset pipeline or imported 3D models.
- No major physics rewrite.
- No monetization, account, or cloud save system.

---

## File Map

| Area | Files |
|------|-------|
| Race state | `src/game.ts`, `src/race/lapTracker.ts` |
| Persistence | `src/race/leaderboard.ts`, `src/race/ghostRecorder.ts`, `src/race/ghostCar.ts` |
| Track UX | `src/game.ts`, `src/hud/overlay.ts`, `src/style.css`, `src/entities/tracks/*` |
| AI starts | `src/entities/car.ts`, `src/ai/aiDriver.ts`, `src/game.ts` |
| Cleanup | `src/game.ts`, `src/audio/audioEngine.ts`, `src/input/*`, `src/hud/*`, `src/scene/renderer.ts` |
| Verification | `package.json`, optional `scripts/smoke-playwright.*` |

---

## Task 1: Fix Race Timer and Countdown Ownership

- [ ] Gate `LapTracker.update()` behind `raceStarted`.
- [ ] Ensure `currentLapTimeSeconds` starts at `0` until `GO`.
- [ ] On reset, reset player/ghost/lap state and restart countdown cleanly.
- [ ] Decide whether AI should move during countdown. Preferred: AI cars stay staged until `GO`.
- [ ] Verify HUD current lap time remains `0:00.000` during countdown.

**Acceptance:**

- Fresh page load shows countdown and current lap time does not accumulate before `GO`.
- Reset returns to countdown and clears current lap attempt.
- Completing a lap records only actual race time, not pre-race waiting time.

---

## Task 2: Track-Scoped Leaderboard and Ghost Saves

- [ ] Add a stable track id to each `TrackConfig`, e.g. `id: "neon-ridge"` and `id: "canyon-run"`.
- [ ] Change persistence keys to include track id:
  - `neon-ridge.leaderboard.<trackId>`
  - `neon-ridge.ghost.<trackId>`
- [ ] Keep a migration path from old global keys for Neon Ridge only.
- [ ] Update `getActiveTrackConfig()` and unlock logic to check Neon Ridge completion using the Neon Ridge scoped key.
- [ ] Update HUD leaderboard to show data for the active track only.

**Acceptance:**

- Neon Ridge ghost does not appear on Canyon Run.
- Canyon Run best laps do not overwrite Neon Ridge best laps.
- Existing old localStorage data still unlocks Canyon Run where reasonable.

---

## Task 3: Add Explicit Start / Track Select Overlay

- [ ] Replace hidden `T` cycling as the primary flow with an overlay shown before the first race.
- [ ] Show available tracks, locked state, and best lap per track.
- [ ] Let player choose track before race starts.
- [ ] Keep `T` as a debug shortcut only if useful, or remove it from public help text.
- [ ] Add keyboard support: arrow keys or `A/D` to change track, `Enter` or `Space` to start.
- [ ] Make touch start usable on mobile.

**Acceptance:**

- First screen is the actual game scene with a compact start overlay, not a marketing page.
- Locked Canyon Run clearly shows the unlock condition.
- Selecting a track updates the active config without relying on manual localStorage edits.

---

## Task 4: Stagger Player and AI Spawn Positions

- [ ] Add a controlled spawn option to `createCar`, or add a `setSpawn()` / `resetTo()` method on `CarEntity`.
- [ ] Place player on the start line, AI 1 behind-left, AI 2 behind-right.
- [ ] Ensure all spawn positions align with the start segment heading.
- [ ] Reset should return every car to its own staged position.
- [ ] Avoid direct rigid-body mutation from `game.ts` if a car method can own it.

**Acceptance:**

- Player and AI do not overlap at load or reset.
- AI cars start cleanly after `GO`.
- Camera starts framed behind the player, not inside another car.

---

## Task 5: Stabilize AI Race Behavior

- [ ] Make rubber-band behavior deterministic enough for repeatable testing.
- [ ] Replace random throttle suppression with a smooth throttle scalar if `CarEntity` can expose an optional control parameter.
- [ ] Add basic stuck detection: if AI speed stays low for several seconds, reset AI to nearest sensible checkpoint or apply recovery steering.
- [ ] Tune braking for Canyon Run elevation and hairpins.

**Acceptance:**

- AI can complete repeated laps on Neon Ridge without permanently wedging into walls.
- AI remains visible competition but does not constantly ram the player at race start.
- Canyon Run AI does not fly off or stall at elevation transitions in normal runs.

---

## Task 6: Resource Cleanup and App Lifecycle

- [ ] Store event listener disposers in `Game` and call them from `dispose()`.
- [ ] Dispose `KeyboardInput`, `TouchControls`, `HudOverlay`, keymap panel listeners, renderer, composer passes, scene geometries/materials, and audio nodes where practical.
- [ ] Add `AudioEngine.dispose()` to stop oscillators/source nodes and close/suspend the context.
- [ ] Decide whether `main.ts` needs HMR cleanup via `import.meta.hot?.dispose()`.

**Acceptance:**

- Repeated HMR reloads or app remounts do not stack duplicate keyboard/touch/listener behavior.
- Calling `game.dispose()` cancels the animation frame and releases owned browser resources.

---

## Task 7: Browser Smoke Script

- [ ] Add an npm script, e.g. `npm run smoke`, that starts Vite and runs a minimal browser check.
- [ ] Verify page title, no console errors, visible HUD, and non-empty canvas.
- [ ] Include one interaction: press `W` and verify the race reaches `GO` without console errors.
- [ ] Keep screenshots under an ignored artifact path.

**Acceptance:**

- `npm run build` and `npm run smoke` are enough for a local pre-push confidence check.
- Smoke artifacts are ignored by git.

---

## Task 8: Bundle and Deployment Hygiene

- [ ] Keep GitHub Pages `base: "/race/"` verified.
- [ ] Decide whether to tolerate the current bundle warning for now, or split Rapier/Three dynamically after start overlay.
- [ ] Avoid committing `dist`; GitHub Actions builds it.
- [ ] Confirm `node_modules`, Playwright artifacts, and screenshots stay ignored.

**Acceptance:**

- `npm run build` passes.
- GitHub Pages deploy continues from `master` and `main`.
- No generated artifacts appear in `git status`.

---

## Suggested Execution Order

1. Task 1: race timer/countdown correctness.
2. Task 2: track-scoped persistence.
3. Task 4: staged AI/player spawns.
4. Task 3: start and track-select overlay.
5. Task 5: AI stability tuning.
6. Task 6: lifecycle cleanup.
7. Task 7: repeatable smoke script.
8. Task 8: bundle/deploy hygiene.

---

## Verification Checklist

- [ ] `npm run build`
- [ ] Browser smoke: fresh load, countdown, `GO`, accelerate, brake, handbrake, reset
- [ ] Leaderboard on Neon Ridge and Canyon Run saves separately
- [ ] Ghost replay appears only on the matching track
- [ ] AI cars start separated and keep driving
- [ ] Touch controls still work on coarse-pointer viewport
- [ ] No console errors after load, start, reset, track switch, and leaderboard toggle
- [ ] `git status --short` shows only intentional source/doc changes
