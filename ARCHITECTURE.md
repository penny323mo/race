# Architecture

The game is organized around explicit subsystems:

- `src/game.ts`: application composition and game loop ownership.
- `src/scene`: Three.js renderer, camera, and lighting setup.
- `src/entities`: primitive geometry for the car and track.
- `src/input`: keyboard input state.
- `src/physics`: Rapier initialization and physics stepping boundary.
- `src/hud`: DOM-based racing HUD.

Simulation state remains separate from Three.js mesh objects so gameplay logic can evolve without making the render graph the source of truth.

The track is currently represented as a closed sequence of deterministic centerline segments. Rendering uses primitive box geometry for road pieces, shoulders, and later walls so the MVP remains asset-free and easy to debug.

Rapier is initialized at startup and receives static wall colliders that mirror the visible track boundaries. The MVP car uses a deterministic kinematic controller with a geometric boundary resolver instead of a dynamic raycast vehicle. This keeps input, reset, and lap behavior predictable while preserving a clean Rapier integration point for future rigid-body vehicle work.
