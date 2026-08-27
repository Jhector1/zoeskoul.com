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
export function resolveReviewSkeletonSwapMode(args: {
    showSkeleton: boolean;
    holdContent: boolean;
    hasMountedContent: boolean;
}) {
    return args.showSkeleton &&
        !args.holdContent &&
        !args.hasMountedContent
        ? "initial-skeleton"
        : "content";
}

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
    const [hasMountedContent, setHasMountedContent] = React.useState(
        () => !showSkeleton || holdContent,
    );
    const mode = resolveReviewSkeletonSwapMode({
        showSkeleton,
        holdContent,
        hasMountedContent,
    });

    /**
     * Initial hydration may own the full skeleton exactly once. As soon as
     * real Review content has mounted, transient hydration/readiness changes
     * during Previous/Next must never put the full skeleton back on screen.
     */
    React.useEffect(() => {
        if (mode !== "content" || hasMountedContent) return;
        setHasMountedContent(true);
    }, [hasMountedContent, mode]);

    if (mode === "initial-skeleton") {
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

            {holdContent || showSkeleton ? (
                <span data-review-transition-content-held="true" hidden />
            ) : null}
        </div>
    );
}
