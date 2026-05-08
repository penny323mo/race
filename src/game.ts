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
import { JumpPadSystem } from "./entities/jumpPads";
import type { GameOptions } from "./ui/mainMenu";
import { TRACK_SELECTION_KEY, resolveTrackConfig, writeSelectedTrackId } from "./entities/tracks/registry";

export class Game {
  private readonly root: HTMLElement;
  private readonly disposers: Array<() => void> = [];
  private animationFrameId: number | null = null;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public async start(options: GameOptions = { mode: "ai-battle", soundEnabled: true, trackId: null }): Promise<void> {
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
    rendererBundle.scene.fog = new THREE.FogExp2(0x06080f, 0.0038);

    const activeConfig = resolveTrackConfig(options.trackId);
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

    const soloMode = options.mode === "solo";
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
    const aiCar1 = createCar(physics.world, gridSpawn(5, -3.6));
    const aiCar2 = createCar(physics.world, gridSpawn(10, 3.6));
    const ai1 = new AIDriver(aiCar1, track.centerLine);
    const ai2 = new AIDriver(aiCar2, track.centerLine);
    if (!soloMode) {
      tintCar(aiCar1.group, 0xffaa00);  // gold
      tintCar(aiCar2.group, 0x00aaff);  // blue
    }

    const hud = new HudOverlay(this.root, activeConfig.id);
    this.disposers.push(() => hud.dispose());
    hud.setTrack(track.splineCenterLine);
    const savedLeaderboard = loadLeaderboard(activeConfig.id);
    const lapTracker = new LapTracker(track.centerLine, 11, savedLeaderboard[0]?.lapTimeSeconds ?? null);
    const ai1Tracker = new LapTracker(track.centerLine);
    const ai2Tracker = new LapTracker(track.centerLine);

    let audio: AudioEngine | null = null;
    const startAudio = (): void => {
      if (!options.soundEnabled) return;
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
    let wasNitroActive = false;
    let prevPosition = 1;
    let driftFlashCooldown = 0;
    let prevSpeedAbs = 0;
    let currentBloom = 0.28;
    let gateFlashIdx = -1;
    let gateFlashTimer = 0;
    let prevGear = 0;
    let wasAirborne = false;
    let maxAirborneY = 0;   // peak group Y reached since last jump launch
    let rampWarnCooldown = 0;
    let playerLaunched = false;

    type Spark = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number };
    type ShockRing = { mesh: THREE.Mesh; life: number; maxLife: number };
    const sparks: Spark[] = [];
    const shockRings: ShockRing[] = [];

    const emitLandingRing = (pos: THREE.Vector3, color: number): void => {
      const geo = new THREE.RingGeometry(0.15, 1.8, 32);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos).setY(0.06);
      rendererBundle.scene.add(ring);
      shockRings.push({ mesh: ring, life: 0, maxLife: 1.10 });
    };
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
        sparks.push({ mesh, vx: (Math.random() - 0.5) * 28, vy: 4 + Math.random() * 8, vz: (Math.random() - 0.5) * 28, life: 0, maxLife: 0.38 + Math.random() * 0.50 });
      }
    };

    // Countdown state: 3.0 → 0 → race start
    let preRaceTimer = 3.4;
    let lastCountPhase = 4;
    let raceStarted = false;
    const noInput = { accelerate: false, brake: false, reverse: false, steerLeft: false, steerRight: false, handbrake: false, nitro: false, reset: false };
    createTrackBoundaryColliders(physics.world, track.segments, track.roadWidth, track.wallHeight, track.wallThickness);

    const jumpPads = new JumpPadSystem(rendererBundle.scene);
    this.disposers.push(() => jumpPads.dispose());

    rendererBundle.scene.add(ground, environment, track.group, car.group);
    if (!soloMode) rendererBundle.scene.add(aiCar1.group, aiCar2.group);
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
        const current = localStorage.getItem(TRACK_SELECTION_KEY);
        if (current === canyonRunConfig.id || activeConfig.id === canyonRunConfig.id) {
          writeSelectedTrackId(neonRidgeConfig.id);
        } else {
          const hasCompletedTrack1 = loadLeaderboard(neonRidgeConfig.id).length > 0;
          if (hasCompletedTrack1) {
            writeSelectedTrackId(canyonRunConfig.id);
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
      const deltaSeconds = Math.min(clock.getDelta(), 0.05);

      // ── Countdown ───────────────────────────────────────────────────────
      if (!raceStarted) {
        preRaceTimer -= deltaSeconds;
        const phase = Math.ceil(preRaceTimer);
        if (phase !== lastCountPhase) {
          lastCountPhase = phase;
          if (phase === 3) { hud.flashBig("3"); audio?.playCountdownBeep(false); }
          else if (phase === 2) { hud.flashBig("2"); audio?.playCountdownBeep(false); }
          else if (phase === 1) { hud.flashBig("1"); audio?.playCountdownBeep(false); }
          else if (phase <= 0) { hud.flash("GO!", "cyan"); audio?.playCountdownBeep(true); audio?.startAmbient(); raceStarted = true; car.reset(); if (!soloMode) { aiCar1.reset(); aiCar2.reset(); } car.wakeUp(); if (!soloMode) { aiCar1.wakeUp(); aiCar2.wakeUp(); } }
        }
        // Engine spools up during countdown: idle at 3 → held at launch RPM by GO
        const revFraction = THREE.MathUtils.clamp(1 - preRaceTimer / 3.4, 0, 1);
        audio?.setCountdownRev(revFraction);
      }

      if (input.consumeReset()) {
        car.reset();
        if (!soloMode) {
          aiCar1.reset(); aiCar2.reset();
          ai1.reset(); ai2.reset();
          ai1Tracker.resetCurrentLap(); ai2Tracker.resetCurrentLap();
        }
        lapTracker.resetCurrentLap();
        ghostRecorder.reset();
        ghostCar?.stop();
        preRaceTimer = 3.4;
        lastCountPhase = 4;
        raceStarted = false;
        playerLaunched = false;
        hud.flash("Reset to start", "yellow");
      }
      if (!raceStarted) {
        car.reset();
        if (!soloMode) {
          aiCar1.reset();
          aiCar2.reset();
        }
      }
      const playerWantsControl = input.state.accelerate
        || input.state.brake
        || input.state.reverse
        || input.state.steerLeft
        || input.state.steerRight
        || input.state.handbrake
        || input.state.nitro;
      if (raceStarted && !playerLaunched && playerWantsControl) {
        car.reset();
        ghostCar?.start();
        playerLaunched = true;
      }
      if (raceStarted && !playerLaunched) {
        car.reset();
        if (!soloMode) {
          aiCar1.reset();
          aiCar2.reset();
        }
      }
      const raceActive = raceStarted && playerLaunched;
      car.update(deltaSeconds, raceActive ? input.state : noInput);
      if (!soloMode) {
        if (raceActive) {
          ai1.update(deltaSeconds, car.position);
          ai2.update(deltaSeconds, car.position);
        } else {
          aiCar1.update(deltaSeconds, noInput);
          aiCar2.update(deltaSeconds, noInput);
        }
        if (raceActive) {
          ai1Tracker.update(aiCar1.position, deltaSeconds);
          ai2Tracker.update(aiCar2.position, deltaSeconds);
        }
        // Prevent AI cars from jamming: lateral push when too close
        const sepDx = aiCar2.position.x - aiCar1.position.x;
        const sepDz = aiCar2.position.z - aiCar1.position.z;
        const sepDist = Math.hypot(sepDx, sepDz);
        if (sepDist < 5 && sepDist > 0.01) {
          const nx = sepDx / sepDist;
          const nz = sepDz / sepDist;
          const mag = ((5 - sepDist) / 5) * 280;
          aiCar1.applyImpulse(-nx * mag, 0, -nz * mag);
          aiCar2.applyImpulse(nx * mag, 0, nz * mag);
        }
      }
      if (raceActive) {
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
      // Keep bodies awake after each physics step — Rapier may re-sleep them during step()
      car.wakeUp();
      if (!soloMode) { aiCar1.wakeUp(); aiCar2.wakeUp(); }
      audio?.update(car.speedMetersPerSecond, car.isDrifting, input.state.accelerate, car.lateralSpeedMetersPerSecond, deltaSeconds, input.state.brake, car.isReversing, car.isNitroActive);

      // Impact detection: rapid speed drop → camera shake + impact sound + bloom spike
      const speedAbs = Math.abs(car.speedMetersPerSecond);
      const speedDrop = prevSpeedAbs - speedAbs;
      const speedRatioBloom = THREE.MathUtils.clamp(Math.abs(car.speedMetersPerSecond) / 50, 0, 1);
      let targetBloom = car.isDrifting
        ? 0.46 + speedRatioBloom * 0.22
        : 0.28 + speedRatioBloom * 0.20;
      if (speedDrop > 6 && prevSpeedAbs > 5) {
        cameraRig.addShake(Math.min(0.9, speedDrop * 0.075));
        audio?.playImpact();
        hud.flashImpact(Math.min(1, speedDrop * 0.08));
        emitSparks(car.group.position, 14 + Math.floor(speedDrop * 2.0));
        targetBloom = Math.min(0.85, 0.28 + speedDrop * 0.04);
      }
      prevSpeedAbs = speedAbs;

      rampWarnCooldown = Math.max(0, rampWarnCooldown - deltaSeconds);
      const jumpCars = soloMode ? [car] : [car, aiCar1, aiCar2];
      jumpPads.update(deltaSeconds, jumpCars, (carIdx) => {
        if (carIdx === 0) {
          cameraRig.addShake(0.22);
          audio?.playJumpLaunch();
          targetBloom = Math.min(targetBloom + 0.22, 0.90);
          hud.flash("JUMP!", "cyan");
          wasAirborne = true;
          maxAirborneY = car.group.position.y;
          rampWarnCooldown = 3.0; // suppress approach warning briefly after launch
        }
      }, (_padIdx, frac) => {
        if (rampWarnCooldown <= 0 && frac > 0.55) {
          hud.flash("RAMP AHEAD!", "yellow");
          rampWarnCooldown = 2.2;
        }
      });

      // Track peak altitude during flight
      if (wasAirborne) {
        maxAirborneY = Math.max(maxAirborneY, car.group.position.y);
      }

      // Landing detection: car was rising/airborne, now falling AND near ground
      // Normal ground: car.group.position.y ≈ 0.78 (rigidBody at 1.5m, offset -0.72)
      // "Near ground" = group Y < 0.90; "genuine jump" = peaked above 1.2m group Y
      const isNearGround = car.group.position.y < 0.90;
      const wasHighEnough = maxAirborneY > 1.2;
      const isFalling = car.verticalSpeed < -1.5;
      if (wasAirborne && isNearGround && wasHighEnough && isFalling) {
        const fallHeight = Math.max(0, maxAirborneY - 0.78);
        cameraRig.addShake(Math.min(0.80, fallHeight * 0.18));
        audio?.playLandingThump();
        emitSparks(car.group.position, 8 + Math.floor(fallHeight * 4));
        emitLandingRing(car.group.position, 0x3df4d6);
        emitLandingRing(car.group.position, 0xff2266);
        targetBloom = Math.min(targetBloom + 0.24, 0.88);
        wasAirborne = false;
        maxAirborneY = 0;
      }

      const raceMoment = raceActive ? lapTracker.update(car.position, deltaSeconds) : null;
      if (raceMoment?.type === "checkpoint") {
        hud.flash(`Gate ${raceMoment.checkpoint}/${raceMoment.checkpointTotal}`, "cyan");
        audio?.playCheckpoint();
        targetBloom = 0.58;
        gateFlashIdx = raceMoment.checkpoint - 1;
        gateFlashTimer = 0.84;
      } else if (raceMoment?.type === "lap") {
        const ls = raceMoment.lapTimeSeconds;
        const lapTimeStr = formatTime(ls);
        const isNewBest = raceMoment.bestLapTimeSeconds === ls;
        hud.flash(`${isNewBest ? "BEST LAP " : `LAP ${raceMoment.lap - 1}  `}${lapTimeStr}`, isNewBest ? "cyan" : "magenta");
        hud.flashVictory(isNewBest);
        cameraRig.addShake(isNewBest ? 0.40 : 0.24);
        audio?.playLapComplete();
        targetBloom = isNewBest ? 0.72 : 0.58;
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
        const t = Math.max(0, gateFlashTimer / 0.84);
        const gl = track.gateLights[gateFlashIdx];
        gl.intensity = THREE.MathUtils.lerp(18, 220, t);
        gl.color.setHex(t > 0.5 ? 0xffffff : 0x3df4d6);
        if (gateFlashTimer <= 0) gateFlashIdx = -1;
      }

      currentBloom = THREE.MathUtils.lerp(currentBloom, targetBloom, 1 - Math.exp(-deltaSeconds * 10.5));
      rendererBundle.setBloomStrength(currentBloom);
      rendererBundle.setSpeedFilter(speedRatioBloom);
      hud.setSpeedEffects(speedRatioBloom);

      driftFlashCooldown = Math.max(0, driftFlashCooldown - deltaSeconds);
      if (car.isDrifting && !wasDrifting && raceActive && driftFlashCooldown <= 0) {
        hud.flash("DRIFT!", "yellow");
        audio?.playDriftEntry();
        cameraRig.addShake(0.12 * speedRatioBloom);
        driftFlashCooldown = 2.2;
      }
      wasDrifting = car.isDrifting;

      // Nitro activation: fire once on leading edge
      if (car.isNitroActive && !wasNitroActive) {
        audio?.playNitroStart();
        hud.flashNitro();
        targetBloom = Math.min(targetBloom + 0.16, 0.80);
      }
      // Nitro depleted: fire once on trailing edge when tank is empty
      if (!car.isNitroActive && wasNitroActive && car.nitroFuel < 0.05) {
        audio?.playNitroEmpty();
      }
      wasNitroActive = car.isNitroActive;

      // Launch micro-shake: continuous rattle while wheelspin-launching
      if (raceActive && input.state.accelerate && speedAbs < 6 && speedAbs > 0.4) {
        cameraRig.addShake(0.076);
      }

      cameraRig.update(car.group.position, car.heading, car.speedMetersPerSecond, car.isDrifting, deltaSeconds, wasAirborne && maxAirborneY > 1.0);
      const gear = car.isReversing ? -1 : (Math.abs(car.speedMetersPerSecond) < 0.5 ? 0 : Math.min(4, Math.floor(Math.abs(car.speedMetersPerSecond) / 12.5) + 1));
      // Upshift bloom flash: brief glow spike on gear change at speed
      if (gear > prevGear && gear > 1 && speedAbs > 10) {
        targetBloom = Math.min(targetBloom + 0.18, 0.72);
        cameraRig.addShake(0.036);
      }
      prevGear = gear;
      const lapSnapshot = lapTracker.getSnapshot();
      let racePosition = 1;
      if (!soloMode && raceActive) {
        const playerScore = (lapSnapshot.lap - 1) * track.centerLine.length + lapSnapshot.checkpointProgress;
        const ai1Snap = ai1Tracker.getSnapshot();
        const ai2Snap = ai2Tracker.getSnapshot();
        const ai1Score = (ai1Snap.lap - 1) * track.centerLine.length + ai1Snap.checkpointProgress;
        const ai2Score = (ai2Snap.lap - 1) * track.centerLine.length + ai2Snap.checkpointProgress;
        racePosition = 1 + [ai1Score, ai2Score].filter(s => s > playerScore).length;
      }
      if (raceActive && racePosition < prevPosition) {
        hud.flash(`P${racePosition}!`, "cyan");
        cameraRig.addShake(0.12);
        targetBloom = Math.min(targetBloom + 0.10, 0.65);
      }
      prevPosition = racePosition;
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
        trackName: activeConfig.name,
        nitroFuel: car.nitroFuel,
        isNitroActive: car.isNitroActive,
      });
      const nextGateIdx = lapSnapshot.checkpointProgress < lapSnapshot.checkpointTotal - 1
        ? lapSnapshot.checkpointProgress + 1
        : 0;
      const nextGatePos = track.centerLine[nextGateIdx] ?? null;
      hud.updateMinimap(car.position, car.heading,
        soloMode ? [] : [
          { pos: aiCar1.position, color: "rgba(255,170,0,0.85)" },
          { pos: aiCar2.position, color: "rgba(0,170,255,0.85)" }
        ], nextGatePos, jumpPads.padPositions);
      // Spark particle update
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += deltaSeconds;
        s.vy -= 13 * deltaSeconds;
        s.mesh.position.x += s.vx * deltaSeconds;
        s.mesh.position.y += s.vy * deltaSeconds;
        s.mesh.position.z += s.vz * deltaSeconds;
        s.mesh.rotation.x += deltaSeconds * 14;
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

      // Shock ring update: expand outward and fade
      for (let i = shockRings.length - 1; i >= 0; i--) {
        const r = shockRings[i];
        r.life += deltaSeconds;
        const t = r.life / r.maxLife;
        const scale = 1 + t * 42;
        r.mesh.scale.setScalar(scale);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t * t);
        if (r.life >= r.maxLife) {
          rendererBundle.scene.remove(r.mesh);
          r.mesh.geometry.dispose();
          (r.mesh.material as THREE.MeshBasicMaterial).dispose();
          shockRings.splice(i, 1);
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
    color: 0x0d1a10,
    roughness: 0.94,
    metalness: 0
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  return ground;
}
