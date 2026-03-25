"use client";

import { useEffect, useRef } from "react";

export function usePointerDragRaf(opts?: { deadzonePx?: number }) {
  const deadzone = opts?.deadzonePx ?? 0.25;

  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);

  const onMoveRef = useRef<((x: number, y: number) => void) | null>(null);

  useEffect(() => {
    const flush = () => {
      raf.current = null;
      if (!dragging.current || !last.current) return;
      onMoveRef.current?.(last.current.x, last.current.y);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;

      // deadzone only applies after we have a previous sample
      if (last.current) {
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        if (dx * dx + dy * dy < deadzone * deadzone) return;
      }

      last.current = { x: e.clientX, y: e.clientY };
      if (raf.current == null) raf.current = requestAnimationFrame(flush);
    };

    const stopAll = () => {
      dragging.current = false;
      last.current = null;
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", stopAll);
    window.addEventListener("pointercancel", stopAll);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopAll);
      window.removeEventListener("pointercancel", stopAll);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [deadzone]);

  return {
    setOnMove(fn: (x: number, y: number) => void) {
      onMoveRef.current = fn;
    },

    // IMPORTANT: call start with the pointerdown coords to prevent initial snap
    startAt(clientX: number, clientY: number) {
      dragging.current = true;
      last.current = { x: clientX, y: clientY };

      // apply immediately so first frame says “no jump”
      onMoveRef.current?.(clientX, clientY);
    },

    stop() {
      dragging.current = false;
      last.current = null;
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    },
  };
}
