// src/components/review/quiz/hooks/useDebouncedEmit.ts
import { useCallback, useEffect, useRef } from "react";

export function useDebouncedEmit<T>(
  value: T,
  emit: (v: T) => void,
  opts?: { delayMs?: number; enabled?: boolean },
) {
  const delayMs = opts?.delayMs ?? 400;
  const enabled = opts?.enabled ?? true;

  const lastSnapRef = useRef<string>("");
  const latestRef = useRef(value);
  const emitRef = useRef(emit);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<number | null>(null);

  latestRef.current = value;
  emitRef.current = emit;
  enabledRef.current = enabled;

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    cancel();
    if (!enabledRef.current) return;

    const latest = latestRef.current;
    const snap = JSON.stringify(latest);
    if (snap === lastSnapRef.current) return;

    lastSnapRef.current = snap;
    emitRef.current(latest);
  }, [cancel]);

  // Lets caller prime dedupe so initial hydrate does not spam parent.
  const prime = useCallback((next: T) => {
    lastSnapRef.current = JSON.stringify(next);
  }, []);

  useEffect(() => {
    if (!enabled) {
      cancel();
      return;
    }

    const snap = JSON.stringify(value);
    if (snap === lastSnapRef.current) return;

    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delayMs);

    return cancel;
  }, [value, delayMs, enabled, flush, cancel]);

  useEffect(() => cancel, [cancel]);

  return { prime, flush, cancel };
}
