import { TRACK_CONFIGS, readSelectedTrackId, isTrackUnlocked, resolveTrackConfig, writeSelectedTrackId } from "../entities/tracks/registry";

export type GameMode = "solo" | "ai-battle";

export interface GameOptions {
  mode: GameMode;
  soundEnabled: boolean;
  trackId: string | null;
}

const SOUND_KEY = "neon-ridge.sound-enabled";

export function showMainMenu(root: HTMLElement): Promise<GameOptions> {
  return new Promise((resolve) => {
    const soundEnabled = localStorage.getItem(SOUND_KEY) !== "false";
    let selectedMode: GameMode = "ai-battle";
    let selectedTrackId = resolveTrackConfig(readSelectedTrackId()).id;

    const overlay = document.createElement("div");
    overlay.className = "menu-overlay";
    overlay.innerHTML = buildMenuHTML(soundEnabled, selectedTrackId);
    root.appendChild(overlay);

    // Force reflow then fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { overlay.classList.add("menu-overlay--visible"); });
    });

    const startGame = (mode: GameMode): void => {
      selectedMode = mode;
      overlay.classList.remove("menu-overlay--visible");
      overlay.classList.add("menu-overlay--hidden");
      setTimeout(() => {
        overlay.remove();
        resolve({
          mode: selectedMode,
          soundEnabled: localStorage.getItem(SOUND_KEY) !== "false",
          trackId: selectedTrackId,
        });
      }, 480);
    };

    const updateTrackSelection = (): void => {
      for (const el of overlay.querySelectorAll<HTMLElement>("[data-track-id]")) {
        const active = el.dataset["trackId"] === selectedTrackId;
        el.classList.toggle("menu-track--selected", active);
        el.setAttribute("aria-pressed", active ? "true" : "false");
        const status = el.querySelector(".menu-track__status");
        if (status) status.textContent = active ? "SELECTED" : "READY";
      }
    };

    overlay.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest("[data-action]") as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset["action"];

      if (action === "solo") startGame("solo");
      else if (action === "ai-battle") startGame("ai-battle");
      else if (action === "select-track") {
        const trackId = btn.dataset["trackId"] ?? null;
        const track = TRACK_CONFIGS.find((config) => config.id === trackId);
        if (!track || !isTrackUnlocked(track)) return;
        selectedTrackId = track.id;
        writeSelectedTrackId(track.id);
        updateTrackSelection();
      }
      else if (action === "toggle-sound") {
        const current = localStorage.getItem(SOUND_KEY) !== "false";
        const next = !current;
        localStorage.setItem(SOUND_KEY, next ? "true" : "false");
        const label = overlay.querySelector(".menu-sound-label");
        const btn2 = overlay.querySelector(".menu-btn--sound") as HTMLElement | null;
        if (label) label.textContent = next ? "ON" : "OFF";
        if (btn2) {
          btn2.classList.toggle("menu-btn--sound-off", !next);
        }
      }
    });
  });
}

function buildMenuHTML(soundEnabled: boolean, selectedTrackId: string): string {
  return `
    <div class="menu-content">
      <div class="menu-logo">
        <span class="menu-logo__line1">NEON</span>
        <span class="menu-logo__line2">RIDGE</span>
        <div class="menu-logo__sub">RACING</div>
      </div>

      <div class="menu-modes">
        <button class="menu-btn menu-btn--primary" data-action="ai-battle">
          <span class="menu-btn__icon">⚡</span>
          <span class="menu-btn__label">AI BATTLE</span>
          <span class="menu-btn__sub">Race against 2 AI opponents</span>
        </button>
        <button class="menu-btn menu-btn--secondary" data-action="solo">
          <span class="menu-btn__icon">⏱</span>
          <span class="menu-btn__label">TIME TRIAL</span>
          <span class="menu-btn__sub">Solo — beat your best lap</span>
        </button>
      </div>

      <div class="menu-tracks" aria-label="Track selection">
        ${TRACK_CONFIGS.map((track) => {
          const unlocked = isTrackUnlocked(track);
          const selected = track.id === selectedTrackId;
          return `
            <button
              class="menu-track ${selected ? "menu-track--selected" : ""}"
              data-action="select-track"
              data-track-id="${track.id}"
              aria-pressed="${selected ? "true" : "false"}"
              ${unlocked ? "" : "disabled"}
            >
              <span class="menu-track__name">${track.name}</span>
              <span class="menu-track__status">${unlocked ? (selected ? "SELECTED" : "READY") : "LOCKED"}</span>
            </button>
          `;
        }).join("")}
      </div>

      <div class="menu-settings">
        <div class="menu-settings__row">
          <span class="menu-settings__label">Sound</span>
          <button class="menu-btn menu-btn--sound ${soundEnabled ? "" : "menu-btn--sound-off"}" data-action="toggle-sound">
            <span class="menu-sound-label">${soundEnabled ? "ON" : "OFF"}</span>
          </button>
        </div>
        <div class="menu-settings__row menu-settings__keys">
          <span>W/↑ accelerate &nbsp;·&nbsp; S/↓ brake &nbsp;·&nbsp; Shift reverse</span>
          <span>A/D steer &nbsp;·&nbsp; Space drift &nbsp;·&nbsp; R reset &nbsp;·&nbsp; K bindings</span>
        </div>
      </div>

      <div class="menu-footer">
        <kbd>Tab</kbd> leaderboard &nbsp;&nbsp; <kbd>T</kbd> switch track in race
      </div>
    </div>
  `;
}
