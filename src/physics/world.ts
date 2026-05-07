import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d";
import type { TrackSegment } from "../types";

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  step(deltaSeconds: number): void;
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await initRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  // Ground collider is now created conditionally from game.ts

  return {
    world,
    step(deltaSeconds: number): void {
      world.timestep = Math.min(deltaSeconds, 1 / 30);
      world.step();
    }
  };
}

export function createGroundCollider(world: RAPIER.World): void {
  const desc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
    .setTranslation(0, -0.1, 0)
    .setFriction(0.8)
    .setRestitution(0.0);
  world.createCollider(desc);
}

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

async function initRapier(): Promise<void> {
  await Promise.resolve();
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
  const desc = RAPIER.ColliderDesc.cuboid((segment.length + 0.4) * 0.5, wallHeight * 0.5, wallThickness * 0.5)
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
    })
    .setFriction(0.12)
    .setRestitution(0.02);
  world.createCollider(desc);
}
