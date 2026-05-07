import RAPIER from "@dimforge/rapier3d-compat";
import type { TrackSegment } from "../types";

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  step(deltaSeconds: number): void;
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await initRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  return {
    world,
    step(deltaSeconds: number): void {
      world.timestep = Math.min(deltaSeconds, 1 / 30);
      world.step();
    }
  };
}

async function initRapier(): Promise<void> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]): void => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("using deprecated parameters for the initialization function")
    ) {
      return;
    }

    originalWarn(...args);
  };

  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
}

export function createTrackBoundaryColliders(
  world: RAPIER.World,
  segments: readonly TrackSegment[],
  roadWidth: number,
  wallHeight: number,
  wallThickness: number
): void {
  for (const segment of segments) {
    createWallCollider(world, segment, roadWidth * 0.5 + wallThickness * 0.5, wallHeight, wallThickness);
    createWallCollider(world, segment, -(roadWidth * 0.5 + wallThickness * 0.5), wallHeight, wallThickness);
  }
}

function createWallCollider(
  world: RAPIER.World,
  segment: TrackSegment,
  sideOffset: number,
  wallHeight: number,
  wallThickness: number
): void {
  const rotationHalfAngle = segment.angle * 0.5;
  const desc = RAPIER.ColliderDesc.cuboid((segment.length + 14) * 0.5, wallHeight * 0.5, wallThickness * 0.5)
    .setTranslation(
      segment.center.x + segment.normal.x * sideOffset,
      wallHeight * 0.5,
      segment.center.z + segment.normal.z * sideOffset
    )
    .setRotation({
      x: 0,
      y: Math.sin(rotationHalfAngle),
      z: 0,
      w: Math.cos(rotationHalfAngle)
    });
  world.createCollider(desc);
}
