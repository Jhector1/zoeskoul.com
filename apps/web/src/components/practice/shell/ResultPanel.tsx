// src/components/practice/shell/ResultPanel.tsx
"use client";

import React from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "../practiceType";
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
                                        excuseAndNext, // ✅ NEW
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

    return (
        <div className="p-4">
            <div className="text-xs font-extrabold text-neutral-500 dark:text-white/60">
                {t("result.title")}
            </div>

            <div className={`mt-2 rounded-2xl border p-3 text-xs leading-relaxed ${resultBoxClass}`}>
                {actionErr ? (
                    <div className="text-neutral-800 dark:text-white/80">
                        <div className="font-extrabold">{t("result.errorTitle")}</div>
                        <div className="mt-1 text-neutral-600 dark:text-white/70">{actionErr}</div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => excuseAndNext?.(actionErr)}
                                disabled={busy || !excuseAndNext || !current}
                                className="ui-btn ui-btn-secondary px-3 py-2 text-[11px] font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                ) : excused ? (
                    <div className="text-neutral-800 dark:text-white/80">
                        <div className="font-extrabold">Excused</div>
                        <div className="mt-1 text-neutral-600 dark:text-white/70">
                            This question was excused so you can keep going.
                        </div>
                    </div>
                ) : !current?.result ? (
                    <div className="text-neutral-600 dark:text-white/70">{t("result.submitToValidate")}</div>
                ) : (
                    <>
                        <div className="font-extrabold">
                            {current.revealed
                                ? t("result.revealed")
                                : current.result.ok
                                    ? t("result.correct")
                                    : t("result.incorrect")}
                        </div>

                        {current.revealed ? (
                            <RevealAnswerCard
                                exercise={exercise}
                                current={current}
                                result={current.result}
                                updateCurrent={updateCurrent}
                            />
                        ) : null}

                        {isLockedRun && !current.result.ok && !current.submitted ? (
                            <div className="mt-2 text-neutral-600 dark:text-white/70">
                                {t("result.attemptsLeft", { count: Math.max(0, maxAttempts - attempts) })}
                            </div>
                        ) : null}

                        {current.result.explanation ? (
                            <div className="mt-2 rounded-xl border border-neutral-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                                <MathMarkdown
                                    content={String(current.result.explanation)}
                                    className="prose prose-neutral dark:prose-invert max-w-none prose-p:my-2"
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
                                    onClick={concept.explainConcept}
                                    disabled={busy || concept.aiBusy}
                                    className="ui-btn ui-btn-secondary px-3 py-2 text-[11px] font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {concept.aiBusy ? t("ai.explaining") : t("ai.explainConcept")}
                                </button>
                                <div className="text-[11px] text-neutral-500 dark:text-white/50">
                                    {t("ai.helperLine")}
                                </div>
                            </div>
                        ) : null}

                        {concept.aiErr ? (
                            <div className="mt-2 text-[11px] text-rose-700 dark:text-rose-200/80">
                                {concept.aiErr}
                            </div>
                        ) : null}

                        {concept.aiText ? (
                            <div className="mt-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-black/30">
                                <MathMarkdown
                                    content={concept.aiText}
                                    className="prose prose-neutral dark:prose-invert max-w-none prose-p:my-2 prose-strong:font-extrabold"
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}