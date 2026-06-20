"use client";

import React from "react";
import ToolsPanel from "@/components/tools/ToolsPanel";

type Props = {
    showDesktopRight: boolean;
    rightCollapsed: boolean;
    shouldRenderStackedTools?: boolean;
    containerRef?: React.Ref<HTMLElement>;
    displayMode?: "stacked" | "tab";
    toolsPanelProps: React.ComponentProps<typeof ToolsPanel>;
};

export default function ReviewModuleStackedTools({
    showDesktopRight,
    rightCollapsed,
    shouldRenderStackedTools = false,
    containerRef,
    displayMode = "stacked",
    toolsPanelProps,
}: Props) {
    const isTabMode = displayMode === "tab";

    if (showDesktopRight || (!isTabMode && rightCollapsed) || !shouldRenderStackedTools) return null;

    return (
        <section
            ref={containerRef}
            className={
                isTabMode
                    ? "h-full min-h-0 w-full min-w-0 overflow-hidden rounded-none border-t border-[rgb(var(--ui-border)/0.7)] bg-[rgb(var(--ui-surface)/0.92)]"
                    : "mt-4 min-w-0 overflow-hidden rounded-[1.5rem] border border-[rgb(var(--ui-border)/0.7)] bg-[rgb(var(--ui-surface)/0.92)] shadow-[0_18px_48px_rgb(15_23_42_/_0.08)]"
            }
            aria-label="Code workspace"
            data-testid="review-stacked-tools"
        >
            <div
                className={
                    isTabMode
                        ? "h-full min-h-0 w-full overflow-hidden"
                        : "h-[clamp(24rem,68vh,44rem)] md:h-[clamp(26rem,72vh,50rem)]"
                }
                data-testid="review-stacked-tools-frame"
            >
                <ToolsPanel {...toolsPanelProps} />
            </div>
        </section>
    );
}
