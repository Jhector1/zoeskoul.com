"use client";

import React from "react";
import { cn } from "@zoeskoul/learner-ui/lib/cn";
import ResizeSeparator from "../../../ui/ResizeSeparator";

export type ReviewModuleRightRailProps = {
  showDesktopRight: boolean;
  rightCollapsed: boolean;
  rightW: number;
  shouldRenderStackedTools?: boolean;
  containerRef?: React.Ref<HTMLElement>;
  onResizeStart: React.PointerEventHandler<HTMLDivElement>;
  onResizeKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  toolsPanel: React.ReactNode;
};

export default function ReviewModuleRightRail({
  showDesktopRight,
  rightCollapsed,
  rightW,
  containerRef,
  onResizeStart,
  onResizeKeyDown,
  toolsPanel,
}: ReviewModuleRightRailProps) {
  if (!showDesktopRight) return null;

  return (
    <>
      {!rightCollapsed ? (
        <ResizeSeparator
          orientation="vertical"
          tabIndex={0}
          aria-label="Resize tools panel"
          aria-valuemin={48}
          aria-valuenow={Math.round(rightW)}
          onPointerDown={onResizeStart}
          onKeyDown={onResizeKeyDown}
          data-review-right-resize-handle
          title="Drag to resize tools panel"
        />
      ) : null}

      <aside
        ref={containerRef}
        data-review-right-rail
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
