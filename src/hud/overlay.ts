export interface HudSnapshot {
  readonly speedKph: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly checkpointTotal: number;
  readonly currentLapTimeSeconds: number;
  readonly bestLapTimeSeconds: number | null;
}

export class HudOverlay {
  public readonly element: HTMLDivElement;

  public constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "hud";
    root.appendChild(this.element);
  }

  public update(snapshot: HudSnapshot): void {
    const bestLap = snapshot.bestLapTimeSeconds === null ? "--:--.---" : formatTime(snapshot.bestLapTimeSeconds);
    this.element.innerHTML = `
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
        <span class="hud__label">Current</span>
        <span class="hud__value">${formatTime(snapshot.currentLapTimeSeconds)}</span>
      </div>
      <div class="hud__row">
        <span class="hud__label">Best</span>
        <span class="hud__value">${bestLap}</span>
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
