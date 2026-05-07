import * as THREE from "three";
import type { TrackConfig, TrackPoint, TrackSegment, Vector2 } from "../types";

export interface TrackEntity {
  readonly group: THREE.Group;
  readonly centerLine: readonly Vector2[];         // sparse raw points — for LapTracker
  readonly splineCenterLine: readonly Vector2[];   // 256-point smooth spline — for minimap
  readonly segments: readonly TrackSegment[];
  readonly roadWidth: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly roadMesh: THREE.Mesh;             // for trimesh collider
  readonly hasElevation: boolean;
  readonly gateLights: readonly THREE.PointLight[];  // one per checkpoint gate (index 0 = gate 1)
}

export interface BoundaryResolution {
  readonly position: Vector2;
  readonly constrained: boolean;
  readonly speedMultiplier: number;
  readonly distanceFromCenter: number;
}

interface TrackSample {
  readonly point: Vector2;          // x, z only — used for boundary/segment logic
  readonly point3: THREE.Vector3;   // x, y, z — used for ribbon geometry
  readonly tangent: Vector2;
  readonly normal: Vector2;
  readonly angle: number;
}

export function createTrack(config: TrackConfig): TrackEntity {
  const group = new THREE.Group();
  group.name = "Track";

  const { centerLine, roadWidth } = config;
  const wallHeight = 2.9;
  const wallThickness = 1.25;
  const samples = buildTrackSamples(centerLine, 256);
  const segments = buildSegments(samples.map((sample) => sample.point));

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2028,
    roughness: 0.18,
    metalness: 0.55,
    side: THREE.DoubleSide
  });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: 0x355443,
    roughness: 0.94,
    side: THREE.DoubleSide
  });
  const runoffMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2734,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const racingLineMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd75f,
    roughness: 0.5,
    emissive: 0x553600,
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide
  });
  const centerStripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4e9ba,
    roughness: 0.58,
    emissive: 0x201806,
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x151b24,
    roughness: 0.5,
    metalness: 0.12
  });
  const railGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x55f0ff,
    roughness: 0.22,
    emissive: 0x18b8ff,
    emissiveIntensity: 1.1
  });
  const curbRedMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3158,
    roughness: 0.48,
    emissive: 0x3d0712,
    emissiveIntensity: 0.22
  });
  const curbWhiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f8f0,
    roughness: 0.5,
    emissive: 0x151510,
    emissiveIntensity: 0.08
  });
  const rubberMaterial = new THREE.MeshStandardMaterial({
    color: 0x090d10,
    roughness: 0.86
  });
  const checkpointMaterial = new THREE.MeshStandardMaterial({
    color: 0x3df4d6,
    roughness: 0.22,
    emissive: 0x17b9a5,
    emissiveIntensity: 1.65
  });
  const finishMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5
  });
  const finishDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x11161a,
    roughness: 0.5
  });

  const road = createTrackRibbon(samples, -roadWidth * 0.5, roadWidth * 0.5, 0.08, roadMaterial);
  road.receiveShadow = true;
  group.add(road);

  group.add(createTrackRibbon(samples, roadWidth * 0.5 + 5.2, roadWidth * 0.5 + 10.2, 0.01, runoffMaterial));
  group.add(createTrackRibbon(samples, -roadWidth * 0.5 - 10.2, -roadWidth * 0.5 - 5.2, 0.01, runoffMaterial));
  group.add(createTrackRibbon(samples, roadWidth * 0.5 + 0.4, roadWidth * 0.5 + 5.2, 0.02, shoulderMaterial));
  group.add(createTrackRibbon(samples, -roadWidth * 0.5 - 5.2, -roadWidth * 0.5 - 0.4, 0.02, shoulderMaterial));
  group.add(createTrackRibbon(samples, -0.9, 0.9, 0.215, racingLineMaterial));
  group.add(createTrackRibbon(samples, roadWidth * 0.5 - 1.08, roadWidth * 0.5 - 0.72, 0.2, centerStripeMaterial));
  group.add(createTrackRibbon(samples, -roadWidth * 0.5 + 0.72, -roadWidth * 0.5 + 1.08, 0.2, centerStripeMaterial));

  addDashedCenterLines(group, samples, centerStripeMaterial);
  addCurbs(group, samples, roadWidth, curbRedMaterial, curbWhiteMaterial);
  addRubberMarks(group, samples, rubberMaterial);
  addCurveBarriers(group, samples, roadWidth, wallHeight, wallThickness, wallMaterial, railGlowMaterial);
  addArrowChevrons(group, samples, roadWidth, checkpointMaterial);
  addBrakeZoneBands(group, samples, roadWidth, curbRedMaterial);
  const gateLights = addCheckpointMarkers(group, centerLine, samples, roadWidth, checkpointMaterial, finishMaterial, finishDarkMaterial);

  const hasElevation = centerLine.some((p) => Math.abs(p.y) > 0.1);

  return {
    group,
    centerLine: centerLine.map((p) => ({ x: p.x, z: p.z })),
    splineCenterLine: samples.map((s) => s.point),
    segments,
    roadWidth,
    wallHeight,
    wallThickness,
    roadMesh: road,
    hasElevation,
    gateLights
  };
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

function buildTrackSamples(centerLine: readonly TrackPoint[], count: number): TrackSample[] {
  const curve = new THREE.CatmullRomCurve3(
    centerLine.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    true,
    "catmullrom",
    0.42
  );
  const samples: TrackSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const t = index / count;
    const pt3 = curve.getPointAt(t);
    const tangent3 = curve.getTangentAt(t).normalize();
    const tangent: Vector2 = { x: tangent3.x, z: tangent3.z };
    const normal: Vector2 = { x: -tangent.z, z: tangent.x };
    samples.push({
      point: { x: pt3.x, z: pt3.z },
      point3: pt3,
      tangent,
      normal,
      angle: Math.atan2(tangent.z, tangent.x)
    });
  }

  return samples;
}

function createTrackRibbon(
  samples: readonly TrackSample[],
  innerOffset: number,
  outerOffset: number,
  yOffset: number,
  material: THREE.Material
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const sample of samples) {
    const py = sample.point3.y + yOffset;
    vertices.push(
      sample.point.x + sample.normal.x * innerOffset, py, sample.point.z + sample.normal.z * innerOffset
    );
    vertices.push(
      sample.point.x + sample.normal.x * outerOffset, py, sample.point.z + sample.normal.z * outerOffset
    );
  }

  for (let index = 0; index < samples.length; index += 1) {
    const next = (index + 1) % samples.length;
    const a = index * 2;
    const b = a + 1;
    const c = next * 2;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

function addDashedCenterLines(group: THREE.Group, samples: readonly TrackSample[], material: THREE.Material): void {
  for (let index = 0; index < samples.length; index += 8) {
    const sample = samples[index];
    const dash = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.055, 0.34), material);
    dash.position.set(sample.point3.x, sample.point3.y + 0.23, sample.point3.z);
    dash.rotation.y = sample.angle;
    group.add(dash);
  }
}

function addCurbs(
  group: THREE.Group,
  samples: readonly TrackSample[],
  roadWidth: number,
  redMaterial: THREE.Material,
  whiteMaterial: THREE.Material
): void {
  for (const side of [-1, 1]) {
    for (let index = 0; index < samples.length; index += 4) {
      const sample = samples[index];
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.22, 1.35),
        (index / 4 + (side > 0 ? 0 : 1)) % 2 === 0 ? redMaterial : whiteMaterial
      );
      curb.position.set(
        sample.point3.x + sample.normal.x * side * (roadWidth * 0.5 - 0.44),
        sample.point3.y + 0.3,
        sample.point3.z + sample.normal.z * side * (roadWidth * 0.5 - 0.44)
      );
      curb.rotation.y = sample.angle;
      curb.castShadow = true;
      curb.receiveShadow = true;
      group.add(curb);
    }
  }
}

function addRubberMarks(group: THREE.Group, samples: readonly TrackSample[], material: THREE.Material): void {
  const markStarts = [16, 72, 142, 198];

  for (const startIndex of markStarts) {
    for (let lane = 0; lane < 2; lane += 1) {
      for (let step = 0; step < 8; step += 1) {
        const sample = samples[(startIndex + step * 2) % samples.length];
        const sideOffset = lane === 0 ? -2.6 : 2.6;
        const mark = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.035, 0.3), material);
        mark.position.set(
          sample.point3.x + sample.normal.x * sideOffset,
          sample.point3.y + 0.245,
          sample.point3.z + sample.normal.z * sideOffset
        );
        mark.rotation.y = sample.angle + 0.035 * Math.sign(sideOffset);
        group.add(mark);
      }
    }
  }
}

function addCurveBarriers(
  group: THREE.Group,
  samples: readonly TrackSample[],
  roadWidth: number,
  wallHeight: number,
  wallThickness: number,
  wallMaterial: THREE.Material,
  railMaterial: THREE.Material
): void {
  for (const side of [-1, 1]) {
    for (let index = 0; index < samples.length; index += 2) {
      const current = samples[index];
      const next = samples[(index + 2) % samples.length];
      const length = Math.hypot(next.point3.x - current.point3.x, next.point3.z - current.point3.z) + 0.8;
      const offset = side * (roadWidth * 0.5 + wallThickness * 0.5);
      const x = current.point3.x + current.normal.x * offset;
      const z = current.point3.z + current.normal.z * offset;

      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, wallHeight, wallThickness), wallMaterial);
      wall.position.set(x, current.point3.y + wallHeight * 0.5, z);
      wall.rotation.y = current.angle;
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, 0.2), railMaterial);
      rail.position.set(
        current.point3.x + current.normal.x * side * (roadWidth * 0.5 + wallThickness + 0.35),
        current.point3.y + wallHeight + 0.42,
        current.point3.z + current.normal.z * side * (roadWidth * 0.5 + wallThickness + 0.35)
      );
      rail.rotation.y = current.angle;
      group.add(rail);
    }
  }
}

function addArrowChevrons(
  group: THREE.Group,
  samples: readonly TrackSample[],
  roadWidth: number,
  material: THREE.Material
): void {
  for (let index = 12; index < samples.length; index += 24) {
    const sample = samples[index];
    const left = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.55), material);
    const right = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.55), material);
    left.position.set(
      sample.point3.x - sample.normal.x * roadWidth * 0.18,
      sample.point3.y + 0.265,
      sample.point3.z - sample.normal.z * roadWidth * 0.18
    );
    right.position.set(
      sample.point3.x + sample.normal.x * roadWidth * 0.18,
      sample.point3.y + 0.265,
      sample.point3.z + sample.normal.z * roadWidth * 0.18
    );
    left.rotation.y = sample.angle + 0.62;
    right.rotation.y = sample.angle - 0.62;
    group.add(left, right);
  }
}

function addBrakeZoneBands(
  group: THREE.Group,
  samples: readonly TrackSample[],
  roadWidth: number,
  material: THREE.Material
): void {
  const brakingZones = [30, 92, 154, 220];

  for (const start of brakingZones) {
    for (let band = 0; band < 4; band += 1) {
      const sample = samples[(start + band * 3) % samples.length];
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(roadWidth * 0.62, 0.06, 0.42), material);
      stripe.position.set(sample.point3.x, sample.point3.y + 0.285, sample.point3.z);
      stripe.rotation.y = sample.angle + Math.PI / 2;
      group.add(stripe);
    }
  }
}

function addCheckpointMarkers(
  group: THREE.Group,
  centerLine: readonly TrackPoint[],
  samples: readonly TrackSample[],
  roadWidth: number,
  checkpointMaterial: THREE.Material,
  finishMaterial: THREE.Material,
  finishDarkMaterial: THREE.Material
): THREE.PointLight[] {
  const gateLights: THREE.PointLight[] = [];

  for (let index = 0; index < centerLine.length; index += 1) {
    const position = centerLine[index];
    const position2d: Vector2 = { x: position.x, z: position.z };
    const sample = findNearestSample(position2d, samples);
    const gateAngle = sample.angle + Math.PI / 2;
    const py = position.y;

    if (index === 0) {
      const finish = createFinishLine(position2d, py, gateAngle, roadWidth, finishMaterial, finishDarkMaterial);
      group.add(finish);
      continue;
    }

    const marker = new THREE.Group();
    marker.name = `Checkpoint${index}`;

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(roadWidth - 2.2, 0.16, 0.7), checkpointMaterial);
    crossbar.position.set(position.x, py + 6.25, position.z);
    crossbar.rotation.y = gateAngle;
    marker.add(crossbar);

    const postGeometry = new THREE.CylinderGeometry(0.28, 0.42, 6.2, 16);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, checkpointMaterial);
      post.position.set(
        position.x + Math.cos(gateAngle) * side * (roadWidth * 0.5 - 0.9),
        py + 3.35,
        position.z - Math.sin(gateAngle) * side * (roadWidth * 0.5 - 0.9)
      );
      post.castShadow = true;
      marker.add(post);
    }

    const halo = new THREE.Mesh(new THREE.TorusGeometry(roadWidth * 0.23, 0.08, 8, 48), checkpointMaterial);
    halo.position.set(position.x, py + 4.35, position.z);
    halo.rotation.x = Math.PI / 2;
    halo.rotation.z = gateAngle;
    marker.add(halo);

    // Dynamic illumination: cyan pool of light under the gate
    const gatePL = new THREE.PointLight(0x3df4d6, 18, 22, 2);
    gatePL.position.set(position.x, py + 3.2, position.z);
    marker.add(gatePL);
    gateLights.push(gatePL);

    group.add(marker);
  }

  return gateLights;
}

function createFinishLine(
  position: Vector2,
  py: number,
  angle: number,
  roadWidth: number,
  lightMaterial: THREE.Material,
  darkMaterial: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = "StartFinishLine";

  const tileCount = 12;
  const tileWidth = (roadWidth - 3) / tileCount;

  const finishGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3266,
    roughness: 0.3,
    emissive: 0xff3266,
    emissiveIntensity: 1.15
  });

  for (let index = 0; index < tileCount; index += 1) {
    const material = index % 2 === 0 ? lightMaterial : darkMaterial;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(tileWidth, 0.16, 2.5), material);
    const offset = -roadWidth * 0.5 + 1.5 + tileWidth * (index + 0.5);
    tile.position.set(position.x + Math.cos(angle) * offset, py + 0.35, position.z - Math.sin(angle) * offset);
    tile.rotation.y = angle;
    group.add(tile);
  }

  const glow = new THREE.Mesh(new THREE.BoxGeometry(roadWidth - 2, 0.08, 0.34), finishGlowMaterial);
  glow.position.set(position.x, py + 0.48, position.z);
  glow.rotation.y = angle;
  group.add(glow);

  return group;
}

function findNearestSample(position: Vector2, samples: readonly TrackSample[]): TrackSample {
  let best = samples[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sample of samples) {
    const distance = Math.hypot(position.x - sample.point.x, position.z - sample.point.z);
    if (distance < bestDistance) {
      best = sample;
      bestDistance = distance;
    }
  }

  return best;
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
