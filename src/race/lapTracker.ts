import type { Vector2 } from "../types";

export interface LapSnapshot {
  readonly lap: number;
  readonly checkpointProgress: number;
  readonly checkpointTotal: number;
  readonly currentLapTimeSeconds: number;
  readonly bestLapTimeSeconds: number | null;
}

export class LapTracker {
  private readonly checkpoints: readonly Vector2[];
  private readonly checkpointRadius: number;
  private lap = 1;
  private nextCheckpointIndex = 1;
  private currentLapTimeSeconds = 0;
  private bestLapTimeSeconds: number | null = null;
  private checkpointProgress = 0;

  public constructor(checkpoints: readonly Vector2[], checkpointRadius = 11) {
    if (checkpoints.length < 3) {
      throw new Error("LapTracker requires at least three checkpoints on a closed loop.");
    }

    this.checkpoints = checkpoints;
    this.checkpointRadius = checkpointRadius;
  }

  public update(position: Vector2, deltaSeconds: number): void {
    this.currentLapTimeSeconds += Math.max(deltaSeconds, 0);

    const nextCheckpoint = this.checkpoints[this.nextCheckpointIndex];
    const distance = Math.hypot(position.x - nextCheckpoint.x, position.z - nextCheckpoint.z);

    if (distance > this.checkpointRadius) {
      return;
    }

    if (this.nextCheckpointIndex === 0) {
      this.finishLap();
      return;
    }

    this.checkpointProgress = this.nextCheckpointIndex;
    this.nextCheckpointIndex = (this.nextCheckpointIndex + 1) % this.checkpoints.length;
  }

  public resetCurrentLap(): void {
    this.nextCheckpointIndex = 1;
    this.checkpointProgress = 0;
    this.currentLapTimeSeconds = 0;
  }

  public getSnapshot(): LapSnapshot {
    return {
      lap: this.lap,
      checkpointProgress: this.checkpointProgress,
      checkpointTotal: this.checkpoints.length,
      currentLapTimeSeconds: this.currentLapTimeSeconds,
      bestLapTimeSeconds: this.bestLapTimeSeconds
    };
  }

  private finishLap(): void {
    if (this.bestLapTimeSeconds === null || this.currentLapTimeSeconds < this.bestLapTimeSeconds) {
      this.bestLapTimeSeconds = this.currentLapTimeSeconds;
    }

    this.lap += 1;
    this.currentLapTimeSeconds = 0;
    this.nextCheckpointIndex = 1;
    this.checkpointProgress = 0;
  }
}
