import * as THREE from "three";

export function createEnvironment(): THREE.Group {
  const group = new THREE.Group();
  group.name = "ArcadeEnvironment";

  const mountainMaterial = new THREE.MeshStandardMaterial({
    color: 0x29475b,
    roughness: 0.92,
    metalness: 0
  });
  const mountainAccent = new THREE.MeshStandardMaterial({
    color: 0x4b6f75,
    roughness: 0.88
  });
  const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x22313f, roughness: 0.74, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x2f3f4f, roughness: 0.68, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: 0x314653, roughness: 0.7, metalness: 0.02 })
  ];
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x64d7ff,
    roughness: 0.28,
    emissive: 0x1c8fd0,
    emissiveIntensity: 0.82
  });
  const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3126, roughness: 0.86 });
  const treeLeafMaterial = new THREE.MeshStandardMaterial({ color: 0x2d7a58, roughness: 0.88 });
  const bannerMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3266,
    roughness: 0.46,
    emissive: 0x5f0b26,
    emissiveIntensity: 0.48
  });
  const tealBannerMaterial = new THREE.MeshStandardMaterial({
    color: 0x3de1d0,
    roughness: 0.4,
    emissive: 0x0b4d48,
    emissiveIntensity: 0.44
  });
  const floodlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0b5,
    roughness: 0.2,
    emissive: 0xffcf58,
    emissiveIntensity: 1.6
  });
  const asphaltServiceMaterial = new THREE.MeshStandardMaterial({ color: 0x151b22, roughness: 0.8, metalness: 0.03 });
  const tentMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f2e8,
    roughness: 0.62,
    emissive: 0x19140f,
    emissiveIntensity: 0.08
  });
  const magentaGlow = new THREE.MeshStandardMaterial({
    color: 0xff3266,
    roughness: 0.28,
    emissive: 0xff3266,
    emissiveIntensity: 1.45
  });
  const cyanGlow = new THREE.MeshStandardMaterial({
    color: 0x3de1d0,
    roughness: 0.24,
    emissive: 0x3de1d0,
    emissiveIntensity: 1.38
  });

  addStars(group);
  addSkyComposition(group);
  addMountains(group, mountainMaterial, mountainAccent);
  addCityBlocks(group, buildingMaterials, windowMaterial);
  addTrees(group, treeTrunkMaterial, treeLeafMaterial);
  addStartGantry(group, bannerMaterial, tealBannerMaterial);
  addTracksideBanners(group, bannerMaterial, tealBannerMaterial);
  addPitLane(group, asphaltServiceMaterial, tentMaterial, bannerMaterial, tealBannerMaterial);
  addGrandstand(group, windowMaterial, bannerMaterial);
  addFloodlights(group, floodlightMaterial);
  addNeonPylons(group, magentaGlow, cyanGlow);
  addAtmosphericLightBeams(group, cyanGlow, magentaGlow);

  return group;
}

function addStars(group: THREE.Group): void {
  // Layer 1: bright stars
  const countA = 680;
  const posA = new Float32Array(countA * 3);
  for (let i = 0; i < countA; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 0.88);
    const r = 175 + Math.random() * 22;
    posA[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    posA[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 6;
    posA[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geoA = new THREE.BufferGeometry();
  geoA.setAttribute("position", new THREE.BufferAttribute(posA, 3));
  group.add(new THREE.Points(geoA, new THREE.PointsMaterial({
    color: 0xe8f4ff, size: 0.96, sizeAttenuation: true,
    transparent: true, opacity: 0.90, depthWrite: false, fog: false,
  })));

  // Layer 2: dim background stars — more numerous, smaller
  const countB = 520;
  const posB = new Float32Array(countB * 3);
  for (let i = 0; i < countB; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 0.9);
    const r = 190 + Math.random() * 16;
    posB[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    posB[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 4;
    posB[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geoB = new THREE.BufferGeometry();
  geoB.setAttribute("position", new THREE.BufferAttribute(posB, 3));
  group.add(new THREE.Points(geoB, new THREE.PointsMaterial({
    color: 0xb8d8ff, size: 0.48, sizeAttenuation: true,
    transparent: true, opacity: 0.52, depthWrite: false, fog: false,
  })));
}

function addSkyComposition(group: THREE.Group): void {
  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0c9 });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(17, 36), moonMaterial);
  moon.position.set(-82, 82, -168);
  moon.rotation.y = 0.25;
  group.add(moon);

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0x3c5870,
    transparent: true,
    opacity: 0.34,
    depthWrite: false
  });
  const cloudPlacements: readonly [number, number, number, number][] = [
    [-80, 55, -138, 1.2],
    [18, 68, -150, 1.7],
    [112, 52, -118, 1.1],
    [-132, 44, 36, 1.4]
  ];

  for (const [x, y, z, scale] of cloudPlacements) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(42 * scale, 3.2, 5), cloudMaterial);
    cloud.position.set(x, y, z);
    cloud.rotation.y = 0.18;
    group.add(cloud);
  }
}

function addMountains(group: THREE.Group, baseMaterial: THREE.Material, accentMaterial: THREE.Material): void {
  const placements: readonly [number, number, number, number, THREE.Material][] = [
    [-135, -120, 42, 42, baseMaterial],
    [-90, -150, 54, 58, accentMaterial],
    [18, -156, 48, 50, baseMaterial],
    [92, -132, 40, 46, accentMaterial],
    [146, -62, 44, 52, baseMaterial],
    [-152, 74, 50, 54, accentMaterial]
  ];

  for (const [x, z, radius, height, material] of placements) {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), material);
    mountain.position.set(x, height * 0.5 - 1, z);
    mountain.rotation.y = (x + z) * 0.01;
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    group.add(mountain);
  }
}

function addCityBlocks(
  group: THREE.Group,
  buildingMaterials: readonly THREE.Material[],
  windowMaterial: THREE.Material
): void {
  const placements: readonly [number, number, number, number, number][] = [
    [104, 72, 14, 28, 12],
    [122, 83, 11, 36, 10],
    [139, 64, 15, 24, 13],
    [119, 48, 10, 30, 12],
    [-125, -88, 12, 32, 12],
    [-144, -72, 16, 24, 14],
    [-108, -104, 10, 38, 10]
  ];

  placements.forEach(([x, z, width, height, depth], index) => {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      buildingMaterials[index % buildingMaterials.length]
    );
    building.position.set(x, height * 0.5, z);
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);

    for (let row = 0; row < Math.floor(height / 7); row += 1) {
      const windowBand = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.7, 0.08), windowMaterial);
      windowBand.position.set(x, 5 + row * 6.2, z - depth * 0.5 - 0.05);
      group.add(windowBand);
    }
  });

  const towerGlow = new THREE.MeshStandardMaterial({
    color: 0xffd75f,
    roughness: 0.24,
    emissive: 0xffb92e,
    emissiveIntensity: 1.05
  });
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 1), towerGlow);
  beacon.position.set(122, 42, 77);
  group.add(beacon);
}

function addTrees(group: THREE.Group, trunkMaterial: THREE.Material, leafMaterial: THREE.Material): void {
  const placements: readonly [number, number, number][] = [
    [-34, 92, 1.1],
    [-52, 88, 0.9],
    [42, 86, 1.0],
    [82, -46, 1.15],
    [54, -92, 0.95],
    [-62, -88, 1.0],
    [-96, -12, 1.2],
    [-98, 34, 0.9],
    [96, 28, 1.05],
    [88, 8, 0.85],
    [12, -104, 1.05],
    [-12, -100, 0.95]
  ];

  for (const [x, z, scale] of placements) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * scale, 0.62 * scale, 4 * scale, 7), trunkMaterial);
    trunk.position.y = 2 * scale;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2 * scale, 6.4 * scale, 7), leafMaterial);
    crown.position.y = 6.4 * scale;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    group.add(tree);
  }
}

function addStartGantry(
  group: THREE.Group,
  bannerMaterial: THREE.Material,
  tealBannerMaterial: THREE.Material
): void {
  const gantry = new THREE.Group();
  gantry.name = "StartGantry";

  const metal = new THREE.MeshStandardMaterial({ color: 0xd6dde5, roughness: 0.42, metalness: 0.22 });
  const legGeometry = new THREE.BoxGeometry(0.7, 13, 0.7);
  for (const x of [-12, 12]) {
    const leg = new THREE.Mesh(legGeometry, metal);
    leg.position.set(x, 6.5, 0);
    leg.castShadow = true;
    gantry.add(leg);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(25, 2.4, 0.9), bannerMaterial);
  header.position.set(0, 14.1, 0);
  header.castShadow = true;
  gantry.add(header);

  const lightGeometry = new THREE.BoxGeometry(2.6, 0.55, 0.4);
  for (let index = 0; index < 5; index += 1) {
    const light = new THREE.Mesh(lightGeometry, index % 2 === 0 ? tealBannerMaterial : bannerMaterial);
    light.position.set(-6 + index * 3, 11.55, -0.58);
    gantry.add(light);
  }

  gantry.position.set(-4, 0, 72);
  gantry.rotation.y = -0.26;
  group.add(gantry);
}

function addTracksideBanners(
  group: THREE.Group,
  bannerMaterial: THREE.Material,
  tealBannerMaterial: THREE.Material
): void {
  const placements: readonly [number, number, number, THREE.Material][] = [
    [74, 32, -0.92, bannerMaterial],
    [70, -20, -1.34, tealBannerMaterial],
    [28, -76, -2.5, bannerMaterial],
    [-54, -70, 2.28, tealBannerMaterial],
    [-84, 18, 1.32, bannerMaterial],
    [-38, 78, 0.16, tealBannerMaterial]
  ];

  for (const [x, z, rotation, material] of placements) {
    const banner = new THREE.Mesh(new THREE.BoxGeometry(14, 4.2, 0.45), material);
    banner.position.set(x, 3.2, z);
    banner.rotation.y = rotation;
    banner.castShadow = true;
    group.add(banner);
  }
}

function addPitLane(
  group: THREE.Group,
  asphaltMaterial: THREE.Material,
  tentMaterial: THREE.Material,
  redMaterial: THREE.Material,
  tealMaterial: THREE.Material
): void {
  const serviceRoad = new THREE.Mesh(new THREE.BoxGeometry(44, 0.12, 8), asphaltMaterial);
  serviceRoad.position.set(24, 0.04, 91);
  serviceRoad.rotation.y = -0.24;
  serviceRoad.receiveShadow = true;
  group.add(serviceRoad);

  const colors = [redMaterial, tealMaterial, tentMaterial];
  for (let index = 0; index < 5; index += 1) {
    const tent = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.4, 5.2), tentMaterial);
    base.position.y = 1.2;
    base.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.2, 4), colors[index % colors.length]);
    roof.position.y = 3.5;
    roof.rotation.y = Math.PI * 0.25;
    roof.castShadow = true;
    tent.add(base, roof);
    tent.position.set(5 + index * 8.5, 0, 99 + Math.sin(index) * 1.6);
    tent.rotation.y = -0.24;
    group.add(tent);
  }
}

function addGrandstand(group: THREE.Group, seatMaterial: THREE.Material, bannerMaterial: THREE.Material): void {
  const stand = new THREE.Group();
  stand.name = "Grandstand";
  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0x273240, roughness: 0.62, metalness: 0.12 });

  for (let row = 0; row < 5; row += 1) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(34, 1.05, 2.2), row % 2 === 0 ? seatMaterial : structureMaterial);
    bench.position.set(0, 1 + row * 1.05, -row * 1.8);
    bench.castShadow = true;
    stand.add(bench);
  }

  const rearBanner = new THREE.Mesh(new THREE.BoxGeometry(36, 3, 0.6), bannerMaterial);
  rearBanner.position.set(0, 7.2, -10.2);
  rearBanner.castShadow = true;
  stand.add(rearBanner);
  stand.position.set(-66, 0, 72);
  stand.rotation.y = 0.4;
  group.add(stand);
}

function addFloodlights(group: THREE.Group, lightMaterial: THREE.Material): void {
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xc7d2dc, roughness: 0.38, metalness: 0.32 });
  const placements: readonly [number, number, number][] = [
    [-52, 82, 0.35],
    [76, 56, -0.7],
    [76, -52, -1.8],
    [-78, -48, 2.1]
  ];

  for (const [x, z, rotation] of placements) {
    const pole = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 18, 8), poleMaterial);
    mast.position.y = 9;
    mast.castShadow = true;
    pole.add(mast);

    for (let index = 0; index < 3; index += 1) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.42), lightMaterial);
      lamp.position.set(-2.4 + index * 2.4, 17.6, -0.4);
      lamp.rotation.x = -0.32;
      pole.add(lamp);
    }

    const glow = new THREE.PointLight(0xffe6a8, 130, 54, 2.0);
    glow.position.set(0, 17, 0);
    pole.add(glow);
    pole.position.set(x, 0, z);
    pole.rotation.y = rotation;
    group.add(pole);
  }
}

function addNeonPylons(group: THREE.Group, magentaMaterial: THREE.Material, cyanMaterial: THREE.Material): void {
  const placements: readonly [number, number, THREE.Material, number][] = [
    [56, 88, magentaMaterial, -0.2],
    [-44, 92, cyanMaterial, 0.12],
    [92, -4, cyanMaterial, -0.9],
    [50, -92, magentaMaterial, -2.7],
    [-82, -56, cyanMaterial, 2.25],
    [-96, 30, magentaMaterial, 1.2]
  ];

  for (const [x, z, material, rotation] of placements) {
    const pylon = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.7, 11, 0.7), material);
    mast.position.y = 5.5;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(5, 0.65, 0.55), material);
    cap.position.y = 11.4;
    pylon.add(mast, cap);
    // Real light pool from each pylon cap
    const pylonColor = material === magentaMaterial ? 0xff3266 : 0x3de1d0;
    const pylonLight = new THREE.PointLight(pylonColor, 44, 46, 1.8);
    pylonLight.position.set(0, 11, 0);
    pylon.add(pylonLight);
    pylon.position.set(x, 0, z);
    pylon.rotation.y = rotation;
    group.add(pylon);
  }
}

function addAtmosphericLightBeams(
  group: THREE.Group,
  cyanMaterialSource: THREE.Material,
  magentaMaterialSource: THREE.Material
): void {
  const beamMaterials = [cyanMaterialSource, magentaMaterialSource].map((source) => {
    const color = source instanceof THREE.MeshStandardMaterial ? source.color : new THREE.Color(0xffffff);
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.082,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  });

  const placements: readonly [number, number, number, number][] = [
    [-58, 72, 0.45, 0],
    [76, 46, -0.62, 1],
    [70, -54, -1.9, 0],
    [-72, -42, 2.2, 1]
  ];

  for (const [x, z, rotation, materialIndex] of placements) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(5.4, 34, 18, 1, true), beamMaterials[materialIndex]);
    beam.position.set(x, 24, z);
    beam.rotation.x = Math.PI;
    beam.rotation.z = 0.18;
    beam.rotation.y = rotation;
    group.add(beam);
  }
}
