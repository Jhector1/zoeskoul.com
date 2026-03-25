"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useRafForceUpdate() {
  const [, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  const bump = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return bump;
}
