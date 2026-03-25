"use client";

import React, { createContext, useContext, useMemo, useRef } from "react";
import type { VectorPadState } from "@/components/vectorpad/types";
import type { Vec3 } from "@/lib/math/vec3";

type Store = {
  stateRef: React.MutableRefObject<VectorPadState>;
  zHeldRef: React.MutableRefObject<boolean>;
};

const Ctx = createContext<Store | null>(null);

const DEFAULT_A: Vec3 = { x: 3, y: 2, z: 0 };
const DEFAULT_B: Vec3 = { x: 2, y: 4, z: 0 };

export function VectorPadStoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // IMPORTANT: clone defaults so we never mutate shared constants
  const stateRef = useRef<VectorPadState>({
    a: { ...DEFAULT_A },
    b: { ...DEFAULT_B },

    // shared pad settings
    scale: 80,
    showGrid: true,
    autoGridStep: true,
    snapToGrid: true,
    gridStep: 1,

    showComponents: true,
    showAngle: true,
    showProjection: true,
    showPerp: false,
    showUnitB: false,

    depthMode: false,

    // span-module fields
    view: "span",
    showSpan: true,
    showCell: true,
    alpha: 1,
    beta: 1,
  });

  const zHeldRef = useRef(false);

  // stable object identity
  const value = useMemo<Store>(() => ({ stateRef, zHeldRef }), []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVectorPadStore() {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useVectorPadStore must be used inside VectorPadStoreProvider"
    );
  }
  return v;
}
