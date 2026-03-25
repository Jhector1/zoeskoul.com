// src/components/practice/shell/PracticeSidebar.tsx
"use client";

import React from "react";
import type { Difficulty, Exercise } from "@/lib/practice/types";
import type { PracticeShellProps } from "../PracticeShell";
import ResultPanel from "./ResultPanel";
import type { UseConceptExplainResult } from "../hooks/useConceptExplain";

function SelectField<T extends string>({
                                           label,
                                           value,
                                           onChange,
                                           disabled,
                                           options,
                                       }: {
    label: string;
    value: string;
    onChange: (v: T) => void;
    disabled: boolean;
    options: { id: T; label: string }[];
}) {
    return (
        <div className="grid gap-2">
            <label className="ui-sketch-label">{label}</label>
            <select
                disabled={disabled}
                className="ui-sketch-input mt-0"
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
            >
                {options.map((o) => (
                    <option key={String(o.id)} value={String(o.id)}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default function PracticeSidebar(
    props: PracticeShellProps & {
        canSubmitNow: boolean;
        finalized: boolean;
        attempts: number;
        outOfAttempts: boolean;
        resultBoxClass: string;
        concept: UseConceptExplainResult;
    },
) {
    const {
        t,
        isAssignmentRun,
        isSessionRun,
        isLockedRun,
        allowReveal,
        maxAttempts,
        busy,

        topicLocked,
        difficultyLocked,
        topic,
        setTopic,
        difficulty,
        setDifficulty,
        topicOptionsFixed,
        difficultyOptions,

        badge,
        current,

        canGoPrev,
        canGoNext,
        goPrev,
        goNext,
        submit,
        reveal,

        answeredCount,
        correctCount,
        sessionSize,

        attempts,
        canSubmitNow,
        finalized,
        outOfAttempts,
        resultBoxClass,
        concept,
    } = props;

    return (
        <div className="ui-card overflow-hidden">
            <div className="border-b border-neutral-200/70 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        {isAssignmentRun ? (
                            <div className="mt-2 inline-flex rounded-full border border-amber-600/25 bg-amber-500/10 px-2 py-1 text-[11px] font-extrabold text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-200/90">
                                {t("filters.assignmentLocked")}
                            </div>
                        ) : isSessionRun ? (
                            <div className="mt-2 inline-flex rounded-full border border-sky-300/40 bg-sky-50/70 px-2 py-1 text-[11px] font-extrabold text-sky-900 dark:border-sky-300/25 dark:bg-sky-300/10 dark:text-sky-200/90">
                                {t("filters.sessionLocked")}
                            </div>
                        ) : null}

                        <div className="text-sm font-black tracking-tight">{t("title")}</div>
                        <div className="mt-1 text-xs text-neutral-600 dark:text-white/70">{t("subtitle")}</div>

                        <div className="mt-2 text-xs text-neutral-500 dark:text-white/60">
                            {t("progress.label")}:{" "}
                            <span className="font-extrabold text-neutral-800 dark:text-white/80">
                {answeredCount}/{sessionSize}
              </span>{" "}
                            • {t("progress.correct")}:{" "}
                            <span className="font-extrabold text-neutral-800 dark:text-white/80">{correctCount}</span>
                        </div>

                        {current ? (
                            <div className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                                {t("progress.attempts")}:{" "}
                                <span className="font-extrabold text-neutral-800 dark:text-white/80">
                  {attempts}/{isLockedRun ? maxAttempts : "∞"}
                </span>
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-full border border-neutral-200 bg-white/70 px-2 py-1 text-[11px] font-extrabold text-neutral-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
                        {badge || t("status.dash")}
                    </div>
                </div>

                <div className="mt-3 grid gap-3">
                    <SelectField
                        label={t("filters.topic")}
                        value={String(topic)}
                        onChange={(v) => setTopic(v as any)}
                        disabled={topicLocked}
                        options={topicOptionsFixed as any}
                    />

                    <SelectField
                        label={t("filters.difficulty")}
                        value={String(difficulty)}
                        onChange={(v) => setDifficulty(v as any)}
                        disabled={difficultyLocked}
                        options={difficultyOptions as any}
                    />

                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={goPrev}
                            disabled={busy || !canGoPrev}
                        >
                            {t("buttons.prev")}
                        </button>

                        <button
                            className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => goNext()}
                            disabled={busy || !canGoNext}
                        >
                            {t("buttons.next")}
                        </button>

                        <button
                            className="ui-btn ui-btn-primary px-3 py-2 text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => submit()}
                            disabled={busy || !props.exercise || finalized || outOfAttempts || !canSubmitNow}
                        >
                            {t("buttons.submit")}
                        </button>

                        <button
                            className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => reveal()}
                            disabled={busy || !props.exercise || !allowReveal}
                        >
                            {t("buttons.reveal")}
                        </button>
                    </div>

                    {isLockedRun && !allowReveal ? (
                        <div className="text-[11px] text-neutral-500 dark:text-white/45">
                            {t("status.revealDisabled")}
                        </div>
                    ) : null}
                </div>
            </div>

            <ResultPanel
                t={t}
                busy={busy}
                allowReveal={allowReveal}
                isLockedRun={isLockedRun}
                maxAttempts={maxAttempts}
                attempts={attempts}
                actionErr={props.actionErr}
                current={props.current}
                exercise={props.exercise as Exercise | null}
                updateCurrent={props.updateCurrent}
                resultBoxClass={resultBoxClass}
                concept={concept}
                excuseAndNext={props.excuseAndNext} // ✅ NEW
            />
        </div>
    );
}