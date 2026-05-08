import type { TrackConfig } from "../../types";

export const neonRidgeConfig: TrackConfig = {
  id: "neon-ridge",
  name: "Neon Ridge",
  roadWidth: 26,
  unlockCondition: "always",
  centerLine: [
    { x:   0, y: 0, z:  72 },   // start/finish
    { x:  52, y: 0, z:  58 },   // long right sweep entry
    { x:  82, y: 0, z:  14 },   // sweep apex
    { x:  70, y: 0, z: -38 },   // fast right-hand kink
    { x:  18, y: 0, z: -76 },   // hairpin approach
    { x: -10, y: 0, z: -82 },   // hairpin apex (tight)
    { x: -48, y: 0, z: -62 },   // left sweep out of hairpin
    { x: -82, y: 0, z: -14 },   // long left arc
    { x: -68, y: 0, z:  40 },   // back straight entry
    { x: -22, y: 0, z:  68 },   // last long left-hand sweep
  ]
};
