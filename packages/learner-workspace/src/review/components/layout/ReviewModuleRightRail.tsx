"use client";

import React from "react";
import { cn } from "@zoeskoul/learner-ui/lib/cn";

export type ReviewModuleRightRailProps = {
  showDesktopRight: boolean;
  rightCollapsed: boolean;
  rightW: number;
  shouldRenderStackedTools?: boolean;
  containerRef?: React.Ref<HTMLElement>;
  onResizeStart: (
    e: React.MouseEvent<HTMLDivElement>,
  ) => void;
  toolsPanel: React.ReactNode;
};

export default function ReviewModuleRightRail({
  showDesktopRight,
  rightCollapsed,
  rightW,
  onResizeStart,
  toolsPanel,
}: ReviewModuleRightRailProps) {
  if (!showDesktopRight) return null;

  return (
    <>
      {!rightCollapsed ? (
        <div
          onMouseDown={onResizeStart}
          className="w-2 shrink-0 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
          title="Drag to resize tools panel"
        />
      ) : null}

      <aside
        className={cn(
          "min-h-0 shrink-0 transition-[width] duration-300 ease-out overflow-hidden",
          rightCollapsed && "w-0",
        )}
        style={{
          width: rightCollapsed ? 0 : rightW,
        }}
      >
        {toolsPanel}
      </aside>
    </>
  );
}
