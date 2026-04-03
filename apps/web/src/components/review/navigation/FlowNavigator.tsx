"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

export type FlowNavMode = "scroll" | "slideshow";

export type FlowNavigationConfig =
    | FlowNavMode
    | {
    cards?: FlowNavMode;
    quiz?: FlowNavMode;
};

export function resolveFlowNavigationConfig(
    value?: FlowNavigationConfig,
): { cards: FlowNavMode; quiz: FlowNavMode } {
    if (!value) return { cards: "scroll", quiz: "scroll" };

    if (value === "scroll" || value === "slideshow") {
        return { cards: value, quiz: value };
    }

    return {
        cards: value.cards ?? "scroll",
        quiz: value.quiz ?? "scroll",
    };
}

function clampIndex(index: number, total: number) {
    if (total <= 0) return 0;
    return Math.max(0, Math.min(index, total - 1));
}

export default function FlowNavigator<T>({
                                             items,
                                             mode = "scroll",
                                             activeIndex = 0,
                                             onActiveIndexChange,
                                             getKey,
                                             renderItem,
                                             className,
                                             scrollClassName,
                                             reduceMotion = false,
                                             showChrome,
                                             canGoPrev,
                                             canGoNext,
                                             onPrev,
                                             onNext,
                                             prevLabel = "Previous",
                                             nextLabel = "Next",
                                             getProgressLabel,
                                         }: {
    items: T[];
    mode?: FlowNavMode;
    activeIndex?: number;
    onActiveIndexChange?: (index: number) => void;
    getKey: (item: T, index: number) => string;
    renderItem: (item: T, index: number) => React.ReactNode;
    className?: string;
    scrollClassName?: string;
    reduceMotion?: boolean;
    showChrome?: boolean;
    canGoPrev?: boolean;
    canGoNext?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
    prevLabel?: React.ReactNode;
    nextLabel?: React.ReactNode;
    getProgressLabel?: (index: number, total: number) => React.ReactNode;
}) {
    const total = items.length;
    const safeIndex = clampIndex(activeIndex, total);
    const current = items[safeIndex];

    if (mode === "scroll") {
        return (
            <div className={cn("grid gap-3", scrollClassName, className)}>
                {items.map((item, index) => (
                    <React.Fragment key={getKey(item, index)}>
                        {renderItem(item, index)}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    const showUi = total > 1 && (showChrome ?? true);
    const prevDisabled = !(canGoPrev ?? safeIndex > 0);
    const nextDisabled = !(canGoNext ?? safeIndex < total - 1);

    const handlePrev = () => {
        if (prevDisabled) return;
        if (onPrev) return onPrev();
        onActiveIndexChange?.(safeIndex - 1);
    };

    const handleNext = () => {
        if (nextDisabled) return;
        if (onNext) return onNext();
        onActiveIndexChange?.(safeIndex + 1);
    };

    return (
        <div className={cn("grid gap-3", className)}>
            {showUi ? (
                <div className="ui-surface-muted flex items-center justify-between gap-3  px-3 py-2 rounded-none">
                    <button
                        type="button"
                        className="ui-btn ui-btn-secondary text-xs font-extrabold"
                        onClick={handlePrev}
                        disabled={prevDisabled}
                    >
                        {prevLabel}
                    </button>

                    <div className="ui-meta text-center">
                        {getProgressLabel
                            ? getProgressLabel(safeIndex, total)
                            : `Item ${safeIndex + 1} of ${total}`}
                    </div>

                    <button
                        type="button"
                        className="ui-btn ui-btn-secondary text-xs font-extrabold"
                        onClick={handleNext}
                        disabled={nextDisabled}
                    >
                        {nextLabel}
                    </button>
                </div>
            ) : null}

            <div className="relative min-h-0 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                    {current ? (
                        <motion.div
                            key={getKey(current, safeIndex)}
                            initial={
                                reduceMotion
                                    ? { opacity: 1 }
                                    : { opacity: 0, x: 16, scale: 0.995 }
                            }
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={
                                reduceMotion
                                    ? { opacity: 1 }
                                    : { opacity: 0, x: -16, scale: 0.995 }
                            }
                            transition={{
                                duration: reduceMotion ? 0 : 0.22,
                                ease: [0.16, 1, 0.3, 1],
                            }}
                        >
                            {renderItem(current, safeIndex)}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>
        </div>
    );
}