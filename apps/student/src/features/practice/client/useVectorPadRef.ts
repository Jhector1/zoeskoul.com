// src/features/practice/client/useVectorPadRef.ts
"use client";

import { useEffect, useRef } from "react";
import type { VectorPadState } from "@/components/vectorpad/types";
import type { QItem } from "@/components/practice/practiceType";

export function useVectorPadRef(current: QItem | null) {
  const zHeldRef = useRef(false);

  const padRef = useRef<VectorPadState>({
    mode: "2d",
    scale: 40,
    gridStep: 1,
    snapToGrid: true,
    showGrid: true,
    showComponents: true,
    showAngle: false,
    showProjection: false,
    showUnitB: false,
    showPerp: false,
    depthMode: false,
    a: { x: 0, y: 0, z: 0 } as any,
    b: { x: 2, y: 1, z: 0 } as any,
  });

  useEffect(() => {
    if (!current) return;
    padRef.current.mode = "2d";
    padRef.current.a = { ...(current.dragA as any) };
    padRef.current.b = { ...(current.dragB as any) };
  }, [current]);

  return { padRef, zHeldRef };
}
