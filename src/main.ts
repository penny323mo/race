import "./style.css";
import { Game } from "./game";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Application root element #app was not found.");
}

const game = new Game(root);
void game.start();
