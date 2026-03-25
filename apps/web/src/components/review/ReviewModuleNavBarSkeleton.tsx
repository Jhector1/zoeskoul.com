"use client";

import React from "react";
import { cn } from "@/lib/cn";

/**
 * Matches ReviewModuleNavBar sizing/padding so footer height measurement is identical.
 * - same outer wrapper: fixed bottom, same py-2 px-4 md:px-6 + safe-area padding
 * - same inner card: ui-card + bg/blur + py-2 + !shadow-none !border-0
 * - same alignment: justify-end gap-3
 * - responsive widths so it looks good on small devices
 */
const ReviewModuleNavBarSkeleton = React.forwardRef<HTMLDivElement, {}>(function ReviewModuleNavBarSkeleton(
    _props,
    ref
) {
    return (
        <div ref={ref} className="fixed inset-x-0 bottom-0 z-50 text-neutral-900 dark:text-white/90">
            <div className="mx-auto py-2 px-4 md:px-6 pb-[max(env(safe-area-inset-bottom),0px)]">
                <div
                    className={cn(
                        "ui-card",
                        "bg-white/70 py-2 backdrop-blur-xl dark:bg-black/55",
                        "!shadow-none !border-0"
                    )}
                >
                    <div className="flex items-center justify-end gap-3">
                        {/* Prev */}
                        <div className="ui-skel h-[40px] w-[120px] rounded-xl sm:w-[150px]" />

                        {/* Next / Certificate */}
                        <div className="ui-skel h-[40px] w-[140px] rounded-xl sm:w-[170px]" />
                    </div>

                    {/* Hint line (sometimes present) */}
                    <div className="mt-2 ui-skel h-3 w-[min(26rem,85vw)] rounded-lg opacity-70" />
                </div>
            </div>
        </div>
    );
});

ReviewModuleNavBarSkeleton.displayName = "ReviewModuleNavBarSkeleton";
export default ReviewModuleNavBarSkeleton;