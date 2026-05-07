import * as THREE from "three";
import { DEFAULT_CAR_SPAWN_HEADING, DEFAULT_CAR_SPAWN_POSITION, createCar, tintCar } from "./entities/car";
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
import { loadGhostFrames, loadLeaderboard, saveGhostFrames, saveLeaderboardEntry } from "./race/leaderboard";
import { createCameraRig } from "./scene/camera";
import { createLights } from "./scene/lights";
import { createRenderer } from "./scene/renderer";
import { AudioEngine } from "./audio/audioEngine";
import type { TrackConfig } from "./types";

function getActiveTrackConfig(): TrackConfig {
  const hasCompletedTrack1 = loadLeaderboard(neonRidgeConfig.id).length > 0;
  const selected = localStorage.getItem("neon-ridge.selected-track");
  if (selected === "canyon-run" && hasCompletedTrack1) {
    return canyonRunConfig;
  }
  return neonRidgeConfig;
}

export class Game {
  private readonly root: HTMLElement;
  private readonly disposers: Array<() => void> = [];
  private animationFrameId: number | null = null;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public async start(): Promise<void> {
    const rendererBundle = createRenderer(this.root);
    const cameraRig = createCameraRig();
    const input = new KeyboardInput();
    const touchControls = new TouchControls(this.root, input.state);
    this.disposers.push(() => input.dispose(), () => touchControls.dispose());

    // K key opens / closes keymap settings panel
    let keymapOpen = false;
    let keymapPanel: KeymapPanel | null = null;
    const handleKeymapToggle = (e: KeyboardEvent): void => {
      if (e.code === "KeyK") {
        if (keymapOpen) return;
        keymapOpen = true;
        keymapPanel = new KeymapPanel(this.root, () => {
          input.reloadKeymap();
          keymapPanel = null;
          keymapOpen = false;
        });
      }
    };
    window.addEventListener("keydown", handleKeymapToggle);
    this.disposers.push(
      () => window.removeEventListener("keydown", handleKeymapToggle),
      () => keymapPanel?.dispose()
    );
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

    const gridSpawn = (backMeters: number, sideMeters: number): { position: { x: number; z: number }; heading: number } => {
      const h = DEFAULT_CAR_SPAWN_HEADING;
      return {
        position: {
          x: DEFAULT_CAR_SPAWN_POSITION.x - Math.sin(h) * backMeters + Math.cos(h) * sideMeters,
          z: DEFAULT_CAR_SPAWN_POSITION.z - Math.cos(h) * backMeters - Math.sin(h) * sideMeters
        },
        heading: h
      };
    };
    const aiCar1 = createCar(physics.world, gridSpawn(0, -8.2));
    const aiCar2 = createCar(physics.world, gridSpawn(0, 8.2));
    const ai1 = new AIDriver(aiCar1, track.centerLine);
    const ai2 = new AIDriver(aiCar2, track.centerLine);
    tintCar(aiCar1.group, 0xffaa00);  // gold
    tintCar(aiCar2.group, 0x00aaff);  // blue

    const hud = new HudOverlay(this.root, activeConfig.id);
    this.disposers.push(() => hud.dispose());
    hud.setTrack(track.splineCenterLine);
    const savedLeaderboard = loadLeaderboard(activeConfig.id);
    const lapTracker = new LapTracker(track.centerLine, 11, savedLeaderboard[0]?.lapTimeSeconds ?? null);
    const ai1Tracker = new LapTracker(track.centerLine);
    const ai2Tracker = new LapTracker(track.centerLine);

    let audio: AudioEngine | null = null;
    const startAudio = (): void => {
      audio ??= new AudioEngine();
      audio.start();
    };
    window.addEventListener("keydown", startAudio, { once: true });
    window.addEventListener("touchstart", startAudio, { once: true });
    this.disposers.push(
      () => window.removeEventListener("keydown", startAudio),
      () => window.removeEventListener("touchstart", startAudio),
      () => audio?.dispose()
    );

    const ghostRecorder = new GhostRecorder();
    const savedFrames = loadGhostFrames(activeConfig.id);
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
    let gateFlashIdx = -1;
    let gateFlashTimer = 0;

    type Spark = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number };
    const sparks: Spark[] = [];
    const emitSparks = (pos: THREE.Vector3, count: number): void => {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.035, 0.18),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(1, 0.65 + Math.random() * 0.35, Math.random() * 0.25),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
        rendererBundle.scene.add(mesh);
        sparks.push({ mesh, vx: (Math.random() - 0.5) * 14, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 14, life: 0, maxLife: 0.28 + Math.random() * 0.38 });
      }
    };

    // Countdown state: 3.0 → 0 → race start
    let preRaceTimer = 3.8;
    let lastCountPhase = 4;
    let raceStarted = false;
    const noInput = { accelerate: false, brake: false, steerLeft: false, steerRight: false, handbrake: false, reset: false };
    createTrackBoundaryColliders(physics.world, track.segments, track.roadWidth, track.wallHeight, track.wallThickness);

    rendererBundle.scene.add(ground, environment, track.group, car.group);
    rendererBundle.scene.add(aiCar1.group, aiCar2.group);
    rendererBundle.scene.add(cameraRig.camera);
    this.disposers.push(() => {
      disposeObject3D(rendererBundle.scene);
      rendererBundle.composer.dispose();
      rendererBundle.renderer.dispose();
      rendererBundle.renderer.domElement.remove();
    });

    // Track cycling with T key
    const handleTrackCycle = (e: KeyboardEvent): void => {
      if (e.key === "t" || e.key === "T") {
        const current = localStorage.getItem("neon-ridge.selected-track");
        if (current === "canyon-run") {
          localStorage.removeItem("neon-ridge.selected-track");
        } else {
          const hasCompletedTrack1 = loadLeaderboard(neonRidgeConfig.id).length > 0;
          if (hasCompletedTrack1) {
            localStorage.setItem("neon-ridge.selected-track", "canyon-run");
          } else {
            hud.flash("Complete Neon Ridge first to unlock Canyon Run", "yellow");
            return;
          }
        }
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleTrackCycle);
    this.disposers.push(() => window.removeEventListener("keydown", handleTrackCycle));

    const handleResize = (): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      rendererBundle.resize(width, height);
      cameraRig.resize(width, height);
    };

    window.addEventListener("resize", handleResize);
    this.disposers.push(() => window.removeEventListener("resize", handleResize));

    const render = (): void => {
      const deltaSeconds = clock.getDelta();

      // ── Countdown ───────────────────────────────────────────────────────
      if (!raceStarted) {
        preRaceTimer -= deltaSeconds;
        const phase = Math.ceil(preRaceTimer);
        if (phase !== lastCountPhase) {
          lastCountPhase = phase;
          if (phase === 3) { hud.flashBig("3"); audio?.playCountdownBeep(false); }
          else if (phase === 2) { hud.flashBig("2"); audio?.playCountdownBeep(false); }
          else if (phase === 1) { hud.flashBig("1"); audio?.playCountdownBeep(false); }
          else if (phase <= 0) { hud.flash("GO!", "cyan"); audio?.playCountdownBeep(true); raceStarted = true; ghostCar?.start(); }
        }
        // Engine spools up during countdown: idle at 3 → held at launch RPM by GO
        const revFraction = THREE.MathUtils.clamp(1 - preRaceTimer / 3.8, 0, 1);
        audio?.setCountdownRev(revFraction);
      }

      if (input.consumeReset()) {
        car.reset();
        aiCar1.reset();
        aiCar2.reset();
        ai1.reset();
        ai2.reset();
        lapTracker.resetCurrentLap();
        ai1Tracker.resetCurrentLap();
        ai2Tracker.resetCurrentLap();
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
      if (raceStarted) {
        ai1Tracker.update(aiCar1.position, deltaSeconds);
        ai2Tracker.update(aiCar2.position, deltaSeconds);
      }
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
      audio?.update(car.speedMetersPerSecond, car.isDrifting, input.state.accelerate, car.lateralSpeedMetersPerSecond, deltaSeconds, input.state.brake);

      // Impact detection: rapid speed drop → camera shake + impact sound + bloom spike
      const speedAbs = Math.abs(car.speedMetersPerSecond);
      const speedDrop = prevSpeedAbs - speedAbs;
      let targetBloom = car.isDrifting ? 0.88 : 0.54;
      if (speedDrop > 7 && prevSpeedAbs > 5) {
        cameraRig.addShake(Math.min(0.9, speedDrop * 0.065));
        audio?.playImpact();
        hud.flashImpact(Math.min(1, speedDrop * 0.08));
        emitSparks(car.group.position, 10 + Math.floor(speedDrop * 1.2));
        targetBloom = Math.min(1.5, 0.54 + speedDrop * 0.07);
      }
      prevSpeedAbs = speedAbs;

      const raceMoment = raceStarted ? lapTracker.update(car.position, deltaSeconds) : null;
      if (raceMoment?.type === "checkpoint") {
        hud.flash(`Gate ${raceMoment.checkpoint}/${raceMoment.checkpointTotal}`, "cyan");
        audio?.playCheckpoint();
        targetBloom = 1.1;
        gateFlashIdx = raceMoment.checkpoint - 1;
        gateFlashTimer = 0.55;
      } else if (raceMoment?.type === "lap") {
        const ls = raceMoment.lapTimeSeconds;
        const lapTimeStr = formatTime(ls);
        const isNewBest = raceMoment.bestLapTimeSeconds === ls;
        hud.flash(`${isNewBest ? "BEST LAP " : `LAP ${raceMoment.lap - 1}  `}${lapTimeStr}`, isNewBest ? "cyan" : "magenta");
        hud.flashVictory(isNewBest);
        cameraRig.addShake(isNewBest ? 0.35 : 0.18);
        audio?.playLapComplete();
        targetBloom = isNewBest ? 1.45 : 1.2;
        const frames = ghostRecorder.finish();
        const lapTime = raceMoment.lapTimeSeconds;
        saveLeaderboardEntry(activeConfig.id, lapTime);
        if (raceMoment.bestLapTimeSeconds === lapTime) {
          saveGhostFrames(activeConfig.id, frames);
        }
        ghostRecorder.reset();
        ghostCar?.stop();
        const newFrames = loadGhostFrames(activeConfig.id);
        if (newFrames) {
          if (ghostCar) rendererBundle.scene.remove(ghostCar.group);
          ghostCar = new GhostCar(newFrames);
          rendererBundle.scene.add(ghostCar.group);
          ghostCar.start();
        }
      }

      // Gate light flash: burst white on pass, fade back to cyan
      if (gateFlashIdx >= 0 && gateFlashIdx < track.gateLights.length) {
        gateFlashTimer -= deltaSeconds;
        const t = Math.max(0, gateFlashTimer / 0.55);
        const gl = track.gateLights[gateFlashIdx];
        gl.intensity = THREE.MathUtils.lerp(18, 120, t);
        gl.color.setHex(t > 0.5 ? 0xffffff : 0x3df4d6);
        if (gateFlashTimer <= 0) gateFlashIdx = -1;
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
      const gear = car.isReversing ? -1 : (Math.abs(car.speedMetersPerSecond) < 0.5 ? 0 : Math.min(4, Math.floor(Math.abs(car.speedMetersPerSecond) / 12.5) + 1));
      const lapSnapshot = lapTracker.getSnapshot();
      const playerScore = (lapSnapshot.lap - 1) * track.centerLine.length + lapSnapshot.checkpointProgress;
      const ai1Snap = ai1Tracker.getSnapshot();
      const ai2Snap = ai2Tracker.getSnapshot();
      const ai1Score = (ai1Snap.lap - 1) * track.centerLine.length + ai1Snap.checkpointProgress;
      const ai2Score = (ai2Snap.lap - 1) * track.centerLine.length + ai2Snap.checkpointProgress;
      const racePosition = raceStarted
        ? 1 + [ai1Score, ai2Score].filter(s => s > playerScore).length
        : 1;
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
      hud.updateMinimap(car.position, car.heading, [
        { pos: aiCar1.position, color: "rgba(255,170,0,0.85)" },
        { pos: aiCar2.position, color: "rgba(0,170,255,0.85)" }
      ], nextGatePos);
      // Spark particle update
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += deltaSeconds;
        s.vy -= 14 * deltaSeconds;
        s.mesh.position.x += s.vx * deltaSeconds;
        s.mesh.position.y += s.vy * deltaSeconds;
        s.mesh.position.z += s.vz * deltaSeconds;
        s.mesh.rotation.x += deltaSeconds * 9;
        s.mesh.rotation.z += deltaSeconds * 7;
        const t = s.life / s.maxLife;
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t * t;
        if (s.life >= s.maxLife) {
          rendererBundle.scene.remove(s.mesh);
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.MeshBasicMaterial).dispose();
          sparks.splice(i, 1);
        }
      }

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
    while (this.disposers.length > 0) {
      this.disposers.pop()?.();
    }
  }
}

function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function formatTime(totalSeconds: number): string {
  const totalMillis = Math.max(0, Math.round(totalSeconds * 1000));
  const minutes = Math.floor(totalMillis / 60000);
  const seconds = Math.floor(totalMillis / 1000) % 60;
  const millis = totalMillis % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
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
