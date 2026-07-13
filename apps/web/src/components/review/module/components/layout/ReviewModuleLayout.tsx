"use client";

import React from "react";
import ReviewSkeletonSwap from "../overlays/ReviewSkeletonSwap";
import { cn } from "@/lib/cn";

type Props = {
    ariaBusy: boolean;
    reduceMotion: boolean;
    showMask: boolean;
    showSkeleton: boolean;
    isNavigating?: boolean;
    navigationLabel?: string;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    leftW: number;
    rightW: number;
    header: React.ReactNode;
    leftRail?: React.ReactNode;
    rightRail?: React.ReactNode;
    mobileDrawer?: React.ReactNode;
    overlays?: React.ReactNode;
    body: React.ReactNode;
};

function ReviewNavigationProgress({
                                      active,
                                      reduceMotion,
                                      label = "Loading...",
                                  }: {
    active: boolean;
    reduceMotion: boolean;
    label?: string;
}) {
    if (!active) return null;

    return (
        <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[80]"
            role="status"
            aria-live="polite"
            aria-label={label}
        >
            <div className="h-1 overflow-hidden bg-[rgb(var(--ui-border)/0.45)]">
                <div
                    className={cn(
                        "h-full w-1/3 rounded-full bg-[rgb(var(--ui-accent)/0.85)] shadow-[0_0_18px_rgb(var(--ui-accent)/0.45)]",
                        reduceMotion
                            ? "translate-x-0"
                            : "animate-[review-nav-progress_1.05s_ease-in-out_infinite]",
                    )}
                />
            </div>

            <div className="absolute right-3 top-3 hidden rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.9)] px-3 py-1 text-xs font-bold text-[rgb(var(--ui-text)/0.9)] shadow-sm backdrop-blur sm:block">
                {label}
            </div>
        </div>
    );
}

export default function ReviewModuleLayout({
                                               ariaBusy,
                                               reduceMotion,
                                               showMask,
                                               showSkeleton,
                                               isNavigating = false,
                                               navigationLabel = "Loading...",
                                               leftCollapsed,
                                               rightCollapsed,
                                               leftW,
                                               rightW,
                                               header,
                                               leftRail,
                                               rightRail,
                                               mobileDrawer,
                                               overlays,
                                               body,
                                           }: Props) {
    const busy = ariaBusy || isNavigating || showSkeleton;

    return (
        <div
            className="relative h-full w-full overflow-hidden bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_55%,#f6f7ff_100%)] text-neutral-900 dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] dark:text-white/90"
            aria-busy={busy}
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                {/* subtle decorative background image */}
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.08] dark:opacity-[0.12]"
                    style={{
                        backgroundImage: "url('/images/ui/img_2.png')",
                    }}
                />

                {/* soft readability veil */}
                <div className="absolute inset-0 bg-white/18 dark:bg-black/28" />
            </div>

            {!reduceMotion ? (
                <div className="ui-reveal-mask" data-show={showMask ? "true" : "false"} />
            ) : null}

            <ReviewNavigationProgress
                active={!showSkeleton && isNavigating}
                reduceMotion={reduceMotion}
                label={navigationLabel}
            />

            <div className="relative z-10 h-full w-full">
                {overlays}
                {mobileDrawer}

                <ReviewSkeletonSwap
                    showSkeleton={showSkeleton}
                    reduceMotion={reduceMotion}
                    leftCollapsed={leftCollapsed}
                    rightCollapsed={rightCollapsed}
                    leftW={leftW}
                    rightW={rightW}
                >
                    <div className="h-full w-full flex flex-col min-h-0">
                        <div data-mobile-workspace-header="true" className="shrink-0">
                            {header}
                        </div>
                        <div className="flex-1 min-h-0 w-full">
                            <div className="h-full min-h-0 flex">
                                {leftRail}
                                {body}
                                {rightRail}
                            </div>
                        </div>
                    </div>
                </ReviewSkeletonSwap>
            </div>
        </div>
    );
}