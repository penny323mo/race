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
    this.element.textContent = `Speed ${snapshot.speedKph.toFixed(0)} km/h | Lap ${snapshot.lap} | Checkpoint ${snapshot.checkpoint}/${snapshot.checkpointTotal}`;
  }
}
