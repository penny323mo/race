import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface RendererBundle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly composer: EffectComposer;
  resize(width: number, height: number): void;
  render(camera: THREE.Camera): void;
  setBloomStrength(strength: number): void;
  setSpeedFilter(speedRatio: number): void;
}

export function createRenderer(root: HTMLElement): RendererBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06080f);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  root.appendChild(renderer.domElement);

  // IBL: generate environment map from a soft room light — enables metalness reflections
  // on road, car body, and track rails without external HDR assets
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.038).texture;
  scene.environmentIntensity = 0.28;  // keep it subtle — just enough for specular on metal/glass
  pmrem.dispose();

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, new THREE.PerspectiveCamera());
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.54, 0.58, 0.52);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  return {
    renderer,
    scene,
    composer,
    resize(width: number, height: number): void {
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
    },
    render(camera: THREE.Camera): void {
      renderPass.camera = camera;
      composer.render();
    },
    setBloomStrength(strength: number): void {
      bloomPass.strength = strength;
    },
    setSpeedFilter(speedRatio: number): void {
      // Subtle saturate + contrast ramp as speed increases — hardware-accelerated CSS filter
      const sat = 1 + speedRatio * 0.42;
      const con = 1 + speedRatio * 0.16;
      renderer.domElement.style.filter = `saturate(${sat.toFixed(3)}) contrast(${con.toFixed(3)})`;
    }
  };
}
