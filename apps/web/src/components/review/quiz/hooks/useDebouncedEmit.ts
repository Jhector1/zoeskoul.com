// src/components/review/quiz/hooks/useDebouncedEmit.ts
import { useEffect, useRef } from "react";

export function useDebouncedEmit<T>(
  value: T,
  emit: (v: T) => void,
  opts?: { delayMs?: number; enabled?: boolean },
) {
  const delayMs = opts?.delayMs ?? 400;
  const enabled = opts?.enabled ?? true;

  const lastSnapRef = useRef<string>("");

  // lets caller “prime” dedupe (so initial hydrate doesn’t spam parent)
  function prime(next: T) {
    lastSnapRef.current = JSON.stringify(next);
  }

  useEffect(() => {
    if (!enabled) return;

    const snap = JSON.stringify(value);
    if (snap === lastSnapRef.current) return;

    const t = setTimeout(() => {
      const snap2 = JSON.stringify(value);
      if (snap2 === lastSnapRef.current) return;
      lastSnapRef.current = snap2;
      emit(value);
    }, delayMs);

    return () => clearTimeout(t);
  }, [value, emit, delayMs, enabled]);

  return { prime };
}
