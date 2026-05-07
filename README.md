# 3D Racing Game MVP

A browser-based 3D racing game MVP built with Vite, TypeScript, Three.js, and Rapier.

The MVP uses primitive geometry only. The car controller is deterministic and keyboard-driven, with Rapier initialized for static track wall colliders and a geometric boundary assist keeping play stable.

## Gameplay

Drive through the green checkpoint gates in order. After all checkpoint gates are cleared, cross the checkered start/finish line to complete the lap. The HUD shows speed, current lap, checkpoint progress, current lap time, and best lap time.

## Requirements

- Node.js 20 or newer
- npm

## Commands

```bash
npm install
npm run build
npm run dev
```

Open `http://localhost:5173` after starting the dev server.

## Controls

- `W` or `ArrowUp`: accelerate
- `S` or `ArrowDown`: brake or reverse
- `A` or `ArrowLeft`: steer left
- `D` or `ArrowRight`: steer right
- `R`: reset car
