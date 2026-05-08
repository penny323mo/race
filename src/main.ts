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
  void game.start(options);
}

void boot();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
  });
}
