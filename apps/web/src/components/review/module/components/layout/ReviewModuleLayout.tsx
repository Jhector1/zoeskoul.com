"use client";

import React from "react";
import ReviewSkeletonSwap from "../overlays/ReviewSkeletonSwap";

type Props = {
    ariaBusy: boolean;
    reduceMotion: boolean;
    showMask: boolean;
    showSkeleton: boolean;
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

export default function ReviewModuleLayout({
                                               ariaBusy,
                                               reduceMotion,
                                               showMask,
                                               showSkeleton,
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
    return (
        <div
            className="relative h-full w-full overflow-hidden bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_55%,#f6f7ff_100%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-neutral-900 dark:text-white/90"
            aria-busy={ariaBusy}
        >
            {!reduceMotion ? (
                <div className="ui-reveal-mask" data-show={showMask ? "true" : "false"} />
            ) : null}

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
                    <div className="shrink-0">{header}</div>
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
    );
}