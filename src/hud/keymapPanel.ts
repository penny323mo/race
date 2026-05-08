import {
  ACTION_LABELS, cloneDefaultKeymap, formatKey, loadKeymap, saveKeymap,
  type ActionName, type Keymap,
} from "../input/keymap";

export class KeymapPanel {
  private readonly el: HTMLElement;
  private readonly onClose: () => void;
  private keymap: Keymap;
  private pending: { action: ActionName; slot: "primary" | "secondary"; btn: HTMLElement } | null = null;

  public constructor(root: HTMLElement, onClose: () => void) {
    this.onClose = onClose;
    this.keymap = loadKeymap();

    this.el = document.createElement("div");
    this.el.className = "keymap-panel";
    this.el.innerHTML = this.buildHTML();
    root.appendChild(this.el);

    this.el.querySelector(".keymap-panel__close")!
      .addEventListener("click", () => this.close());

    this.el.querySelector(".keymap-panel__reset")!
      .addEventListener("click", () => this.resetToDefaults());

    this.bindRowListeners();

    window.addEventListener("keydown", this.onCapture, { capture: true });
  }

  public dispose(): void {
    this.el.remove();
    window.removeEventListener("keydown", this.onCapture, { capture: true });
  }

  private close(): void {
    this.dispose();
    this.onClose();
  }

  private buildHTML(): string {
    const rows = (Object.keys(ACTION_LABELS) as ActionName[]).map(action => {
      const b = this.keymap[action];
      return `
      <div class="keymap-row" data-action="${action}">
        <span class="keymap-row__label">${ACTION_LABELS[action]}</span>
        <button class="keymap-key" data-slot="primary"  data-action="${action}">${formatKey(b.primary)  || "—"}</button>
        <button class="keymap-key" data-slot="secondary" data-action="${action}">${formatKey(b.secondary) || "—"}</button>
      </div>`;
    }).join("");

    return `
    <div class="keymap-panel__inner">
      <div class="keymap-panel__header">
        <span class="keymap-panel__title">KEY BINDINGS</span>
        <button class="keymap-panel__close">✕</button>
      </div>
      <div class="keymap-panel__cols">
        <span></span><span class="keymap-col-head">Primary</span><span class="keymap-col-head">Alt</span>
      </div>
      <div class="keymap-panel__rows">${rows}</div>
      <div class="keymap-panel__footer">
        <button class="keymap-panel__reset">Reset defaults</button>
        <span class="keymap-panel__hint">Click a key to rebind · Esc to cancel</span>
      </div>
    </div>`;
  }

  private bindRowListeners(): void {
    this.el.querySelectorAll<HTMLElement>(".keymap-key").forEach(btn => {
      btn.addEventListener("click", () => {
        this.clearPending();
        const action = btn.dataset["action"] as ActionName;
        const slot   = btn.dataset["slot"] as "primary" | "secondary";
        this.pending = { action, slot, btn };
        btn.classList.add("keymap-key--listening");
        btn.textContent = "…";
      });
    });
  }

  private readonly onCapture = (e: KeyboardEvent): void => {
    if (!this.pending) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code === "Escape") {
      this.clearPending();
      this.refresh();
      return;
    }

    const { action, slot, btn } = this.pending;
    this.pending = null;

    // Remove this code from any other binding to avoid duplicates
    for (const [a, binding] of Object.entries(this.keymap) as [ActionName, { primary: string; secondary: string }][]) {
      if (binding.primary   === e.code) (this.keymap[a] as { primary: string; secondary: string }).primary   = "";
      if (binding.secondary === e.code) (this.keymap[a] as { primary: string; secondary: string }).secondary = "";
    }

    (this.keymap[action] as { primary: string; secondary: string })[slot] = e.code;
    saveKeymap(this.keymap);
    btn.classList.remove("keymap-key--listening");
    this.refresh();
  };

  private clearPending(): void {
    if (!this.pending) return;
    this.pending.btn.classList.remove("keymap-key--listening");
    this.pending = null;
  }

  private resetToDefaults(): void {
    this.keymap = cloneDefaultKeymap();
    saveKeymap(this.keymap);
    this.refresh();
  }

  private refresh(): void {
    const rows = this.el.querySelector(".keymap-panel__rows")!;
    rows.innerHTML = (Object.keys(ACTION_LABELS) as ActionName[]).map(action => {
      const b = this.keymap[action];
      return `
      <div class="keymap-row" data-action="${action}">
        <span class="keymap-row__label">${ACTION_LABELS[action]}</span>
        <button class="keymap-key" data-slot="primary"  data-action="${action}">${formatKey(b.primary)  || "—"}</button>
        <button class="keymap-key" data-slot="secondary" data-action="${action}">${formatKey(b.secondary) || "—"}</button>
      </div>`;
    }).join("");
    this.bindRowListeners();
  }
}
