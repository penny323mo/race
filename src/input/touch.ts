import type { InputState } from "./keyboard";

// Left pad: steering only
// Right pad: accelerate (top) · brake (bottom) · handbrake (side)
const LEFT_BUTTONS = [
  { id: "touch-left",  key: "steerLeft"  as const, label: "◀" },
  { id: "touch-right", key: "steerRight" as const, label: "▶" },
] as const;

const RIGHT_BUTTONS = [
  { id: "touch-accel",     key: "accelerate" as const, label: "GAS"   },
  { id: "touch-brake",     key: "brake"      as const, label: "BRK"   },
  { id: "touch-handbrake", key: "handbrake"  as const, label: "DRIFT" },
  { id: "touch-nitro",     key: "nitro"      as const, label: "NOS"   },
] as const;

type ButtonKey = typeof LEFT_BUTTONS[number]["key"] | typeof RIGHT_BUTTONS[number]["key"];

export class TouchControls {
  private readonly state: InputState;
  private readonly container: HTMLElement;
  private readonly held = new Set<ButtonKey>();

  public constructor(root: HTMLElement, state: InputState) {
    this.state = state;

    this.container = document.createElement("div");
    this.container.className = "touch-controls";
    this.container.setAttribute("aria-hidden", "true");

    const leftPad  = this.makePad("touch-pad-left");
    const rightPad = this.makePad("touch-pad-right");

    for (const def of LEFT_BUTTONS)  leftPad.appendChild(this.makeButton(def.id, def.label, def.key));
    for (const def of RIGHT_BUTTONS) rightPad.appendChild(this.makeButton(def.id, def.label, def.key));

    this.container.appendChild(leftPad);
    this.container.appendChild(rightPad);
    root.appendChild(this.container);

    // Only show on touch-primary devices
    if (!window.matchMedia("(pointer: coarse)").matches) {
      this.container.style.display = "none";
    }

    window.addEventListener("touchend",    this.onGlobalTouchEnd, { passive: true });
    window.addEventListener("touchcancel", this.onGlobalTouchEnd, { passive: true });
  }

  public dispose(): void {
    this.releaseAll();
    this.container.remove();
    window.removeEventListener("touchend",    this.onGlobalTouchEnd);
    window.removeEventListener("touchcancel", this.onGlobalTouchEnd);
  }

  private makePad(id: string): HTMLElement {
    const pad = document.createElement("div");
    pad.id = id;
    pad.className = "touch-pad";
    return pad;
  }

  private makeButton(id: string, label: string, key: ButtonKey): HTMLElement {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "touch-btn";
    btn.textContent = label;
    btn.setAttribute("type", "button");
    btn.tabIndex = -1;

    btn.addEventListener("touchstart", (e: TouchEvent) => {
      e.preventDefault();
      this.held.add(key);
      this.state[key] = true;
      btn.classList.add("touch-btn--active");
    }, { passive: false });

    const release = (): void => {
      this.held.delete(key);
      this.state[key] = false;
      btn.classList.remove("touch-btn--active");
    };

    btn.addEventListener("touchend",    release, { passive: true });
    btn.addEventListener("touchcancel", release, { passive: true });

    return btn;
  }

  // Safety net: if all fingers lift off screen, release everything
  private readonly onGlobalTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length === 0) {
      this.releaseAll();
    }
  };

  private releaseAll(): void {
    for (const key of this.held) {
      this.state[key] = false;
    }
    this.held.clear();
    this.container.querySelectorAll(".touch-btn--active")
      .forEach(el => el.classList.remove("touch-btn--active"));
  }
}
