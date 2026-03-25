"use client";

import type React from "react";

export default function IdeDesktopLayout({
  splitRef,
  leftPct,
  dividerValue,
  onMouseDownDivider,
  onPointerDownDivider,
  onKeyDownDivider,
  explorer,
  editor,
}: {
  splitRef: React.RefObject<HTMLDivElement | null>;
  leftPct: number;
  dividerValue: number;
  onMouseDownDivider: React.MouseEventHandler<HTMLDivElement>;
  onPointerDownDivider: React.PointerEventHandler<HTMLDivElement>;
  onKeyDownDivider: React.KeyboardEventHandler<HTMLDivElement>;
  explorer: React.ReactNode;
  editor: React.ReactNode;
}) {
  return (
    <div
      ref={splitRef}
      className="grid h-full min-h-0 w-full"
      style={{ gridTemplateColumns: `minmax(260px, ${leftPct}%) 8px minmax(0, 1fr)` }}
    >
      <div className="min-h-0 border-r border-neutral-200 dark:border-white/10">{explorer}</div>

      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize explorer"
        aria-valuemin={16}
        aria-valuemax={40}
        aria-valuenow={Math.round(dividerValue)}
        onMouseDown={onMouseDownDivider}
        onPointerDown={onPointerDownDivider}
        onKeyDown={onKeyDownDivider}
        className="w-2 shrink-0 cursor-col-resize bg-neutral-200/60 outline-none hover:bg-neutral-300/70 focus:bg-neutral-300/70 dark:bg-white/5 dark:hover:bg-white/10 dark:focus:bg-white/10"
        title="Drag or use arrow keys to resize explorer"
      />

      <div className="min-h-0 min-w-0 overflow-hidden">{editor}</div>
    </div>
  );
}
