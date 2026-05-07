import * as THREE from "three";
import { createCar } from "./entities/car";
import { createTrack } from "./entities/track";
import { KeyboardInput } from "./input/keyboard";
import { createCameraRig } from "./scene/camera";
import { createLights } from "./scene/lights";
import { createRenderer } from "./scene/renderer";

export class Game {
  private readonly root: HTMLElement;
  private animationFrameId: number | null = null;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public async start(): Promise<void> {
    const rendererBundle = createRenderer(this.root);
    const cameraRig = createCameraRig();
    const input = new KeyboardInput();
    createLights(rendererBundle.scene);

    const ground = createGround();
    const track = createTrack();
    const car = createCar();
    const clock = new THREE.Clock();

    rendererBundle.scene.add(ground, track.group, car.group);
    rendererBundle.scene.add(cameraRig.camera);

    const handleResize = (): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      rendererBundle.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      rendererBundle.renderer.setSize(width, height);
      cameraRig.resize(width, height);
    };

    window.addEventListener("resize", handleResize);

    const render = (): void => {
      const deltaSeconds = clock.getDelta();
      if (input.consumeReset()) {
        car.reset();
      }
      car.update(deltaSeconds, input.state);
      cameraRig.camera.lookAt(car.group.position);
      rendererBundle.renderer.render(rendererBundle.scene, cameraRig.camera);
      this.animationFrameId = window.requestAnimationFrame(render);
    };

    handleResize();
    render();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

function createGround(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  const geometry = new THREE.PlaneGeometry(360, 360);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4e8a47,
    roughness: 0.96,
    metalness: 0
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  return ground;
}
