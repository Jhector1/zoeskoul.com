"use client";

import type React from "react";

import { ACTION_BTN_CLASS } from "../../constants";

export default function IdeMobileLayout({
  open,
  onClose,
  explorer,
  editor,
}: {
  open: boolean;
  onClose: () => void;
  explorer: React.ReactNode;
  editor: React.ReactNode;
}) {
  return (
    <div className="relative h-full min-h-0">
      {open ? (
        <div className="absolute inset-0 z-20 flex min-h-0 bg-black/40 lg:hidden">
          <div className="flex h-full w-[85%] max-w-sm min-h-0 flex-col border-r border-neutral-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-3 dark:border-white/10">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                Files
              </div>
              <button type="button" onClick={onClose} className={ACTION_BTN_CLASS}>
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1">{explorer}</div>
          </div>

          <button
            type="button"
            className="flex-1"
            onClick={onClose}
            aria-label="Close files panel"
          />
        </div>
      ) : null}

      <div className="h-full min-h-0">{editor}</div>
    </div>
  );
}
