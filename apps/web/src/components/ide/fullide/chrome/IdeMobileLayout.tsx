"use client";

import type React from "react";

import { IconChevronRight } from "../icons";

const MOBILE_BTN =
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium transition-colors text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90";

const EXPLORER_RAIL_BTN =
    "grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]";

export default function IdeMobileLayout({
                                          open,
                                          onOpen,
                                          onClose,
                                          explorer,
                                          editor,
                                          showExplorerRail = true,
                                        }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  explorer: React.ReactNode;
  editor: React.ReactNode;
  showExplorerRail?: boolean;
}) {
  return (
      <div className="relative flex h-full min-h-0 w-full overflow-hidden">
        {showExplorerRail ? (
            <div
                data-testid="mobile-explorer-rail"
                className="z-10 flex w-12 shrink-0 flex-col items-center border-r border-neutral-200/80 bg-neutral-50/80 py-3 dark:border-white/10 dark:bg-black/25"
            >
              <button
                  type="button"
                  onClick={onOpen}
                  aria-label="Open file explorer"
                  title="Open file explorer"
                  className={EXPLORER_RAIL_BTN}
              >
                <IconChevronRight className="h-4 w-4" />
              </button>
            </div>
        ) : null}

        <div className="h-full min-h-0 min-w-0 flex-1">{editor}</div>

        {open ? (
            <div className="absolute inset-0 z-20 flex min-h-0 bg-black/30 backdrop-blur-[1px] lg:hidden">
              <div className="flex h-full min-h-0 w-[85%] max-w-sm flex-col border-r border-neutral-200 bg-white/96 shadow-xl dark:border-white/10 dark:bg-neutral-950/96">
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
      </div>
  );
}
