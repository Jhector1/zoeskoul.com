// src/components/vectorpad/shared.ts
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { VectorPadState } from "@/components/vectorpad/types";

/**
 * Shallow-merge defaults into an existing VectorPadState ref.
 * Preserves existing values, fills missing keys.
 */
export function ensureVectorPadState(
  st: VectorPadState,
  defaults: VectorPadState
) {
  const merged: VectorPadState = {
    ...defaults,
    ...st,
    a: { ...defaults.a, ...(st.a ?? {}) },
    b: { ...defaults.b, ...(st.b ?? {}) },
  };
  Object.assign(st, merged);
  return st;
}

export function useForceUpdate() {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((t) => t + 1), []);
}

/**
 * Returns a function that will call `fn` at most once per animation frame.
 * Great for "drag preview" UI updates.
 */
export function useRafThrottle(fn: () => void) {
  const rafRef = useRef<number | null>(null);

  return useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      fn();
    });
  }, [fn]);
}

/**
 * Tracks Z key to support 3D depth dragging.
 * Writes into zHeldRef.current and also provides a UI boolean.
 */
export function useZHeld(zHeldRef: React.MutableRefObject<boolean>) {
  const [zKeyUI, setZKeyUI] = useState(false);

  useEffect(() => {
    const isZ = (e: KeyboardEvent) =>
      e.code === "KeyZ" || e.key === "z" || e.key === "Z";

    const down = (e: KeyboardEvent) => {
      if (!isZ(e)) return;
      zHeldRef.current = true;
      setZKeyUI(true);
    };

    const up = (e: KeyboardEvent) => {
      if (!isZ(e)) return;
      zHeldRef.current = false;
      setZKeyUI(false);
    };

    const blur = () => {
      zHeldRef.current = false;
      setZKeyUI(false);
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);

    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [zHeldRef]);

  return { zKeyUI };
}
