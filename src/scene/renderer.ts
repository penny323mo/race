import * as THREE from "three";

export interface RendererBundle {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
}

export function createRenderer(root: HTMLElement): RendererBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91b8d9);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  root.appendChild(renderer.domElement);

  return { renderer, scene };
}
