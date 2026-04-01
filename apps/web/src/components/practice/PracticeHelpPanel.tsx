"use client";

import React, { useEffect, useMemo, useRef } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { Exercise } from "@/lib/practice/types";
import type { PracticeHelpState, QItem } from "@/lib/practice/uiTypes";
import RevealAnswerCard from "@/components/practice/RevealAnswerCard";
import { useTaggedT } from "@/i18n/tagged";
import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";
import {
    DEFAULT_PRACTICE_HELP_POLICY,
    getNextPracticeHelpStepKey,
    PRACTICE_HELP_STEP_DEF_MAP,
    type PracticeHelpPolicy,
} from "@/lib/practice/help/steps";

export default function PracticeHelpPanel({
                                              exercise,
                                              current,
                                              help,
                                              helpPolicy,
                                              updateCurrent,
                                              onOpenHelp,
                                          }: {
    exercise: Exercise | null;
    current: QItem;
    help: PracticeHelpState | null | undefined;
    helpPolicy?: PracticeHelpPolicy | null;
    updateCurrent: (patch: Partial<QItem>) => void;
    onOpenHelp?: (stepKey?: string) => void;
}) {
    const tt = useTaggedT();
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const openedStepKeys = help?.openedStepKeys ?? [];

    const enabledStepKeys = useMemo(
        () =>
            helpPolicy?.stepKeys?.length
                ? helpPolicy.stepKeys
                : DEFAULT_PRACTICE_HELP_POLICY.stepKeys,
        [helpPolicy],
    );

    const activeStepKey =
        help?.activeStepKey ??
        (openedStepKeys.length ? openedStepKeys[openedStepKeys.length - 1] : null);

    useEffect(() => {
        if (!activeStepKey) return;
        const el = cardRefs.current[activeStepKey];
        if (!el) return;

        requestAnimationFrame(() => {
            scrollIntoViewSmart(el, {
                block: "end",
                force: true,
                offsetPx: 16,
            });
        });
    }, [activeStepKey, openedStepKeys.length]);

    if (!openedStepKeys.length) return null;

    return (
        <div className="mt-3 grid gap-3">
            {openedStepKeys.map((stepKey) => {
                const entry = help?.entries?.[stepKey];
                if (!entry) return null;

                const isActive = stepKey === activeStepKey;

                const nextStepKey = isActive
                    ? getNextPracticeHelpStepKey(enabledStepKeys, openedStepKeys)
                    : null;

                const nextStepLabel = nextStepKey
                    ? PRACTICE_HELP_STEP_DEF_MAP.get(nextStepKey)?.label ?? nextStepKey
                    : null;

                const openingNext =
                    Boolean(nextStepKey) && help?.busyStepKey === nextStepKey;

                const resolvedContent =
                    typeof entry.content === "string"
                        ? tt.resolve(entry.content, "")
                        : null;

                const resolvedLabel =
                    typeof entry.label === "string"
                        ? tt.resolve(entry.label, entry.label)
                        : PRACTICE_HELP_STEP_DEF_MAP.get(stepKey)?.label ?? stepKey;

                return (
                    <div
                        key={stepKey}
                        ref={(el) => {
                            cardRefs.current[stepKey] = el;
                        }}
                        className="ui-surface-muted p-3"
                    >
                        <div className="mb-2 ui-meta-strong">{resolvedLabel}</div>

                        {resolvedContent ? (
                            <div className="ui-text">
                                <MathMarkdown
                                    content={resolvedContent}
                                    className="max-w-none"
                                />
                            </div>
                        ) : null}

                        {entry.reveal ? (
                            <div className="mt-3">
                                <RevealAnswerCard
                                    exercise={exercise}
                                    current={current}
                                    reveal={entry.reveal}
                                    updateCurrent={updateCurrent}
                                    autoScroll={false}
                                />
                            </div>
                        ) : null}

                        {isActive && nextStepKey && onOpenHelp ? (
                            <div className="mt-3 flex items-center justify-end">
                                <button
                                    type="button"
                                    onClick={() => onOpenHelp(nextStepKey)}
                                    disabled={openingNext}
                                    className={[
                                        "ui-btn-secondary",
                                        openingNext ? "opacity-70" : "",
                                    ].join(" ")}
                                >
                                    {openingNext ? "Opening…" : nextStepLabel}
                                </button>
                            </div>
                        ) : null}

                        {isActive && help?.error ? (
                            <div className="mt-3 text-xs text-[rgb(var(--ui-danger)/0.95)]">
                                {help.error}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}