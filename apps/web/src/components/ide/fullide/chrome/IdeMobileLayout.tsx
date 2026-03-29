"use client";

import type React from "react";

const MOBILE_BTN =
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium transition-colors text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90";

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
            <div className="absolute inset-0 z-20 flex min-h-0 bg-black/30 backdrop-blur-[1px] lg:hidden">
              <div className="flex h-full w-[85%] max-w-sm min-h-0 flex-col border-r border-neutral-200 bg-white/96 shadow-xl dark:border-white/10 dark:bg-neutral-950/96">
                <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-white/10">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                    Files
                  </div>

                  <button type="button" onClick={onClose} className={MOBILE_BTN}>
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