"use client";

import type React from "react";
import { Redo2, Undo2 } from "lucide-react";
import { useLearnerWorkspaceTranslations as useTranslations } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import { IconChevronRight } from "@zoeskoul/learner-workspace/ide/fullide/icons";
import ResizeSeparator from "../../ui/ResizeSeparator";

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
  const t = useTranslations("ide.explorer.layout");
  const paneT = useTranslations("ide.explorer.pane");
  const explorerAvailable = explorer != null;

  return (
      <div
          ref={splitRef}
          className="grid h-full min-h-0 w-full"
          style={{
            gridTemplateColumns: !explorerAvailable
                ? "minmax(0, 1fr)"
                : explorerCollapsed
                    ? "48px minmax(0, 1fr)"
                    : `minmax(240px, ${leftPct}%) 6px minmax(0, 1fr)`,
          }}
      >
        {!explorerAvailable ? null : explorerCollapsed ? (
            <div className="flex min-h-0 flex-col items-center gap-2 border-r border-neutral-200/80 bg-neutral-50/70 py-3 dark:border-white/10 dark:bg-black/20">
              <button
                  type="button"
                  onClick={onToggleExplorer}
                  aria-label={t("openFileExplorer")}
                  title={t("openFileExplorer")}
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
                        aria-label={paneT("undo")}
                        title={paneT("undoTip")}
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
                        aria-label={paneT("redo")}
                        title={paneT("redoTip")}
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

              <ResizeSeparator
                  orientation="vertical"
                  tabIndex={0}
                  aria-label={t("resizeExplorer")}
                  aria-valuemin={16}
                  aria-valuemax={40}
                  aria-valuenow={Math.round(dividerValue)}
                  onMouseDown={onMouseDownDivider}
                  onPointerDown={onPointerDownDivider}
                  onKeyDown={onKeyDownDivider}
                  title={t("resizeExplorerHelp")}
              />
            </>
        )}

        <div className="min-h-0 min-w-0 overflow-hidden">{editor}</div>
      </div>
  );
}
