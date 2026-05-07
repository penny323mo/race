import * as THREE from "three";

export interface RendererBundle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
}

export function createRenderer(root: HTMLElement): RendererBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91b8d9);
  scene.fog = new THREE.Fog(0x91b8d9, 140, 280);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  return { renderer, scene };
}
