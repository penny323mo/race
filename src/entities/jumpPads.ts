import * as THREE from "three";
import type { CarEntity } from "./car";

export interface JumpPad {
  readonly position: THREE.Vector3;
  readonly heading: number; // radians, direction the ramp faces (track forward direction)
  readonly color: number;
}

const PAD_TRIGGER_RADIUS = 5.0;
const JUMP_IMPULSE_Y = 680;
const JUMP_COOLDOWN = 1.8;

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
    onJump: (carIndex: number) => void
  ): void {
    const t = performance.now() * 0.001;
    for (let pi = 0; pi < this.pads.length; pi++) {
      const pad = this.pads[pi];
      pad.cooldown = Math.max(0, pad.cooldown - deltaSeconds);

      // Pulsing glow
      pad.light.intensity = 14 + Math.sin(t * 3.5 + pi * 2.1) * 6;

      for (let ci = 0; ci < cars.length; ci++) {
        const car = cars[ci];
        const dx = car.position.x - pad.worldPos.x;
        const dz = car.position.z - pad.worldPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < PAD_TRIGGER_RADIUS && pad.cooldown <= 0) {
            const speed = Math.abs(car.speedMetersPerSecond);
          const launchY = JUMP_IMPULSE_Y * (0.7 + 0.3 * Math.min(1, speed / 30));
          car.applyImpulse(0, launchY, 0);
          pad.cooldown = JUMP_COOLDOWN;
          onJump(ci);
        }
      }
    }
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
  const group = new THREE.Group();
  group.rotation.y = heading;

  // Ramp wedge: 8m wide, 5m long, rises from 0 to 1.8m
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(5, 0);
  shape.lineTo(5, 1.8);
  shape.lineTo(0, 0);

  const extSettings: THREE.ExtrudeGeometryOptions = { depth: 8, bevelEnabled: false };
  const rampGeo = new THREE.ExtrudeGeometry(shape, extSettings);
  // Center the width
  rampGeo.translate(0, 0, -4);

  const rampMat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0.55,
  });
  const rampMesh = new THREE.Mesh(rampGeo, rampMat);
  // Swap Y/Z because extrude goes into Z; rotate so ramp rises in Y along X
  rampMesh.rotation.x = -Math.PI / 2;
  group.add(rampMesh);

  // Neon edge strips
  for (const zOff of [-4, 4]) {
    const edgeGeo = new THREE.BoxGeometry(5.2, 0.10, 0.12);
    const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(2.5, 0.02, zOff);
    group.add(edge);
  }

  // Arrow chevron decal on the ramp surface
  const arrowGeo = new THREE.PlaneGeometry(2.4, 1.2);
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(2.5, 0.05, 0);
  group.add(arrow);

  return group;
}
