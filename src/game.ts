import * as THREE from "three";
import { createCar, tintCar } from "./entities/car";
import { AIDriver } from "./ai/aiDriver";
import { createEnvironment } from "./entities/environment";
import { createTrack } from "./entities/track";
import { neonRidgeConfig } from "./entities/tracks/neonRidge";
import { canyonRunConfig } from "./entities/tracks/canyonRun";
import { HudOverlay } from "./hud/overlay";
import { KeyboardInput } from "./input/keyboard";
import { createPhysicsWorld, createGroundCollider, createRoadSurfaceCollider, createTrackBoundaryColliders } from "./physics/world";
import { LapTracker } from "./race/lapTracker";
import { GhostRecorder } from "./race/ghostRecorder";
import { GhostCar } from "./race/ghostCar";
import { loadGhostFrames, saveGhostFrames, saveLeaderboardEntry } from "./race/leaderboard";
import { createCameraRig } from "./scene/camera";
import { createLights } from "./scene/lights";
import { createRenderer } from "./scene/renderer";
import { AudioEngine } from "./audio/audioEngine";
import type { TrackConfig } from "./types";

function getActiveTrackConfig(): TrackConfig {
  const hasCompletedTrack1 = localStorage.getItem("neon-ridge.leaderboard") !== null;
  const selected = localStorage.getItem("neon-ridge.selected-track");
  if (selected === "canyon-run" && hasCompletedTrack1) {
    return canyonRunConfig;
  }
  return neonRidgeConfig;
}

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

    const activeConfig = getActiveTrackConfig();
    const ground = createGround();
    const track = createTrack(activeConfig);
    const environment = createEnvironment();
    const car = createCar(physics.world);

    // Set up ground collider — flat cuboid for flat tracks, trimesh for elevated
    if (track.hasElevation) {
      createRoadSurfaceCollider(physics.world, track.roadMesh);
    } else {
      createGroundCollider(physics.world);
    }

    const aiCar1 = createCar(physics.world);
    const aiCar2 = createCar(physics.world);
    const ai1 = new AIDriver(aiCar1, track.centerLine);
    const ai2 = new AIDriver(aiCar2, track.centerLine);
    tintCar(aiCar1.group, 0xffaa00);  // gold
    tintCar(aiCar2.group, 0x00aaff);  // blue

    const hud = new HudOverlay(this.root);
    const lapTracker = new LapTracker(track.centerLine);

    const audio = new AudioEngine();
    // Resume audio context on first user gesture
    window.addEventListener("keydown", () => { audio.start(); }, { once: true });

    const ghostRecorder = new GhostRecorder();
    const savedFrames = loadGhostFrames();
    const ghostCar = savedFrames ? new GhostCar(savedFrames) : null;
    if (ghostCar) {
      rendererBundle.scene.add(ghostCar.group);
      ghostCar.start();
    }

    const clock = new THREE.Clock();
    let wasDrifting = false;
    createTrackBoundaryColliders(physics.world, track.segments, track.roadWidth, track.wallHeight, track.wallThickness);

    rendererBundle.scene.add(ground, environment, track.group, car.group);
    rendererBundle.scene.add(aiCar1.group, aiCar2.group);
    rendererBundle.scene.add(cameraRig.camera);

    // Track cycling with T key
    window.addEventListener("keydown", (e) => {
      if (e.key === "t" || e.key === "T") {
        const current = localStorage.getItem("neon-ridge.selected-track");
        if (current === "canyon-run") {
          localStorage.removeItem("neon-ridge.selected-track");
        } else {
          const hasCompletedTrack1 = localStorage.getItem("neon-ridge.leaderboard") !== null;
          if (hasCompletedTrack1) {
            localStorage.setItem("neon-ridge.selected-track", "canyon-run");
          } else {
            hud.flash("Complete Neon Ridge first to unlock Canyon Run", "yellow");
            return;
          }
        }
        window.location.reload();
      }
    });

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
        ghostRecorder.reset();
        hud.flash("Reset to start", "yellow");
      }
      car.update(deltaSeconds, input.state);
      ai1.update(deltaSeconds, car.position);
      ai2.update(deltaSeconds, car.position);
      ghostRecorder.record(
        car.group.position.x,
        car.group.position.y,
        car.group.position.z,
        car.heading,
        deltaSeconds
      );
      ghostCar?.update(deltaSeconds);
      physics.step(deltaSeconds);
      audio.update(car.speedMetersPerSecond, car.isDrifting);

      const raceMoment = lapTracker.update(car.position, deltaSeconds);
      if (raceMoment?.type === "checkpoint") {
        hud.flash(`Gate ${raceMoment.checkpoint}/${raceMoment.checkpointTotal}`, "cyan");
        audio.playCheckpoint();
      } else if (raceMoment?.type === "lap") {
        hud.flash(`Lap ${raceMoment.lap - 1} complete`, "magenta");
        audio.playLapComplete();
        const frames = ghostRecorder.finish();
        const lapTime = raceMoment.lapTimeSeconds;
        saveLeaderboardEntry(lapTime);
        if (raceMoment.bestLapTimeSeconds === lapTime) {
          saveGhostFrames(frames);
        }
        ghostRecorder.reset();
        ghostCar?.stop();
        const newFrames = loadGhostFrames();
        if (newFrames && ghostCar) {
          ghostCar.start();
        }
      }

      if (car.isDrifting && !wasDrifting && !raceMoment) {
        hud.flash("DRIFT!", "yellow");
      }
      wasDrifting = car.isDrifting;

      cameraRig.update(car.group.position, car.heading, car.speedMetersPerSecond, deltaSeconds);
      const lapSnapshot = lapTracker.getSnapshot();
      hud.update({
        speedKph: Math.abs(car.speedMetersPerSecond) * 3.6,
        lap: lapSnapshot.lap,
        checkpoint: lapSnapshot.checkpointProgress,
        checkpointTotal: lapSnapshot.checkpointTotal,
        currentLapTimeSeconds: lapSnapshot.currentLapTimeSeconds,
        bestLapTimeSeconds: lapSnapshot.bestLapTimeSeconds,
        isOffTrack: false,
        speedRatio: THREE.MathUtils.clamp(Math.abs(car.speedMetersPerSecond) / 46, 0, 1),
        trackName: activeConfig.name
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
