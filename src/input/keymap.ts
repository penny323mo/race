export type ActionName = "accelerate" | "brake" | "steerLeft" | "steerRight" | "handbrake" | "reset";

export interface KeyBinding {
  readonly primary: string;
  readonly secondary: string;
}

export type Keymap = Record<ActionName, KeyBinding>;

const STORAGE_KEY = "neon-ridge.keymap";

export const ACTION_LABELS: Record<ActionName, string> = {
  accelerate: "Accelerate",
  brake:      "Brake",
  steerLeft:  "Steer Left",
  steerRight: "Steer Right",
  handbrake:  "Handbrake / Drift",
  reset:      "Reset Car",
};

export const DEFAULT_KEYMAP: Keymap = {
  accelerate: { primary: "ArrowUp",    secondary: "KeyW"    },
  brake:      { primary: "ArrowDown",  secondary: "KeyS"    },
  steerLeft:  { primary: "ArrowLeft",  secondary: "KeyA"    },
  steerRight: { primary: "ArrowRight", secondary: "KeyD"    },
  handbrake:  { primary: "Space",      secondary: ""        },
  reset:      { primary: "KeyR",       secondary: ""        },
};

export function loadKeymap(): Keymap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_KEYMAP) as Keymap;
    const parsed = JSON.parse(raw) as Partial<Keymap>;
    // Merge with defaults so new actions always have a binding
    return { ...structuredClone(DEFAULT_KEYMAP) as Keymap, ...parsed };
  } catch {
    return structuredClone(DEFAULT_KEYMAP) as Keymap;
  }
}

export function saveKeymap(keymap: Keymap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keymap));
  } catch { /* ignore */ }
}

export function formatKey(code: string): string {
  const MAP: Record<string, string> = {
    ArrowUp:    "↑",
    ArrowDown:  "↓",
    ArrowLeft:  "←",
    ArrowRight: "→",
    Space:      "Space",
    ShiftLeft:  "L‑Shift",
    ShiftRight: "R‑Shift",
    ControlLeft:"L‑Ctrl",
    Enter:      "Enter",
    Backspace:  "Backspace",
  };
  if (code in MAP) return MAP[code];
  if (code.startsWith("Key"))    return code.slice(3);
  if (code.startsWith("Digit"))  return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  return code;
}
