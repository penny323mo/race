# 3D Racing Game MVP

A browser-based 3D racing game MVP built with Vite, TypeScript, Three.js, and Rapier.

The current MVP uses primitive geometry only. The car controller is deterministic and keyboard-driven, with Rapier available as the physics boundary for later rigid-body work.

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
