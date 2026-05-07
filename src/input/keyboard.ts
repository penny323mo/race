import { loadKeymap, type ActionName, type Keymap } from "./keymap";

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  reverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  reset: boolean;
  handbrake: boolean;
  nitro: boolean;
}

export class KeyboardInput {
  public readonly state: InputState = {
    accelerate: false,
    brake:      false,
    reverse:    false,
    steerLeft:  false,
    steerRight: false,
    reset:      false,
    handbrake:  false,
    nitro:      false,
  };

  private resetRequested = false;
  private keymap: Keymap = loadKeymap();

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    const action = this.codeToAction(e.code);
    if (!action) return;
    e.preventDefault();
    if (action === "reset") this.resetRequested = true;
    this.state[action] = true;
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    const action = this.codeToAction(e.code);
    if (!action) return;
    e.preventDefault();
    this.state[action] = false;
  };

  public constructor(target: Window = window) {
    target.addEventListener("keydown", this.handleKeyDown);
    target.addEventListener("keyup",   this.handleKeyUp);
  }

  public reloadKeymap(): void {
    this.keymap = loadKeymap();
  }

  public consumeReset(): boolean {
    if (!this.resetRequested) return false;
    this.resetRequested = false;
    return true;
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup",   this.handleKeyUp);
  }

  private codeToAction(code: string): ActionName | null {
    for (const [action, binding] of Object.entries(this.keymap) as [ActionName, { primary: string; secondary: string }][]) {
      if (code === binding.primary || (binding.secondary && code === binding.secondary)) {
        return action;
      }
    }
    return null;
  }
}
