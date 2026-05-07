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
  private readonly messageElement: HTMLDivElement;
  private messageTimeoutId: number | null = null;

  public constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "hud";
    root.appendChild(this.element);

    this.speedEffectElement = document.createElement("div");
    this.speedEffectElement.className = "speed-effect";
    root.appendChild(this.speedEffectElement);

    this.messageElement = document.createElement("div");
    this.messageElement.className = "race-message";
    root.appendChild(this.messageElement);

    this.helpElement = document.createElement("div");
    this.helpElement.className = "controls";
    this.helpElement.innerHTML = `
      <div class="controls__line"><strong>Goal</strong> hit green gates in order, then cross the checkered line.</div>
      <div class="controls__line"><kbd>W</kbd>/<kbd>↑</kbd> accelerate &nbsp; <kbd>S</kbd>/<kbd>↓</kbd> brake</div>
      <div class="controls__line"><kbd>A</kbd>/<kbd>D</kbd> steer &nbsp; <kbd>Space</kbd> handbrake &nbsp; <kbd>R</kbd> reset</div>
    `;
    root.appendChild(this.helpElement);
  }

  public flash(message: string, tone: "cyan" | "magenta" | "yellow" = "cyan"): void {
    this.messageElement.textContent = message;
    this.messageElement.className = `race-message race-message--show race-message--${tone}`;

    if (this.messageTimeoutId !== null) {
      window.clearTimeout(this.messageTimeoutId);
    }

    this.messageTimeoutId = window.setTimeout(() => {
      this.messageElement.className = `race-message race-message--${tone}`;
      this.messageTimeoutId = null;
    }, 1150);
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
      <div class="hud__speed">
        <span class="hud__speed-value">${snapshot.speedKph.toFixed(0)}</span>
        <span class="hud__speed-unit">km/h</span>
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
    `;
  }
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
