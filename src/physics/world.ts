import RAPIER from "@dimforge/rapier3d-compat";

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  step(deltaSeconds: number): void;
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  return {
    world,
    step(deltaSeconds: number): void {
      world.timestep = Math.min(deltaSeconds, 1 / 30);
      world.step();
    }
  };
}
