"use client";

import React from "react";
import { cn } from "@zoeskoul/learner-ui/lib/cn";

export type ReviewModuleLeftRailProps = {
  showDesktopLeft: boolean;
  leftCollapsed: boolean;
  leftW: number;
  onResizeStart: (
    e: React.MouseEvent<HTMLDivElement>,
  ) => void;
  padStyle: React.CSSProperties;
  sidebar: React.ReactNode;
};

export default function ReviewModuleLeftRail({
  showDesktopLeft,
  leftCollapsed,
  leftW,
  onResizeStart,
  padStyle,
  sidebar,
}: ReviewModuleLeftRailProps) {
  if (!showDesktopLeft) return null;

  return (
    <>
      <aside
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
        <div
          onMouseDown={onResizeStart}
          className="w-2 shrink-0 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
          title="Drag to resize sidebar"
        />
      ) : null}
    </>
  );
}
