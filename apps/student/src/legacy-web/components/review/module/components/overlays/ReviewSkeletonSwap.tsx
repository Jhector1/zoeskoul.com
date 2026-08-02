"use client";

import React from "react";
import {
    AnimatePresence,
    motion,
} from "framer-motion";

import ReviewModuleSkeleton from "@/components/review/module/ReviewModuleSkeleton";

type Props = {
    showSkeleton: boolean;
    holdContent?: boolean;
    reduceMotion: boolean;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    leftW: number;
    rightW: number;
    children: React.ReactNode;
};

function InitialHydrationSkeleton({
    leftCollapsed,
    rightCollapsed,
    leftW,
    rightW,
}: Pick<
    Props,
    | "leftCollapsed"
    | "rightCollapsed"
    | "leftW"
    | "rightW"
>) {
    return (
        <div className="h-full w-full pointer-events-none">
            <ReviewModuleSkeleton
                leftCollapsed={leftCollapsed}
                rightCollapsed={rightCollapsed}
                leftW={leftW}
                rightW={rightW}
            />
        </div>
    );
}

/**
 * Full skeletons are reserved for initial module hydration.
 *
 * Same-module Previous/Next and correct-answer auto-advance keep the complete
 * Review surface mounted and visible. Their exercise and editor loading states
 * are owned by the shared destination coordinator at those local boundaries.
 */
export default function ReviewSkeletonSwap({
    showSkeleton,
    holdContent = false,
    reduceMotion,
    leftCollapsed,
    rightCollapsed,
    leftW,
    rightW,
    children,
}: Props) {
    if (showSkeleton && !holdContent) {
        return (
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key="initial-hydration-skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        duration: reduceMotion ? 0 : 0.18,
                    }}
                    className="h-full w-full"
                >
                    <InitialHydrationSkeleton
                        leftCollapsed={leftCollapsed}
                        rightCollapsed={rightCollapsed}
                        leftW={leftW}
                        rightW={rightW}
                    />
                </motion.div>
            </AnimatePresence>
        );
    }

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            data-review-transition-surface="true"
        >
            <div
                data-review-transition-content="mounted"
                className="h-full w-full"
            >
                {children}
            </div>

            {holdContent ? (
                <span data-review-transition-content-held="true" hidden />
            ) : null}
        </div>
    );
}
