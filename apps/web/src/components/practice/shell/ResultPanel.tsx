"use client";

import React from "react";
import { cn } from "@/lib/cn";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import RevealAnswerCard from "../RevealAnswerCard";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { UseConceptExplainResult } from "../hooks/useConceptExplain";
import { isExcusedPracticeItem } from "@/lib/flow/excuse";

export default function ResultPanel({
                                        t,
                                        busy,
                                        allowReveal,
                                        isLockedRun,
                                        maxAttempts,
                                        attempts,
                                        actionErr,
                                        current,
                                        exercise,
                                        updateCurrent,
                                        resultBoxClass,
                                        concept,
                                        excuseAndNext,
                                    }: {
    t: any;
    busy: boolean;
    allowReveal: boolean;
    isLockedRun: boolean;
    maxAttempts: number;
    attempts: number;
    actionErr: string | null;
    current: QItem | null;
    exercise: Exercise | null;
    updateCurrent: (patch: Partial<QItem>) => void;
    resultBoxClass: string;
    concept: UseConceptExplainResult;
    excuseAndNext?: (reason?: string | null) => Promise<void> | void;
}) {
    const excused = isExcusedPracticeItem(current);
    const activeHelpEntry =
        current?.help?.activeStepKey
            ? current.help.entries[current.help.activeStepKey]
            : null;

    return (
        <div className="p-4">
            <div className="ui-kicker">{t("result.title")}</div>

            <div className={cn("mt-2 p-3 text-xs leading-relaxed", resultBoxClass)}>
                {actionErr ? (
                    <div className="text-[rgb(var(--ui-text)/0.92)]">
                        <div className="ui-title-sm">{t("result.errorTitle")}</div>
                        <div className="mt-1 ui-meta-strong">{actionErr}</div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => excuseAndNext?.(actionErr)}
                                disabled={busy || !excuseAndNext || !current}
                                className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                ) : excused ? (
                    <div className="text-[rgb(var(--ui-text)/0.92)]">
                        <div className="ui-title-sm">Excused</div>
                        <div className="mt-1 ui-meta">
                            This question was excused so you can keep going.
                        </div>
                    </div>
                ) : !current?.result ? (
                    <div className="ui-meta">{t("result.submitToValidate")}</div>
                ) : (
                    <>
                        <div className="ui-title-sm">
                            {current.result.ok
                                ? t("result.correct")
                                : t("result.incorrect")}
                        </div>

                        {activeHelpEntry?.reveal ? (
                            <RevealAnswerCard
                                exercise={exercise}
                                current={current}
                                reveal={activeHelpEntry.reveal}
                                updateCurrent={updateCurrent}
                            />
                        ) : null}

                        {isLockedRun && !current.result.ok && !current.submitted ? (
                            <div className="mt-2 ui-meta">
                                {t("result.attemptsLeft", {
                                    count: Math.max(0, maxAttempts - attempts),
                                })}
                            </div>
                        ) : null}

                        {current.result.explanation ? (
                            <div className="ui-surface-muted mt-2 p-3">
                                <MathMarkdown
                                    content={String(current.result.explanation)}
                                    className="ui-quiz-markdown"
                                />
                            </div>
                        ) : null}
                    </>
                )}

                {concept.canExplain ? (
                    <div className="mt-3">
                        {allowReveal ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={concept.explainConcept}
                                    disabled={busy || concept.aiBusy}
                                    className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {concept.aiBusy ? t("ai.explaining") : t("ai.explainConcept")}
                                </button>
                                <div className="ui-meta">{t("ai.helperLine")}</div>
                            </div>
                        ) : null}

                        {concept.aiErr ? (
                            <div className="mt-2 text-[11px] text-[rgb(var(--ui-danger)/1)]">
                                {concept.aiErr}
                            </div>
                        ) : null}

                        {concept.aiText ? (
                            <div className="ui-surface-muted mt-2 p-3">
                                <MathMarkdown
                                    content={concept.aiText}
                                    className="ui-quiz-markdown"
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}