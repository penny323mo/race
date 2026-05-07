import type { TrackConfig } from "../../types";

export const canyonRunConfig: TrackConfig = {
  id: "canyon-run",
  name: "Canyon Run",
  roadWidth: 30,
  unlockCondition: "complete-track-1",
  centerLine: [
    { x:   0, y:  0, z:  70 },   // start (flat)
    { x:  50, y:  2, z:  52 },   // right sweep, gentle rise
    { x:  78, y:  8, z:  10 },   // long uphill straight
    { x:  72, y: 10, z: -30 },   // mountain hairpin (highest point)
    { x:  38, y:  7, z: -58 },   // downhill right sweep
    { x:  -8, y:  2, z: -72 },   // valley approach (wide)
    { x: -50, y: -4, z: -55 },   // valley floor long left arc (lowest point)
    { x: -76, y: -1, z: -12 },   // valley exit left sweep
    { x: -68, y:  3, z:  28 },   // uphill return
    { x: -32, y:  1, z:  58 },   // final sweeping left-hander
    { x:  -8, y:  0, z:  70 },   // connect to start
  ]
};
