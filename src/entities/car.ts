import * as THREE from "three";

export interface CarEntity {
  readonly group: THREE.Group;
}

export function createCar(): CarEntity {
  const group = new THREE.Group();
  return { group };
}
