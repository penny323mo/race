import "./style.css";
import { Game } from "./game";
import { showMainMenu } from "./ui/mainMenu";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Application root element #app was not found.");
}

let game: Game | null = null;

async function boot(): Promise<void> {
  const options = await showMainMenu(root!);
  game = new Game(root!);
  await game.start(options);
}

void boot().catch((error: unknown) => {
  game?.dispose();
  showFatalError(error);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
  });
}

function showFatalError(error: unknown): void {
  root!.querySelector(".fatal-error")?.remove();
  const message = error instanceof Error ? error.message : "Unknown startup error";
  const overlay = document.createElement("div");
  overlay.className = "fatal-error";
  overlay.innerHTML = `
    <div class="fatal-error__panel">
      <div class="fatal-error__title">Startup failed</div>
      <div class="fatal-error__message">${escapeHtml(message)}</div>
      <button class="fatal-error__button" type="button">Reload</button>
    </div>
  `;
  overlay.querySelector(".fatal-error__button")?.addEventListener("click", () => {
    window.location.reload();
  });
  root!.appendChild(overlay);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
