"use client";

import React from "react";
import type {ReviewQuestion} from "@/lib/subjects/types";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import {normalizeMath} from "@/lib/markdown/normalizeMath";
import {cn} from "@/lib/cn";
import {useTaggedT} from "@/i18n/tagged";

export default function QuizLocalCard(props: {
    q: Exclude<ReviewQuestion, { kind: "practice" }>;
    unlocked: boolean;
    isCompleted: boolean;
    locked: boolean;
    skipped?: boolean;
    onSkip?: () => void;
    value: any;
    checked: boolean;
    ok: boolean | null;
    prereqsMet?: boolean;

    onPick: (val: any) => void;
    onCheck: () => void;

    /** ✅ NEW: lets parent scroll precisely to explanation */
    explainRef?: React.Ref<HTMLDivElement>;
}) {
    const {q, unlocked, isCompleted, locked, skipped, onSkip, prereqsMet} = props;
    const disabled = !unlocked || isCompleted || locked || Boolean(skipped) || !prereqsMet;
    const tt = useTaggedT(); // resolves "@:quiz...."
    const ui = useTaggedT("reviewQuizUi");
    const prompt = tt.resolve(String((q as any).prompt ?? ""), {}, "");
    const explain = tt.resolve(String((q as any).explain ?? ""), {}, "");

    return (
        <div
            className={cn("ui-quiz-card", locked && "ui-quiz-card--locked", !unlocked && "opacity-70")}
        >
            <MathMarkdown
                className="
          text-sm text-neutral-800 dark:text-white/80
          [&_.katex]:text-neutral-900 dark:[&_.katex]:text-white/90
          [&_.katex-display]:overflow-x-auto
          [&_.katex-display]:py-2
        "
                content={normalizeMath(prompt)}
            />
            {!unlocked ? <div className="ui-quiz-hint">{ui.t("unlockHint", {}, "Answer the previous question correctly to unlock this one.")}</div> : null}


            {q.kind === "mcq" ? (
                <div className="mt-2 grid gap-2">
                    {q.choices.map((c) => {
                        const choiceLabel = tt.resolve(c.label, {}, c.label);
                        return (
                            <button
                                key={c.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => !disabled && props.onPick(c.id)}
                                className={cn(
                                    "ui-quiz-choice",
                                    props.value === c.id ? "ui-quiz-choice--selected" : "ui-quiz-choice--idle",
                                    disabled && "cursor-not-allowed opacity-60",
                                )}
                            >
                                <MathMarkdown
                                    inline
                                    className="text-xs font-extrabold text-inherit [&_.katex]:text-inherit"
                                    content={normalizeMath(choiceLabel)}
                                />
                            </button>
                        )
                    })}
                </div>
            ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                        disabled={disabled}
                        className={cn("ui-quiz-input", disabled && "cursor-not-allowed opacity-60")}
                        placeholder={ui.t("placeholders.enterNumber", {}, "Enter a number")}
                        value={props.value ?? ""}
                        onChange={(e) => !disabled && props.onPick(e.target.value)}
                    />
                    {(q as any).tolerance ? (
                        <div className="text-xs text-neutral-500 dark:text-white/50">
                            {ui.t("tolerance", { n: (q as any).tolerance }, `± ${(q as any).tolerance}`)}
                        </div>
                    ) : null}
                </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <button
                    type="button"
                    data-flow-focus="1"
                    disabled={disabled}
                    onClick={() => !disabled && props.onCheck()}
                    className={cn("ui-quiz-action", disabled ? "ui-quiz-action--disabled" : "ui-quiz-action--primary")}
                >
                    {ui.t("buttons.checkQuestion", {}, "Check this question")}                </button>

                {onSkip ? (
                    <button
                        type="button"
                        disabled={!unlocked || isCompleted || locked || Boolean(props.skipped)}
                        onClick={() => props.onSkip?.()}
                        className={cn(
                            "ui-quiz-action",
                            !unlocked || isCompleted || locked || Boolean(props.skipped)
                                ? "ui-quiz-action--disabled"
                                : "ui-quiz-action--ghost",
                        )}
                    >
                        {props.skipped ? ui.t("buttons.skipped", {}, "Skipped") : ui.t("buttons.skip", {}, "Skip")}
                    </button>
                ) : null}

                <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60 sm:text-right">
                    {props.skipped ? (
                        <span className="text-amber-700 dark:text-amber-300/80">
    {ui.t("status.skipped", {}, "↷ Skipped")}
  </span>
                    ) : props.checked ? (
                        props.ok === true ? (
                            <span className="text-emerald-700 dark:text-emerald-300/80">{ui.t("status.correct", {}, "✓ Correct")} </span>
                        ) : (
                            <span className="text-rose-700 dark:text-rose-300/80">{ui.t("status.notCorrect", {}, "✕ Not correct")}</span>
                        )
                    ) : (
                        <span className="text-neutral-500 dark:text-white/50">{ ui.t("status.notChecked", {}, "Not checked yet")}</span>
                    )}
                </div>
            </div>

            {/* ✅ explain section (anchor ref attached here) */}
            {props.checked && (q as any).explain ? (
                <div className="ui-quiz-explain" ref={props.explainRef}>
                    <MathMarkdown
                        className="text-xs text-neutral-600 dark:text-white/70 [&_.katex]:text-neutral-900 dark:[&_.katex]:text-white/90"
                        content={normalizeMath(explain)}
                    />
                </div>
            ) : null}
        </div>
    );
}