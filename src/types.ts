export interface Vector2 {
  readonly x: number;
  readonly z: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface TrackSegment {
  readonly start: Vector2;
  readonly end: Vector2;
  readonly center: Vector2;
  readonly length: number;
  readonly angle: number;
  readonly normal: Vector2;
}

// Used for track centerLines — supports elevation via y
export interface TrackPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrackConfig {
  readonly name: string;
  readonly centerLine: readonly TrackPoint[];
  readonly roadWidth: number;
  readonly unlockCondition: "always" | "complete-track-1";
}
