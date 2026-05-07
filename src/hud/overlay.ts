import { loadLeaderboard } from "../race/leaderboard";
import type { Vector2 } from "../types";

export interface HudSnapshot {
  readonly speedKph: number;
  readonly gear: number;
  readonly position: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly checkpointTotal: number;
  readonly currentLapTimeSeconds: number;
  readonly bestLapTimeSeconds: number | null;
  readonly isOffTrack: boolean;
  readonly speedRatio: number;
  readonly trackName: string;
}

export class HudOverlay {
  public readonly element: HTMLDivElement;
  private readonly helpElement: HTMLDivElement;
  private readonly speedEffectElement: HTMLDivElement;
  private readonly messageElement: HTMLDivElement;
  private readonly vignetteElement: HTMLDivElement;
  private vignetteTimeoutId: number | null = null;
  private messageTimeoutId: number | null = null;
  private leaderboardVisible = false;
  private readonly leaderboardElement: HTMLDivElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapCtx: CanvasRenderingContext2D;
  private trackPoints: readonly Vector2[] = [];
  private minimapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

  public constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "hud";
    root.appendChild(this.element);

    this.speedEffectElement = document.createElement("div");
    this.speedEffectElement.className = "speed-effect";
    root.appendChild(this.speedEffectElement);

    this.vignetteElement = document.createElement("div");
    this.vignetteElement.className = "impact-vignette";
    root.appendChild(this.vignetteElement);

    this.messageElement = document.createElement("div");
    this.messageElement.className = "race-message";
    root.appendChild(this.messageElement);

    this.helpElement = document.createElement("div");
    this.helpElement.className = "controls";
    this.helpElement.innerHTML = `
      <div class="controls__line"><strong>Goal</strong> hit green gates in order, then cross the checkered line.</div>
      <div class="controls__line"><kbd>W</kbd>/<kbd>↑</kbd> accelerate &nbsp; <kbd>S</kbd>/<kbd>↓</kbd> brake</div>
      <div class="controls__line"><kbd>A</kbd>/<kbd>D</kbd> steer &nbsp; <kbd>Space</kbd> handbrake &nbsp; <kbd>R</kbd> reset</div>
      <div class="controls__line"><kbd>Tab</kbd> leaderboard &nbsp; <kbd>K</kbd> key bindings</div>
    `;
    root.appendChild(this.helpElement);

    this.leaderboardElement = document.createElement("div");
    this.leaderboardElement.className = "leaderboard";
    this.leaderboardElement.style.display = "none";
    root.appendChild(this.leaderboardElement);

    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.className = "minimap";
    this.minimapCanvas.width = 148;
    this.minimapCanvas.height = 148;
    root.appendChild(this.minimapCanvas);
    this.minimapCtx = this.minimapCanvas.getContext("2d")!;

    window.addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        this.leaderboardVisible = !this.leaderboardVisible;
        this.leaderboardElement.style.display = this.leaderboardVisible ? "block" : "none";
        if (this.leaderboardVisible) this.refreshLeaderboard();
      }
    });
  }

  private refreshLeaderboard(): void {
    const entries = loadLeaderboard();
    if (entries.length === 0) {
      this.leaderboardElement.innerHTML = `<div class="leaderboard__title">BEST LAPS</div><div class="leaderboard__empty">No laps recorded yet</div>`;
      return;
    }
    const rows = entries
      .map((e, i) => `<div class="leaderboard__row"><span class="leaderboard__rank">${i + 1}</span><span class="leaderboard__time">${formatTime(e.lapTimeSeconds)}</span><span class="leaderboard__date">${e.date}</span></div>`)
      .join("");
    this.leaderboardElement.innerHTML = `<div class="leaderboard__title">BEST LAPS <span class="leaderboard__hint">[Tab]</span></div>${rows}`;
  }

  public flash(message: string, tone: "cyan" | "magenta" | "yellow" = "cyan"): void {
    this.messageElement.textContent = message;
    this.messageElement.className = `race-message race-message--show race-message--${tone}`;
    if (this.messageTimeoutId !== null) window.clearTimeout(this.messageTimeoutId);
    this.messageTimeoutId = window.setTimeout(() => {
      this.messageElement.className = `race-message race-message--${tone}`;
      this.messageTimeoutId = null;
    }, 1150);
  }

  public flashBig(message: string, tone: "cyan" | "magenta" | "yellow" = "yellow"): void {
    this.messageElement.textContent = message;
    this.messageElement.className = `race-message race-message--show race-message--${tone} race-message--big`;
    if (this.messageTimeoutId !== null) window.clearTimeout(this.messageTimeoutId);
    this.messageTimeoutId = window.setTimeout(() => {
      this.messageElement.className = `race-message race-message--${tone} race-message--big`;
      this.messageTimeoutId = null;
    }, 820);
  }

  public flashImpact(intensity: number): void {
    const opacity = Math.min(0.82, intensity * 0.9);
    this.vignetteElement.style.opacity = String(opacity);
    if (this.vignetteTimeoutId !== null) window.clearTimeout(this.vignetteTimeoutId);
    this.vignetteTimeoutId = window.setTimeout(() => {
      this.vignetteElement.style.opacity = "0";
      this.vignetteTimeoutId = null;
    }, 80);
  }

  public setTrack(centerLine: readonly Vector2[]): void {
    this.trackPoints = centerLine;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of centerLine) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const pad = (maxX - minX) * 0.08;
    this.minimapBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }

  public updateMinimap(carPos: Vector2, carHeading: number, aiPositions: readonly { pos: Vector2; color: string }[], nextGatePos: Vector2 | null = null): void {
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const { minX, maxX, minZ, maxZ } = this.minimapBounds;
    const scaleX = W / (maxX - minX);
    const scaleZ = H / (maxZ - minZ);

    const toCanvas = (p: Vector2): [number, number] => [
      (p.x - minX) * scaleX,
      (p.z - minZ) * scaleZ
    ];

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "rgba(8,14,22,0.82)";
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 8);
    ctx.fill();

    // Track centerline
    if (this.trackPoints.length > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const [x0, z0] = toCanvas(this.trackPoints[0]);
      ctx.moveTo(x0, z0);
      for (let i = 1; i < this.trackPoints.length; i++) {
        const [cx, cz] = toCanvas(this.trackPoints[i]);
        ctx.lineTo(cx, cz);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // AI cars — colored dots matching car tint
    for (const ai of aiPositions) {
      const [ax, az] = toCanvas(ai.pos);
      ctx.fillStyle = ai.color;
      ctx.beginPath();
      ctx.arc(ax, az, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Next gate — pulsing yellow ring
    if (nextGatePos) {
      const [gx, gz] = toCanvas(nextGatePos);
      const pulse = 0.55 + 0.45 * Math.sin(Date.now() * 0.006);
      ctx.strokeStyle = `rgba(255,215,95,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gz, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,215,95,${pulse * 0.45})`;
      ctx.beginPath();
      ctx.arc(gx, gz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player car — bright arrow
    const [px, pz] = toCanvas(carPos);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(carHeading);
    ctx.fillStyle = "#ff3158";
    ctx.shadowColor = "#ff3158";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = "rgba(61,244,214,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, W - 1, H - 1, 8);
    ctx.stroke();
  }

  public update(snapshot: HudSnapshot): void {
    const bestLap = snapshot.bestLapTimeSeconds === null ? "-:--.---" : formatTime(snapshot.bestLapTimeSeconds);
    const speedRatio = Math.max(0, Math.min(snapshot.speedRatio, 1));
    const checkpointTarget =
      snapshot.checkpoint >= snapshot.checkpointTotal - 1
        ? "Finish"
        : `Gate ${snapshot.checkpoint + 1}`;
    this.speedEffectElement.style.opacity = `${speedRatio * 0.72}`;
    this.speedEffectElement.style.setProperty("--speed-scale", `${1 + speedRatio * 0.8}`);
    this.element.innerHTML = `
      <div class="hud__toprow">
        <div class="hud__brand">${snapshot.trackName.toUpperCase()} GP</div>
        <div class="hud__position">P${snapshot.position}</div>
      </div>
      <div class="hud__speed">
        <span class="hud__speed-value">${snapshot.speedKph.toFixed(0)}</span>
        <span class="hud__speed-unit">km/h</span>
        <span class="hud__gear">${snapshot.gear < 0 ? "R" : snapshot.gear === 0 ? "N" : "G" + snapshot.gear}</span>
      </div>
      <div class="hud__progress">
        <span style="width: ${(snapshot.checkpoint / Math.max(snapshot.checkpointTotal - 1, 1)) * 100}%"></span>
      </div>
      <div class="hud__grid">
        <div>
          <span class="hud__label">Lap</span>
          <span class="hud__value">${snapshot.lap}</span>
        </div>
        <div>
          <span class="hud__label">Gate</span>
          <span class="hud__value">${snapshot.checkpoint}/${snapshot.checkpointTotal}</span>
        </div>
        <div>
          <span class="hud__label">Current</span>
          <span class="hud__value">${formatTime(snapshot.currentLapTimeSeconds)}</span>
        </div>
        <div>
          <span class="hud__label">Best</span>
          <span class="hud__value">${bestLap}</span>
        </div>
      </div>
      <div class="hud__target${snapshot.isOffTrack ? " hud__target--warn" : ""}">
        ${snapshot.isOffTrack ? "ASSIST" : checkpointTarget}
      </div>
      <div class="hud__track">${snapshot.trackName}</div>
    `;
  }
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
