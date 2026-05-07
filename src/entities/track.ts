import * as THREE from "three";
import type { TrackSegment, Vector2 } from "../types";

export interface TrackEntity {
  readonly group: THREE.Group;
  readonly centerLine: readonly Vector2[];
  readonly segments: readonly TrackSegment[];
  readonly roadWidth: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
}

export interface BoundaryResolution {
  readonly position: Vector2;
  readonly constrained: boolean;
  readonly speedMultiplier: number;
  readonly distanceFromCenter: number;
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
  const wallHeight = 2.4;
  const wallThickness = 1.4;
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
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9d1d9,
    roughness: 0.62,
    metalness: 0.02
  });
  const checkpointMaterial = new THREE.MeshStandardMaterial({
    color: 0x35d07f,
    roughness: 0.45,
    emissive: 0x0d3b24,
    emissiveIntensity: 0.25
  });
  const finishMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5
  });
  const finishDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x11161a,
    roughness: 0.5
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
    const outerWall = createWall(segment, roadWidth * 0.5 + wallThickness * 0.5, wallHeight, wallThickness, wallMaterial);
    const innerWall = createWall(segment, -(roadWidth * 0.5 + wallThickness * 0.5), wallHeight, wallThickness, wallMaterial);
    group.add(outerShoulder, innerShoulder, outerWall, innerWall);
  }

  addCheckpointMarkers(group, centerLine, segments, roadWidth, checkpointMaterial, finishMaterial, finishDarkMaterial);

  return { group, centerLine, segments, roadWidth, wallHeight, wallThickness };
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

function createWall(
  segment: TrackSegment,
  sideOffset: number,
  wallHeight: number,
  wallThickness: number,
  material: THREE.Material
): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(segment.length + 14, wallHeight, wallThickness), material);
  wall.position.set(
    segment.center.x + segment.normal.x * sideOffset,
    wallHeight * 0.5,
    segment.center.z + segment.normal.z * sideOffset
  );
  wall.rotation.y = segment.angle;
  wall.castShadow = true;
  wall.receiveShadow = true;
  return wall;
}

function addCheckpointMarkers(
  group: THREE.Group,
  centerLine: readonly Vector2[],
  segments: readonly TrackSegment[],
  roadWidth: number,
  checkpointMaterial: THREE.Material,
  finishMaterial: THREE.Material,
  finishDarkMaterial: THREE.Material
): void {
  for (let index = 0; index < centerLine.length; index += 1) {
    const position = centerLine[index];
    const incoming = segments[(index - 1 + segments.length) % segments.length];
    const outgoing = segments[index];
    const angle = averageAngle(incoming.angle, outgoing.angle);

    if (index === 0) {
      const finish = createFinishLine(position, angle, roadWidth, finishMaterial, finishDarkMaterial);
      group.add(finish);
      continue;
    }

    const marker = new THREE.Group();
    marker.name = `Checkpoint${index}`;

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(roadWidth - 3.2, 0.12, 1), checkpointMaterial);
    crossbar.position.set(position.x, 0.28, position.z);
    crossbar.rotation.y = angle;
    marker.add(crossbar);

    const postGeometry = new THREE.CylinderGeometry(0.35, 0.35, 5.2, 16);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, checkpointMaterial);
      post.position.set(
        position.x + Math.cos(angle) * side * (roadWidth * 0.5 - 1.2),
        2.7,
        position.z - Math.sin(angle) * side * (roadWidth * 0.5 - 1.2)
      );
      post.castShadow = true;
      marker.add(post);
    }

    group.add(marker);
  }
}

function createFinishLine(
  position: Vector2,
  angle: number,
  roadWidth: number,
  lightMaterial: THREE.Material,
  darkMaterial: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = "StartFinishLine";

  const tileCount = 10;
  const tileWidth = (roadWidth - 3) / tileCount;

  for (let index = 0; index < tileCount; index += 1) {
    const material = index % 2 === 0 ? lightMaterial : darkMaterial;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(tileWidth, 0.16, 2.4), material);
    const offset = -roadWidth * 0.5 + 1.5 + tileWidth * (index + 0.5);
    tile.position.set(position.x + Math.cos(angle) * offset, 0.34, position.z - Math.sin(angle) * offset);
    tile.rotation.y = angle;
    group.add(tile);
  }

  return group;
}

function averageAngle(a: number, b: number): number {
  const x = Math.cos(a) + Math.cos(b);
  const z = Math.sin(a) + Math.sin(b);
  return Math.atan2(z, x) + Math.PI / 2;
}

export function resolveTrackBoundary(
  position: Vector2,
  segments: readonly TrackSegment[],
  roadWidth: number
): BoundaryResolution {
  let closestPoint: Vector2 | null = null;
  let closestNormal: Vector2 | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const projection = projectPointToSegment(position, segment);
    const dx = position.x - projection.point.x;
    const dz = position.z - projection.point.z;
    const distance = Math.hypot(dx, dz);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestPoint = projection.point;
      closestNormal =
        distance > 0.0001
          ? { x: dx / distance, z: dz / distance }
          : projection.side >= 0
            ? segment.normal
            : { x: -segment.normal.x, z: -segment.normal.z };
    }
  }

  if (!closestPoint || !closestNormal) {
    throw new Error("Cannot resolve boundary for a track without segments.");
  }

  const driveableHalfWidth = roadWidth * 0.5 - 1.35;

  if (closestDistance <= driveableHalfWidth) {
    return {
      position,
      constrained: false,
      speedMultiplier: 1,
      distanceFromCenter: closestDistance
    };
  }

  return {
    position: {
      x: closestPoint.x + closestNormal.x * driveableHalfWidth,
      z: closestPoint.z + closestNormal.z * driveableHalfWidth
    },
    constrained: true,
    speedMultiplier: closestDistance > roadWidth * 1.8 ? 0 : 0.16,
    distanceFromCenter: closestDistance
  };
}

function projectPointToSegment(
  position: Vector2,
  segment: TrackSegment
): { readonly point: Vector2; readonly side: number } {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared <= 0.0001) {
    return { point: segment.start, side: 1 };
  }

  const t = THREE.MathUtils.clamp(
    ((position.x - segment.start.x) * dx + (position.z - segment.start.z) * dz) / lengthSquared,
    0,
    1
  );
  const point = {
    x: segment.start.x + dx * t,
    z: segment.start.z + dz * t
  };
  const side = (position.x - point.x) * segment.normal.x + (position.z - point.z) * segment.normal.z;

  return { point, side };
}
