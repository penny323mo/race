export interface InputState {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  reset: boolean;
  handbrake: boolean;
}

export class KeyboardInput {
  public readonly state: InputState = {
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    reset: false,
    handbrake: false
  };

  private resetRequested = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const handled = this.setKey(event.code, true);
    if (handled) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const handled = this.setKey(event.code, false);
    if (handled) {
      event.preventDefault();
    }
  };

  public constructor(target: Window = window) {
    target.addEventListener("keydown", this.handleKeyDown);
    target.addEventListener("keyup", this.handleKeyUp);
  }

  public consumeReset(): boolean {
    if (!this.resetRequested) {
      return false;
    }
    this.resetRequested = false;
    return true;
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  private setKey(code: string, isPressed: boolean): boolean {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        this.state.accelerate = isPressed;
        return true;
      case "KeyS":
      case "ArrowDown":
        this.state.brake = isPressed;
        return true;
      case "KeyA":
      case "ArrowLeft":
        this.state.steerLeft = isPressed;
        return true;
      case "KeyD":
      case "ArrowRight":
        this.state.steerRight = isPressed;
        return true;
      case "KeyR":
        this.state.reset = isPressed;
        if (isPressed) {
          this.resetRequested = true;
        }
        return true;
      case "Space":
        this.state.handbrake = isPressed;
        return true;
      default:
        return false;
    }
  }
}
