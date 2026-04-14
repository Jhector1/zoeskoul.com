"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReviewModuleSkeleton from "@/components/review/module/ReviewModuleSkeleton";

type Props = {
    showSkeleton: boolean;
    reduceMotion: boolean;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    leftW: number;
    rightW: number;
    children: React.ReactNode;
};

export default function ReviewSkeletonSwap({
                                               showSkeleton,
                                               reduceMotion,
                                               leftCollapsed,
                                               rightCollapsed,
                                               leftW,
                                               rightW,
                                               children,
                                           }: Props) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            {showSkeleton ? (
                <motion.div
                    key="skel"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18 }}
                    className="h-full w-full"
                >
                    <div className="h-full w-full pointer-events-none">
                        <ReviewModuleSkeleton
                            leftCollapsed={leftCollapsed}
                            rightCollapsed={rightCollapsed}
                            leftW={leftW}
                            rightW={rightW}
                        />
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key="content"
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        duration: reduceMotion ? 0 : 0.24,
                        ease: [0.16, 1, 0.3, 1],
                    }}
                    className="h-full w-full"
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}