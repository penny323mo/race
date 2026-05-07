export interface GhostFrame {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly t: number;
}

export class GhostRecorder {
  private frames: GhostFrame[] = [];
  private elapsed = 0;

  public record(x: number, y: number, z: number, heading: number, deltaSeconds: number): void {
    this.elapsed += Math.max(deltaSeconds, 0);
    this.frames.push({ x, y, z, heading, t: this.elapsed });
  }

  public finish(): readonly GhostFrame[] {
    // Keep every 3rd frame to reduce storage
    const compressed = this.frames.filter((_, i) => i % 3 === 0);
    this.frames = [];
    this.elapsed = 0;
    return compressed;
  }

  public reset(): void {
    this.frames = [];
    this.elapsed = 0;
  }
}
