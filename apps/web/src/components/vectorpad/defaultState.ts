import type { VectorPadState } from "@/components/vectorpad/types";

export function defaultVectorPadState(): VectorPadState {
  return {
    scale: 26,
    gridStep: 1,
    autoGridStep: true,
    snapToGrid: true,
    showGrid: true,
    showComponents: true,

    showAngle: false,
    showProjection: false,
    showUnitB: false,
    showPerp: false,

    depthMode: false,

    a: { x: 0, y: 0, z: 0 },
    b: { x: 2, y: 1, z: 0 },
  } as VectorPadState;
}
