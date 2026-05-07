import * as THREE from "three";
import type { TrackSegment, Vector2 } from "../types";

export interface TrackEntity {
  readonly group: THREE.Group;
  readonly centerLine: readonly Vector2[];
  readonly segments: readonly TrackSegment[];
  readonly roadWidth: number;
}

export function createTrack(): TrackEntity {
  const group = new THREE.Group();
  group.name = "Track";

  const centerLine: Vector2[] = [
    { x: 0, z: 66 },
    { x: 46, z: 54 },
    { x: 72, z: 14 },
    { x: 60, z: -34 },
    { x: 18, z: -66 },
    { x: -36, z: -58 },
    { x: -72, z: -18 },
    { x: -62, z: 34 }
  ];

  const roadWidth = 18;
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x30363b,
    roughness: 0.82,
    metalness: 0.02
  });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: 0x7b8d40,
    roughness: 0.95
  });
  const centerStripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3f0d0,
    roughness: 0.75
  });

  const segments = buildSegments(centerLine);

  for (const segment of segments) {
    const roadGeometry = new THREE.BoxGeometry(segment.length + roadWidth, 0.18, roadWidth);
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.position.set(segment.center.x, 0.05, segment.center.z);
    road.rotation.y = segment.angle;
    road.receiveShadow = true;
    group.add(road);

    const stripeGeometry = new THREE.BoxGeometry(Math.max(segment.length - 10, 8), 0.05, 0.9);
    const stripe = new THREE.Mesh(stripeGeometry, centerStripeMaterial);
    stripe.position.set(segment.center.x, 0.18, segment.center.z);
    stripe.rotation.y = segment.angle;
    group.add(stripe);

    const outerShoulder = createShoulder(segment, roadWidth * 0.5 + 2.6, shoulderMaterial);
    const innerShoulder = createShoulder(segment, -(roadWidth * 0.5 + 2.6), shoulderMaterial);
    group.add(outerShoulder, innerShoulder);
  }

  return { group, centerLine, segments, roadWidth };
}

export function buildSegments(centerLine: readonly Vector2[]): TrackSegment[] {
  const segments: TrackSegment[] = [];

  for (let index = 0; index < centerLine.length; index += 1) {
    const start = centerLine[index];
    const end = centerLine[(index + 1) % centerLine.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);

    if (length <= 0.001) {
      throw new Error(`Track segment ${index} has zero length.`);
    }

    const directionX = dx / length;
    const directionZ = dz / length;

    segments.push({
      start,
      end,
      center: { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 },
      length,
      angle: Math.atan2(directionZ, directionX),
      normal: { x: -directionZ, z: directionX }
    });
  }

  return segments;
}

function createShoulder(
  segment: TrackSegment,
  sideOffset: number,
  material: THREE.Material
): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(segment.length + 12, 0.12, 3.4), material);
  shoulder.position.set(
    segment.center.x + segment.normal.x * sideOffset,
    0.03,
    segment.center.z + segment.normal.z * sideOffset
  );
  shoulder.rotation.y = segment.angle;
  shoulder.receiveShadow = true;
  return shoulder;
}
