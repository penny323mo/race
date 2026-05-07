import { createCameraRig } from "./scene/camera";
import { createLights } from "./scene/lights";
import { createRenderer } from "./scene/renderer";

export class Game {
  private readonly root: HTMLElement;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public async start(): Promise<void> {
    const rendererBundle = createRenderer(this.root);
    const cameraRig = createCameraRig();
    createLights(rendererBundle.scene);

    rendererBundle.scene.add(cameraRig.camera);
    rendererBundle.renderer.render(rendererBundle.scene, cameraRig.camera);
  }
}
