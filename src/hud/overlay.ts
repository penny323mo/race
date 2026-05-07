export interface HudSnapshot {
  readonly speedKph: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly checkpointTotal: number;
  readonly currentLapTimeSeconds: number;
  readonly bestLapTimeSeconds: number | null;
  readonly isOffTrack: boolean;
  readonly speedRatio: number;
}

export class HudOverlay {
  public readonly element: HTMLDivElement;
  private readonly helpElement: HTMLDivElement;
  private readonly speedEffectElement: HTMLDivElement;

  public constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "hud";
    root.appendChild(this.element);

    this.speedEffectElement = document.createElement("div");
    this.speedEffectElement.className = "speed-effect";
    root.appendChild(this.speedEffectElement);

    this.helpElement = document.createElement("div");
    this.helpElement.className = "controls";
    this.helpElement.innerHTML = `
      <div class="controls__line"><strong>Goal</strong> hit green gates in order, then cross the checkered line.</div>
      <div class="controls__line"><kbd>W</kbd>/<kbd>↑</kbd> accelerate <kbd>S</kbd>/<kbd>↓</kbd> brake</div>
      <div class="controls__line"><kbd>A</kbd>/<kbd>←</kbd> left <kbd>D</kbd>/<kbd>→</kbd> right <kbd>R</kbd> reset</div>
    `;
    root.appendChild(this.helpElement);
  }

  public update(snapshot: HudSnapshot): void {
    const bestLap = snapshot.bestLapTimeSeconds === null ? "--:--.---" : formatTime(snapshot.bestLapTimeSeconds);
    const speedRatio = Math.max(0, Math.min(snapshot.speedRatio, 1));
    const checkpointTarget =
      snapshot.checkpoint >= snapshot.checkpointTotal - 1
        ? "Finish"
        : `Gate ${snapshot.checkpoint + 1}`;
    this.speedEffectElement.style.opacity = `${speedRatio * 0.72}`;
    this.speedEffectElement.style.setProperty("--speed-scale", `${1 + speedRatio * 0.8}`);
    this.element.innerHTML = `
      <div class="hud__brand">NEON RIDGE GP</div>
      <div class="hud__row">
        <span class="hud__label">Speed</span>
        <span class="hud__value">${snapshot.speedKph.toFixed(0)} km/h</span>
      </div>
      <div class="hud__row">
        <span class="hud__label">Lap</span>
        <span class="hud__value">${snapshot.lap}</span>
      </div>
      <div class="hud__row">
        <span class="hud__label">Checkpoint</span>
        <span class="hud__value">${snapshot.checkpoint}/${snapshot.checkpointTotal}</span>
      </div>
      <div class="hud__row">
        <span class="hud__label">Next</span>
        <span class="hud__value">${checkpointTarget}</span>
      </div>
      <div class="hud__row">
        <span class="hud__label">Current</span>
        <span class="hud__value">${formatTime(snapshot.currentLapTimeSeconds)}</span>
      </div>
      <div class="hud__row">
        <span class="hud__label">Best</span>
        <span class="hud__value">${bestLap}</span>
      </div>
      <div class="hud__status${snapshot.isOffTrack ? " hud__status--warn" : ""}">
        ${snapshot.isOffTrack ? "Boundary assist active" : "Track limits ready"}
      </div>
    `;
  }
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
