import * as THREE from "three";
import { createCar } from "./entities/car";
import { createEnvironment } from "./entities/environment";
import { createTrack, resolveTrackBoundary } from "./entities/track";
import { HudOverlay } from "./hud/overlay";
import { KeyboardInput } from "./input/keyboard";
import { createPhysicsWorld, createTrackBoundaryColliders } from "./physics/world";
import { LapTracker } from "./race/lapTracker";
import { createCameraRig } from "./scene/camera";
import { createLights } from "./scene/lights";
import { createRenderer } from "./scene/renderer";

export class Game {
  private readonly root: HTMLElement;
  private animationFrameId: number | null = null;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public async start(): Promise<void> {
    const rendererBundle = createRenderer(this.root);
    const cameraRig = createCameraRig();
    const input = new KeyboardInput();
    const physics = await createPhysicsWorld();
    createLights(rendererBundle.scene);

    const ground = createGround();
    const track = createTrack();
    const environment = createEnvironment();
    const car = createCar();
    const hud = new HudOverlay(this.root);
    const lapTracker = new LapTracker(track.centerLine);
    const clock = new THREE.Clock();
    createTrackBoundaryColliders(physics.world, track.segments, track.roadWidth, track.wallHeight, track.wallThickness);

    rendererBundle.scene.add(ground, environment, track.group, car.group);
    rendererBundle.scene.add(cameraRig.camera);

    const handleResize = (): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      rendererBundle.resize(width, height);
      cameraRig.resize(width, height);
    };

    window.addEventListener("resize", handleResize);

    const render = (): void => {
      const deltaSeconds = clock.getDelta();
      if (input.consumeReset()) {
        car.reset();
        lapTracker.resetCurrentLap();
      }
      car.update(deltaSeconds, input.state);
      const boundary = resolveTrackBoundary(car.position, track.segments, track.roadWidth);
      if (boundary.constrained) {
        car.constrainToTrack(boundary.position, boundary.speedMultiplier);
      }
      lapTracker.update(car.position, deltaSeconds);
      physics.step(deltaSeconds);
      cameraRig.update(car.group.position, car.heading, car.speedMetersPerSecond, deltaSeconds);
      const lapSnapshot = lapTracker.getSnapshot();
      hud.update({
        speedKph: Math.abs(car.speedMetersPerSecond) * 3.6,
        lap: lapSnapshot.lap,
        checkpoint: lapSnapshot.checkpointProgress,
        checkpointTotal: lapSnapshot.checkpointTotal,
        currentLapTimeSeconds: lapSnapshot.currentLapTimeSeconds,
        bestLapTimeSeconds: lapSnapshot.bestLapTimeSeconds,
        isOffTrack: boundary.constrained,
        speedRatio: THREE.MathUtils.clamp(Math.abs(car.speedMetersPerSecond) / 40, 0, 1)
      });
      rendererBundle.render(cameraRig.camera);
      this.animationFrameId = window.requestAnimationFrame(render);
    };

    handleResize();
    render();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

function createGround(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  const geometry = new THREE.PlaneGeometry(360, 360);
  const material = new THREE.MeshStandardMaterial({
    color: 0x24422f,
    roughness: 0.92,
    metalness: 0
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  return ground;
}
