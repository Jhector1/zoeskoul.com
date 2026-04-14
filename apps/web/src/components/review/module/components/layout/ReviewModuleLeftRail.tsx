"use client";

import React from "react";
import { cn } from "@/lib/cn";
import ModuleSidebar from "../../components/ModuleSidebar";

type Props = {
    showDesktopLeft: boolean;
    leftCollapsed: boolean;
    leftW: number;
    onResizeStart: (e: React.MouseEvent<HTMLDivElement>) => void;
    padStyle: React.CSSProperties;
    sidebarProps: React.ComponentProps<typeof ModuleSidebar>;
};

export default function ReviewModuleLeftRail({
                                                 showDesktopLeft,
                                                 leftCollapsed,
                                                 leftW,
                                                 onResizeStart,
                                                 padStyle,
                                                 sidebarProps,
                                             }: Props) {
    if (!showDesktopLeft) return null;

    return (
        <>
            <aside
                className={cn(
                    "min-h-0 transition-[width] duration-300 ease-out overflow-hidden",
                    leftCollapsed && "w-0",
                )}
                style={{ width: leftCollapsed ? 0 : leftW }}
            >
                <div className="h-full min-h-0 overflow-auto" style={padStyle}>
                    <ModuleSidebar {...sidebarProps} />
                </div>
            </aside>

            {!leftCollapsed ? (
                <div
                    onMouseDown={onResizeStart}
                    className="w-2 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
                    title="Drag to resize sidebar"
                />
            ) : null}
        </>
    );
}