"use client";

import type React from "react";
import { Redo2, Undo2 } from "lucide-react";
import { IconChevronRight } from "../icons";

export default function IdeDesktopLayout({
                                           splitRef,
                                           leftPct,
                                           dividerValue,
                                           onMouseDownDivider,
                                           onPointerDownDivider,
                                           onKeyDownDivider,
                                           explorer,
                                           editor,
                                           explorerCollapsed,
                                           onToggleExplorer,
                                           showHistoryControls = false,
                                           canUndo = false,
                                           canRedo = false,
                                           onUndo,
                                           onRedo,
                                         }: {
  splitRef: React.RefObject<HTMLDivElement | null>;
  leftPct: number;
  dividerValue: number;
  onMouseDownDivider: React.MouseEventHandler<HTMLDivElement>;
  onPointerDownDivider: React.PointerEventHandler<HTMLDivElement>;
  onKeyDownDivider: React.KeyboardEventHandler<HTMLDivElement>;
  explorer: React.ReactNode;
  editor: React.ReactNode;
  explorerCollapsed: boolean;
  onToggleExplorer: () => void;
  showHistoryControls?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  return (
      <div
          ref={splitRef}
          className="grid h-full min-h-0 w-full"
          style={{
            gridTemplateColumns: explorerCollapsed
                ? "48px minmax(0, 1fr)"
                : `minmax(240px, ${leftPct}%) 6px minmax(0, 1fr)`,
          }}
      >
        {explorerCollapsed ? (
            <div className="flex min-h-0 flex-col items-center gap-2 border-r border-neutral-200/80 bg-neutral-50/70 py-3 dark:border-white/10 dark:bg-black/20">
              <button
                  type="button"
                  onClick={onToggleExplorer}
                  aria-label="Open file explorer"
                  title="Open file explorer"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
              >
                <IconChevronRight className="h-4 w-4" />
              </button>

              {showHistoryControls ? (
                  <div className="mt-1 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo || !onUndo}
                        aria-label="Undo"
                        title="Undo (Ctrl/Cmd+Z)"
                        className={
                          canUndo && onUndo
                              ? "grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                              : "grid h-8 w-8 cursor-not-allowed place-items-center rounded-lg border border-neutral-200/70 bg-neutral-100 text-neutral-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/25"
                        }
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>

                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo || !onRedo}
                        aria-label="Redo"
                        title="Redo (Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y)"
                        className={
                          canRedo && onRedo
                              ? "grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                              : "grid h-8 w-8 cursor-not-allowed place-items-center rounded-lg border border-neutral-200/70 bg-neutral-100 text-neutral-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/25"
                        }
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
              ) : null}
            </div>
        ) : (
            <>
              <div className="min-h-0 border-r border-neutral-200/80 dark:border-white/10">
                {explorer}
              </div>

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
                  className="w-[6px] shrink-0 cursor-col-resize bg-neutral-200/45 outline-none transition-colors hover:bg-neutral-300/60 focus:bg-neutral-300/60 dark:bg-white/[0.04] dark:hover:bg-white/[0.09] dark:focus:bg-white/[0.09]"
                  title="Drag or use arrow keys to resize explorer"
              />
            </>
        )}

        <div className="min-h-0 min-w-0 overflow-hidden">{editor}</div>
      </div>
  );
}
