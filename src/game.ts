import * as THREE from "three";
import { createCar, tintCar } from "./entities/car";
import { AIDriver } from "./ai/aiDriver";
import { createEnvironment } from "./entities/environment";
import { createTrack } from "./entities/track";
import { neonRidgeConfig } from "./entities/tracks/neonRidge";
import { canyonRunConfig } from "./entities/tracks/canyonRun";
import { HudOverlay } from "./hud/overlay";
import { KeyboardInput } from "./input/keyboard";
import { TouchControls } from "./input/touch";
import { KeymapPanel } from "./hud/keymapPanel";
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
    new TouchControls(this.root, input.state);

    // K key opens / closes keymap settings panel
    let keymapOpen = false;
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyK") {
        if (keymapOpen) return;
        keymapOpen = true;
        new KeymapPanel(this.root, () => {
          input.reloadKeymap();
          keymapOpen = false;
        });
      }
    });
    const physics = await createPhysicsWorld();
    createLights(rendererBundle.scene);
    rendererBundle.scene.fog = new THREE.FogExp2(0x06080f, 0.0044);

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
    hud.setTrack(track.splineCenterLine);
    const lapTracker = new LapTracker(track.centerLine);
    const ai1Tracker = new LapTracker(track.centerLine);
    const ai2Tracker = new LapTracker(track.centerLine);

    const audio = new AudioEngine();
    const startAudio = (): void => { audio.start(); };
    window.addEventListener("keydown", startAudio, { once: true });
    window.addEventListener("touchstart", startAudio, { once: true });

    const ghostRecorder = new GhostRecorder();
    const savedFrames = loadGhostFrames();
    let ghostCar = savedFrames ? new GhostCar(savedFrames) : null;
    if (ghostCar) {
      rendererBundle.scene.add(ghostCar.group);
      // Ghost starts when GO fires, not during the countdown
    }

    const clock = new THREE.Clock();
    let wasDrifting = false;
    let driftFlashCooldown = 0;
    let prevSpeedAbs = 0;
    let currentBloom = 0.54;

    // Countdown state: 3.0 → 0 → race start
    let preRaceTimer = 3.8;
    let lastCountPhase = 4;
    let raceStarted = false;
    const noInput = { accelerate: false, brake: false, steerLeft: false, steerRight: false, handbrake: false, reset: false };
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

      // ── Countdown ───────────────────────────────────────────────────────
      if (!raceStarted) {
        preRaceTimer -= deltaSeconds;
        const phase = Math.ceil(preRaceTimer);
        if (phase !== lastCountPhase) {
          lastCountPhase = phase;
          if (phase === 3) { hud.flashBig("3"); audio.playCountdownBeep(false); }
          else if (phase === 2) { hud.flashBig("2"); audio.playCountdownBeep(false); }
          else if (phase === 1) { hud.flashBig("1"); audio.playCountdownBeep(false); }
          else if (phase <= 0) { hud.flash("GO!", "cyan"); audio.playCountdownBeep(true); raceStarted = true; ghostCar?.start(); }
        }
      }

      if (input.consumeReset()) {
        car.reset();
        lapTracker.resetCurrentLap();
        ghostRecorder.reset();
        ghostCar?.stop();
        preRaceTimer = 3.8;
        lastCountPhase = 4;
        raceStarted = false;
        hud.flash("Reset to start", "yellow");
      }
      car.update(deltaSeconds, raceStarted ? input.state : noInput);
      if (raceStarted) {
        ai1.update(deltaSeconds, car.position);
        ai2.update(deltaSeconds, car.position);
      } else {
        aiCar1.update(deltaSeconds, noInput);
        aiCar2.update(deltaSeconds, noInput);
      }
      ai1Tracker.update(aiCar1.position, deltaSeconds);
      ai2Tracker.update(aiCar2.position, deltaSeconds);
      if (raceStarted) {
        ghostRecorder.record(
          car.group.position.x,
          car.group.position.y,
          car.group.position.z,
          car.heading,
          deltaSeconds
        );
      }
      ghostCar?.update(deltaSeconds);
      physics.step(deltaSeconds);
      audio.update(car.speedMetersPerSecond, car.isDrifting, input.state.accelerate, car.lateralSpeedMetersPerSecond, deltaSeconds);

      // Impact detection: rapid speed drop → camera shake + impact sound + bloom spike
      const speedAbs = Math.abs(car.speedMetersPerSecond);
      const speedDrop = prevSpeedAbs - speedAbs;
      let targetBloom = car.isDrifting ? 0.88 : 0.54;
      if (speedDrop > 7 && prevSpeedAbs > 5) {
        cameraRig.addShake(Math.min(0.9, speedDrop * 0.065));
        audio.playImpact();
        targetBloom = Math.min(1.5, 0.54 + speedDrop * 0.07);
      }
      prevSpeedAbs = speedAbs;

      const raceMoment = lapTracker.update(car.position, deltaSeconds);
      if (raceMoment?.type === "checkpoint") {
        hud.flash(`Gate ${raceMoment.checkpoint}/${raceMoment.checkpointTotal}`, "cyan");
        audio.playCheckpoint();
        targetBloom = 1.1;
      } else if (raceMoment?.type === "lap") {
        const ls = raceMoment.lapTimeSeconds;
        const lapTimeStr = `${Math.floor(ls / 60)}:${Math.floor(ls % 60).toString().padStart(2, "0")}.${Math.floor((ls % 1) * 1000).toString().padStart(3, "0")}`;
        const isNewBest = raceMoment.bestLapTimeSeconds === ls;
        hud.flash(`${isNewBest ? "BEST LAP " : `LAP ${raceMoment.lap - 1}  `}${lapTimeStr}`, isNewBest ? "cyan" : "magenta");
        audio.playLapComplete();
        targetBloom = isNewBest ? 1.45 : 1.2;
        const frames = ghostRecorder.finish();
        const lapTime = raceMoment.lapTimeSeconds;
        saveLeaderboardEntry(lapTime);
        if (raceMoment.bestLapTimeSeconds === lapTime) {
          saveGhostFrames(frames);
        }
        ghostRecorder.reset();
        ghostCar?.stop();
        const newFrames = loadGhostFrames();
        if (newFrames) {
          if (ghostCar) rendererBundle.scene.remove(ghostCar.group);
          ghostCar = new GhostCar(newFrames);
          rendererBundle.scene.add(ghostCar.group);
          ghostCar.start();
        }
      }

      currentBloom = THREE.MathUtils.lerp(currentBloom, targetBloom, 1 - Math.exp(-deltaSeconds * 6));
      rendererBundle.setBloomStrength(currentBloom);

      driftFlashCooldown = Math.max(0, driftFlashCooldown - deltaSeconds);
      if (car.isDrifting && !wasDrifting && !raceMoment && driftFlashCooldown <= 0) {
        hud.flash("DRIFT!", "yellow");
        driftFlashCooldown = 3.0;
      }
      wasDrifting = car.isDrifting;

      cameraRig.update(car.group.position, car.heading, car.speedMetersPerSecond, car.isDrifting, deltaSeconds);
      const gear = car.isReversing ? -1 : Math.min(4, Math.floor(Math.abs(car.speedMetersPerSecond) / 12.5) + 1);
      const lapSnapshot = lapTracker.getSnapshot();
      const playerScore = (lapSnapshot.lap - 1) * track.centerLine.length + lapSnapshot.checkpointProgress;
      const ai1Snap = ai1Tracker.getSnapshot();
      const ai2Snap = ai2Tracker.getSnapshot();
      const ai1Score = (ai1Snap.lap - 1) * track.centerLine.length + ai1Snap.checkpointProgress;
      const ai2Score = (ai2Snap.lap - 1) * track.centerLine.length + ai2Snap.checkpointProgress;
      const racePosition = 1 + [ai1Score, ai2Score].filter(s => s > playerScore).length;
      hud.update({
        speedKph: Math.abs(car.speedMetersPerSecond) * 3.6,
        gear,
        position: racePosition,
        lap: lapSnapshot.lap,
        checkpoint: lapSnapshot.checkpointProgress,
        checkpointTotal: lapSnapshot.checkpointTotal,
        currentLapTimeSeconds: lapSnapshot.currentLapTimeSeconds,
        bestLapTimeSeconds: lapSnapshot.bestLapTimeSeconds,
        isOffTrack: false,
        speedRatio: THREE.MathUtils.clamp(Math.abs(car.speedMetersPerSecond) / 46, 0, 1),
        trackName: activeConfig.name
      });
      const nextGateIdx = lapSnapshot.checkpointProgress < lapSnapshot.checkpointTotal - 1
        ? lapSnapshot.checkpointProgress + 1
        : 0;
      const nextGatePos = track.centerLine[nextGateIdx] ?? null;
      hud.updateMinimap(car.position, car.heading, [aiCar1.position, aiCar2.position], nextGatePos);
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
    color: 0x111a0f,
    roughness: 0.94,
    metalness: 0
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  return ground;
}
