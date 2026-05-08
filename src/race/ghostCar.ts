import * as THREE from "three";
import type { GhostFrame } from "./ghostRecorder";

export class GhostCar {
  public readonly group: THREE.Group;
  private readonly frames: readonly GhostFrame[];
  private elapsed = 0;
  private active = false;
  private fadeAlpha = 0;

  public constructor(frames: readonly GhostFrame[]) {
    this.frames = frames;
    this.group = createGhostMesh();
    this.group.visible = false;
  }

  public start(): void {
    this.elapsed = 0;
    this.active = true;
    this.fadeAlpha = 0;
    this.group.visible = true;
  }

  public stop(): void {
    this.active = false;
    this.group.visible = false;
  }

  public update(deltaSeconds: number): void {
    if (!this.active || this.frames.length < 2) return;
    this.elapsed += deltaSeconds;
    this.fadeAlpha = Math.min(1, this.fadeAlpha + deltaSeconds);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        // Body has emissive set; wheels do not
        const isBody = mat.emissiveIntensity > 0;
        mat.opacity = (isBody ? 0.58 : 0.36) * this.fadeAlpha;
      }
    });

    const last = this.frames[this.frames.length - 1];
    if (this.elapsed > last.t) {
      this.group.visible = false;
      return;
    }

    // Binary search for surrounding frames
    let lo = 0;
    let hi = this.frames.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t <= this.elapsed) lo = mid; else hi = mid;
    }

    const a = this.frames[lo];
    const b = this.frames[hi];
    const span = b.t - a.t;
    const alpha = span > 0.0001 ? (this.elapsed - a.t) / span : 0;

    const x = a.x + (b.x - a.x) * alpha;
    const y = a.y + (b.y - a.y) * alpha;
    const z = a.z + (b.z - a.z) * alpha;
    const heading = a.heading + angleDiff(b.heading, a.heading) * alpha;

    this.group.position.set(x, y, z);
    this.group.rotation.y = heading;
    this.group.visible = true;
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function createGhostMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = "GhostCar";

  const mat = new THREE.MeshStandardMaterial({
    color: 0x3df4d6,
    emissive: 0x18bfa9,
    emissiveIntensity: 1.25,
    transparent: true,
    opacity: 0.44,
    depthWrite: false
  });

  // Simplified body
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 5.5), mat);
  body.position.y = 0.8;
  group.add(body);

  // Four wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3df4d6, transparent: true, opacity: 0.36, depthWrite: false });
  const wheelGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.54, 12);
  for (const [x, y, z] of [[-1.88, 0.42, 1.62], [1.88, 0.42, 1.62], [-1.88, 0.42, -1.78], [1.88, 0.42, -1.78]] as [number, number, number][]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  return group;
}
