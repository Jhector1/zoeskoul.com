"use client";

import React from "react";
import { cn } from "@zoeskoul/learner-ui/lib/cn";
import ResizeSeparator from "../../../ui/ResizeSeparator";

export type ReviewModuleLeftRailProps = {
  showDesktopLeft: boolean;
  leftCollapsed: boolean;
  leftW: number;
  onResizeStart: React.PointerEventHandler<HTMLDivElement>;
  onResizeKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  padStyle: React.CSSProperties;
  sidebar: React.ReactNode;
};

export default function ReviewModuleLeftRail({
  showDesktopLeft,
  leftCollapsed,
  leftW,
  onResizeStart,
  onResizeKeyDown,
  padStyle,
  sidebar,
}: ReviewModuleLeftRailProps) {
  if (!showDesktopLeft) return null;

  return (
    <>
      <aside
        data-review-left-rail
        className={cn(
          "min-h-0 shrink-0 transition-[width] duration-300 ease-out overflow-hidden",
          leftCollapsed && "w-0",
        )}
        style={{
          width: leftCollapsed ? 0 : leftW,
        }}
      >
        <div
          className="h-full min-h-0 overflow-auto"
          style={padStyle}
        >
          {sidebar}
        </div>
      </aside>

      {!leftCollapsed ? (
        <ResizeSeparator
          orientation="vertical"
          tabIndex={0}
          aria-label="Resize topics panel"
          aria-valuemin={48}
          aria-valuenow={Math.round(leftW)}
          onPointerDown={onResizeStart}
          onKeyDown={onResizeKeyDown}
          data-review-left-resize-handle
          title="Drag to resize sidebar"
        />
      ) : null}
    </>
  );
}
