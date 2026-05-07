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
