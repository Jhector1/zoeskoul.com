"use client";

import React from "react";
import { cn } from "@/lib/cn";
import ToolsPanel from "@/components/tools/ToolsPanel";

type Props = {
    showDesktopRight: boolean;
    rightCollapsed: boolean;
    rightW: number;
    onResizeStart: (e: React.MouseEvent<HTMLDivElement>) => void;
    toolsPanelProps: React.ComponentProps<typeof ToolsPanel>;
};

export default function ReviewModuleRightRail({
                                                  showDesktopRight,
                                                  rightCollapsed,
                                                  rightW,
                                                  onResizeStart,
                                                  toolsPanelProps,
                                              }: Props) {
    if (!showDesktopRight) return null;

    return (
        <>
            {!rightCollapsed ? (
                <div
                    onMouseDown={onResizeStart}
                    className="w-2 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
                    title="Drag to resize tools panel"
                />
            ) : null}

            <aside
                className={cn(
                    "min-h-0 transition-[width] duration-300 ease-out overflow-hidden",
                    rightCollapsed && "w-0",
                )}
                style={{ width: rightCollapsed ? 0 : rightW }}
            >
                <ToolsPanel {...toolsPanelProps} />
            </aside>
        </>
    );
}