export type ActionName = "accelerate" | "brake" | "reverse" | "steerLeft" | "steerRight" | "handbrake" | "nitro" | "reset";

export interface KeyBinding {
  readonly primary: string;
  readonly secondary: string;
}

export type Keymap = Record<ActionName, KeyBinding>;

const STORAGE_KEY = "neon-ridge.keymap";

export const ACTION_LABELS: Record<ActionName, string> = {
  accelerate: "Accelerate",
  brake:      "Brake",
  reverse:    "Reverse",
  steerLeft:  "Steer Left",
  steerRight: "Steer Right",
  handbrake:  "Handbrake / Drift",
  nitro:      "Nitro Boost",
  reset:      "Reset Car",
};

export const DEFAULT_KEYMAP: Keymap = {
  accelerate: { primary: "ArrowUp",    secondary: "KeyW"      },
  brake:      { primary: "ArrowDown",  secondary: "KeyS"      },
  reverse:    { primary: "ShiftLeft",  secondary: "ShiftRight" },
  steerLeft:  { primary: "ArrowLeft",  secondary: "KeyA"      },
  steerRight: { primary: "ArrowRight", secondary: "KeyD"      },
  handbrake:  { primary: "Space",      secondary: ""          },
  nitro:      { primary: "KeyN",       secondary: "ControlLeft" },
  reset:      { primary: "KeyR",       secondary: ""          },
};

export function cloneDefaultKeymap(): Keymap {
  return structuredClone(DEFAULT_KEYMAP) as Keymap;
}

export function loadKeymap(): Keymap {
  const keymap = cloneDefaultKeymap();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return keymap;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return keymap;
    for (const action of Object.keys(DEFAULT_KEYMAP) as ActionName[]) {
      const binding = (parsed as Partial<Record<ActionName, unknown>>)[action];
      if (!isKeyBinding(binding)) continue;
      keymap[action] = binding;
    }
    return keymap;
  } catch {
    return keymap;
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

function isKeyBinding(value: unknown): value is KeyBinding {
  if (typeof value !== "object" || value === null) return false;
  const binding = value as Partial<KeyBinding>;
  return typeof binding.primary === "string" && typeof binding.secondary === "string";
}
