export interface InputState {
  readonly accelerate: boolean;
  readonly brake: boolean;
  readonly steerLeft: boolean;
  readonly steerRight: boolean;
  readonly reset: boolean;
}

export class KeyboardInput {
  public readonly state: InputState = {
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    reset: false
  };

  public dispose(): void {
    return;
  }
}
