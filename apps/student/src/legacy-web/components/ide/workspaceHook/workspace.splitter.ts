import type React from "react";

import { clamp } from "../utils";
import { MIN_LEFT_PX, MIN_RIGHT_PX, SPLIT_PX } from "./workspace.constants";

export function clampLeftPctFromWidth(nextPctRaw: number, width: number) {
  const minPct = (MIN_LEFT_PX / width) * 100;
  const maxPct = ((width - SPLIT_PX - MIN_RIGHT_PX) / width) * 100;

  const safeMin = Math.max(0, minPct);
  const safeMax = Math.max(safeMin, maxPct);

  return clamp(nextPctRaw, safeMin, safeMax);
}

export function beginDividerDrag(args: {
  clientX: number;
  rootEl: HTMLElement | null;
  leftPct: number;
  dragRef: React.MutableRefObject<{ startX: number; startPct: number } | null>;
  setLeftPct: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { clientX, rootEl, leftPct, dragRef, setLeftPct } = args;
  if (!rootEl) return;

  dragRef.current = { startX: clientX, startPct: leftPct };

  const prevSelect = document.body.style.userSelect;
  const prevCursor = document.body.style.cursor;

  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";

  const onMove = (ev: PointerEvent | MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;

    const rect = rootEl.getBoundingClientRect();
    if (!rect.width) return;

    const dx = ev.clientX - d.startX;
    const pctDelta = (dx / rect.width) * 100;
    setLeftPct(clampLeftPctFromWidth(d.startPct + pctDelta, rect.width));
  };

  const onUp = () => {
    dragRef.current = null;
    document.body.style.userSelect = prevSelect;
    document.body.style.cursor = prevCursor;
    window.removeEventListener("pointermove", onMove as EventListener);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("mousemove", onMove as EventListener);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("pointermove", onMove as EventListener);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("mousemove", onMove as EventListener);
  window.addEventListener("mouseup", onUp);
}

export function handleDividerKeyDown(args: {
  e: React.KeyboardEvent;
  rootEl: HTMLElement | null;
  setLeftPct: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { e, rootEl, setLeftPct } = args;
  if (!rootEl) return;

  const rect = rootEl.getBoundingClientRect();
  if (!rect.width) return;

  const smallStepPct = (24 / rect.width) * 100;
  const bigStepPct = (96 / rect.width) * 100;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    setLeftPct((prev) => clampLeftPctFromWidth(prev - smallStepPct, rect.width));
    return;
  }

  if (e.key === "ArrowRight") {
    e.preventDefault();
    setLeftPct((prev) => clampLeftPctFromWidth(prev + smallStepPct, rect.width));
    return;
  }

  if (e.key === "Home") {
    e.preventDefault();
    setLeftPct(clampLeftPctFromWidth((MIN_LEFT_PX / rect.width) * 100, rect.width));
    return;
  }

  if (e.key === "End") {
    e.preventDefault();
    setLeftPct(
      clampLeftPctFromWidth(
        ((rect.width - SPLIT_PX - MIN_RIGHT_PX) / rect.width) * 100,
        rect.width,
      ),
    );
    return;
  }

  if (e.key === "PageUp") {
    e.preventDefault();
    setLeftPct((prev) => clampLeftPctFromWidth(prev - bigStepPct, rect.width));
    return;
  }

  if (e.key === "PageDown") {
    e.preventDefault();
    setLeftPct((prev) => clampLeftPctFromWidth(prev + bigStepPct, rect.width));
  }
}
