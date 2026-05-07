import * as THREE from "three";

export interface TrackEntity {
  readonly group: THREE.Group;
}

export function createTrack(): TrackEntity {
  const group = new THREE.Group();
  return { group };
}
