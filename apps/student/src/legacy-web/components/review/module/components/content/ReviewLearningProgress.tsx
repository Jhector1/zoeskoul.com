"use client";

import React from "react";

import { cn } from "@/lib/cn";
import {
    buildLearningProgressSteps,
    type LearningProgressStatus,
    type LearningProgressTrack,
} from "../../learningProgress";

function statusLabel(status: LearningProgressStatus, current: boolean): string {
    if (current) return status === "revealed" ? "current, revealed" : "current";
    if (status === "complete") return "complete";
    if (status === "revealed") return "revealed";
    return "upcoming";
}

function ProgressTrack({ track }: { track: LearningProgressTrack }) {
    const steps = buildLearningProgressSteps(track);
    if (!steps.length) return null;

    const activeIndex = steps.findIndex((step) => step.current);
    const currentNumber = Math.max(1, activeIndex + 1);

    return (
        <div
            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"
            role="progressbar"
            aria-label={`${track.label} ${currentNumber} of ${steps.length}`}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={currentNumber}
        >
            <div className="whitespace-nowrap text-[11px] font-black tracking-wide text-[rgb(var(--ui-text-muted)/0.94)]">
                {track.label} {currentNumber} of {steps.length}
            </div>

            <ol
                className="flex min-w-0 items-center overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-hidden="true"
            >
                {steps.map((step, index) => {
                    const completed = step.status === "complete";
                    const revealed = step.status === "revealed";
                    const previous = steps[index - 1];
                    const connectorComplete = Boolean(
                        previous &&
                            (previous.status === "complete" || previous.status === "revealed"),
                    );

                    return (
                        <li
                            key={step.index}
                            className="flex shrink-0 items-center"
                            title={`${track.label} ${index + 1}: ${statusLabel(step.status, step.current)}`}
                        >
                            {index > 0 ? (
                                <span
                                    className={cn(
                                        "h-px w-3 sm:w-4",
                                        connectorComplete
                                            ? "bg-[rgb(var(--ui-accent)/0.42)]"
                                            : "bg-[rgb(var(--ui-border)/0.78)]",
                                    )}
                                />
                            ) : null}

                            <span
                                className={cn(
                                    "block rounded-full transition-[background-color,border-color,box-shadow,transform] duration-200",
                                    step.current
                                        ? "h-3 w-3 scale-105 ring-4"
                                        : "h-2.5 w-2.5",
                                    step.current && !revealed
                                        ? "bg-[rgb(var(--ui-accent))] ring-[rgb(var(--ui-accent)/0.16)]"
                                        : null,
                                    step.current && revealed
                                        ? "bg-[rgb(var(--ui-warn))] ring-[rgb(var(--ui-warn)/0.16)]"
                                        : null,
                                    !step.current && completed
                                        ? "bg-[rgb(var(--ui-accent)/0.58)] ring-1 ring-[rgb(var(--ui-accent)/0.28)]"
                                        : null,
                                    !step.current && revealed
                                        ? "bg-[rgb(var(--ui-warn)/0.72)] ring-1 ring-[rgb(var(--ui-warn)/0.28)]"
                                        : null,
                                    !step.current && !completed && !revealed
                                        ? "border border-[rgb(var(--ui-border-strong)/0.78)] bg-[rgb(var(--ui-surface-3)/0.92)]"
                                        : null,
                                )}
                            />
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

export default function ReviewLearningProgress({
    activity,
}: {
    activity?: LearningProgressTrack | null;
}) {
    if (!activity) return null;

    return (
        <div
            className="mt-3 border-t border-[rgb(var(--ui-border)/0.62)] pt-3"
            data-testid="review-learning-progress"
        >
            <ProgressTrack track={activity} />
        </div>
    );
}
