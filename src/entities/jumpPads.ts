import * as THREE from "three";
import type { CarEntity } from "./car";

export interface JumpPad {
  readonly position: THREE.Vector3;
  readonly heading: number; // radians, direction the ramp faces (track forward direction)
  readonly color: number;
}

const PAD_TRIGGER_RADIUS = 5.0;
// Car mass ≈ 1495 kg; impulse = mass × Δv; for ~3 m jump: Δv = sqrt(2*9.81*3) ≈ 7.67 m/s
const JUMP_IMPULSE_Y = 16000;
const JUMP_COOLDOWN = 2.2;

const PAD_DEFS: JumpPad[] = [
  // Mid-sweep between checkpoint 1 and 2 (fast right curve)
  { position: new THREE.Vector3(67, 0, 36), heading: Math.atan2(30, -44), color: 0xff2277 },
  // Left arc between checkpoint 7 and 8
  { position: new THREE.Vector3(-76, 0, 12), heading: Math.atan2(-20, 54), color: 0x22ffcc },
  // Back straight between checkpoint 8 and 9
  { position: new THREE.Vector3(-45, 0, 54), heading: Math.atan2(46, 28), color: 0xffcc00 },
];

interface PadState {
  readonly mesh: THREE.Group;
  readonly light: THREE.PointLight;
  readonly worldPos: THREE.Vector3;
  cooldown: number;
}

export class JumpPadSystem {
  private readonly pads: PadState[] = [];
  private readonly group = new THREE.Group();

  public constructor(scene: THREE.Object3D) {
    for (const def of PAD_DEFS) {
      const padGroup = buildRampMesh(def.color, def.heading);
      padGroup.position.copy(def.position);
      this.group.add(padGroup);

      const light = new THREE.PointLight(def.color, 18, 18, 1.8);
      light.position.copy(def.position).setY(1.2);
      this.group.add(light);

      this.pads.push({ mesh: padGroup, light, worldPos: def.position.clone(), cooldown: 0 });
    }
    scene.add(this.group);
  }

  public update(
    deltaSeconds: number,
    cars: CarEntity[],
    onJump: (carIndex: number) => void,
    onApproach?: (padIndex: number, distFraction: number) => void
  ): void {
    const t = performance.now() * 0.001;
    const WARN_RADIUS = 20;

    for (let pi = 0; pi < this.pads.length; pi++) {
      const pad = this.pads[pi];
      pad.cooldown = Math.max(0, pad.cooldown - deltaSeconds);

      // Proximity glow: brighten as player approaches
      const baseIntensity = 14 + Math.sin(t * 3.5 + pi * 2.1) * 6;
      const playerCar = cars[0];
      if (playerCar && pad.cooldown <= 0) {
        const pdx = playerCar.position.x - pad.worldPos.x;
        const pdz = playerCar.position.z - pad.worldPos.z;
        const playerDist = Math.hypot(pdx, pdz);
        if (playerDist < WARN_RADIUS) {
          const frac = 1 - playerDist / WARN_RADIUS;
          pad.light.intensity = baseIntensity + frac * frac * 42;
          onApproach?.(pi, frac);
        } else {
          pad.light.intensity = baseIntensity;
        }
      } else {
        pad.light.intensity = baseIntensity;
      }

      for (let ci = 0; ci < cars.length; ci++) {
        const car = cars[ci];
        const dx = car.position.x - pad.worldPos.x;
        const dz = car.position.z - pad.worldPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < PAD_TRIGGER_RADIUS && pad.cooldown <= 0) {
          const speed = Math.abs(car.speedMetersPerSecond);
          const speedFactor = 0.70 + 0.30 * Math.min(1, speed / 30);
          car.applyImpulse(0, JUMP_IMPULSE_Y * speedFactor, 0);
          pad.cooldown = JUMP_COOLDOWN;
          onJump(ci);
        }
      }
    }
  }

  public get padPositions(): readonly { pos: { x: number; z: number }; color: string }[] {
    return PAD_DEFS.map(def => ({
      pos: { x: def.position.x, z: def.position.z },
      color: `#${def.color.toString(16).padStart(6, "0")}`,
    }));
  }

  public dispose(): void {
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) m.dispose();
    });
  }
}

function buildRampMesh(color: number, heading: number): THREE.Group {
  // heading = track forward angle; local Z points in travel direction
  // Ramp: 8m wide (X), 5m long (Z forward), rises Y=0→1.8
  const W = 4, L = 5, H = 1.8;

  const group = new THREE.Group();
  group.rotation.y = heading;

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 1.6,
    roughness: 0.35,
    metalness: 0.55,
    side: THREE.DoubleSide,
  });

  // Explicit wedge geometry so axis mapping is unambiguous
  // Vertices in local space (Z=forward, Y=up, X=sideways)
  const verts = new Float32Array([
    // ── Top ramp surface ──
    -W, 0, 0,   W, 0, 0,   W, H, L,
    -W, 0, 0,   W, H, L,  -W, H, L,
    // ── Bottom ──
    -W, 0, 0,   W, 0, 0,   W, 0, L,
     W, 0, L,  -W, 0, L,  -W, 0, 0,
    // ── Back face (Z=L) ──
    -W, H, L,   W, H, L,   W, 0, L,
     W, 0, L,  -W, 0, L,  -W, H, L,
    // ── Left face (X=-W) ──
    -W, 0, 0,  -W, H, L,  -W, 0, L,
    // ── Right face (X=+W) ──
     W, 0, 0,   W, 0, L,   W, H, L,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();

  const rampMesh = new THREE.Mesh(geo, mat);
  group.add(rampMesh);

  // Neon edge strips along the sides
  const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
  for (const xOff of [-W, W]) {
    const edgeGeo = new THREE.BoxGeometry(0.10, 0.12, L + 0.4);
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(xOff, 0.06, L / 2);
    group.add(edge);
  }
  // Front lip strip
  const frontGeo = new THREE.BoxGeometry(W * 2 + 0.2, 0.12, 0.10);
  const front = new THREE.Mesh(frontGeo, edgeMat);
  front.position.set(0, 0.06, 0);
  group.add(front);
  // Top edge strip
  const topGeo = new THREE.BoxGeometry(W * 2 + 0.2, 0.12, 0.10);
  const top = new THREE.Mesh(topGeo, edgeMat);
  top.position.set(0, H + 0.06, L);
  group.add(top);

  // Arrows on ramp surface (3 chevrons along length)
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const zPos = L * (0.22 + i * 0.28);
    const yPos = H * (zPos / L) + 0.04;
    const arrowGeo = new THREE.PlaneGeometry(2.8, 1.0);
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    // Tilt arrow to lie on ramp surface
    arrow.rotation.x = -Math.atan2(H, L);
    arrow.position.set(0, yPos, zPos);
    group.add(arrow);
  }

  return group;
}
