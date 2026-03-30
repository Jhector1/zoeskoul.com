"use client";

import React, { useMemo } from "react";
import type { Exercise } from "@/lib/practice/types";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useTaggedT } from "@/i18n/tagged";

type Opt = { id: string; text: string };

function normalizeOptions(ex: any): Opt[] {
    const raw = ex?.options ?? ex?.choices ?? [];
    return (Array.isArray(raw) ? raw : []).map((o: any, i: number) => ({
        id: String(o?.id ?? o?.optionId ?? o?.value ?? o?.key ?? i),
        text: String(o?.text ?? o?.label ?? o?.content ?? o?.latex ?? o?.contentLatex ?? ""),
    }));
}

export default function SingleChoiceExerciseUI({
                                                   exercise,
                                                   value,
                                                   onChange,
                                                   disabled,
                                                   checked = false,
                                                   ok = null,
                                                   reviewCorrectId = null,
                                               }: {
    exercise: Exercise;
    value: string;
    onChange: (id: string) => void;
    disabled: boolean;
    checked?: boolean;
    ok?: boolean | null;
    reviewCorrectId?: string | null;
}) {
    const ui = useTaggedT("practiceUi.singleChoice");
    const options = useMemo(() => normalizeOptions(exercise as any), [exercise]);

    return (
        <div className="grid gap-2">
            <ExercisePrompt exercise={exercise} />

            <div className="ui-meta-strong">
                {ui.t("chooseOne", {}, "Choose one")}
            </div>

            <div className="grid gap-2">
                {options.map((o) => {
                    const selected = value === o.id;
                    const hasReviewCorrect = typeof reviewCorrectId === "string" && reviewCorrectId.length > 0;
                    const isCorrect = hasReviewCorrect ? reviewCorrectId === o.id : false;

                    const tone = !checked
                        ? selected
                            ? "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.08)] ui-text"
                            : "ui-border ui-bg-surface ui-text hover:ui-bg-hover"
                        : hasReviewCorrect
                            ? isCorrect
                                ? "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.08)] ui-text"
                                : selected && !isCorrect
                                    ? "border-[rgb(var(--ui-danger)/0.24)] bg-[rgb(var(--ui-danger)/0.08)] ui-text"
                                    : "ui-border ui-bg-surface ui-text"
                            : selected
                                ? ok === true
                                    ? "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.08)] ui-text"
                                    : ok === false
                                        ? "border-[rgb(var(--ui-danger)/0.24)] bg-[rgb(var(--ui-danger)/0.08)] ui-text"
                                        : "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.08)] ui-text"
                                : "ui-border ui-bg-surface ui-text";

                    const dotTone = !checked
                        ? selected
                            ? "border-[rgb(var(--ui-info)/0.32)] bg-[rgb(var(--ui-info)/0.28)]"
                            : "ui-border bg-[rgb(var(--ui-surface-2)/1)]"
                        : hasReviewCorrect
                            ? isCorrect
                                ? "border-[rgb(var(--ui-accent)/0.32)] bg-[rgb(var(--ui-accent)/0.28)]"
                                : selected && !isCorrect
                                    ? "border-[rgb(var(--ui-danger)/0.32)] bg-[rgb(var(--ui-danger)/0.28)]"
                                    : "ui-border bg-[rgb(var(--ui-surface-2)/1)]"
                            : selected
                                ? ok === true
                                    ? "border-[rgb(var(--ui-accent)/0.32)] bg-[rgb(var(--ui-accent)/0.28)]"
                                    : ok === false
                                        ? "border-[rgb(var(--ui-danger)/0.32)] bg-[rgb(var(--ui-danger)/0.28)]"
                                        : "border-[rgb(var(--ui-info)/0.32)] bg-[rgb(var(--ui-info)/0.28)]"
                                : "ui-border bg-[rgb(var(--ui-surface-2)/1)]";

                    return (
                        <button
                            key={o.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(o.id)}
                            className={[
                                "rounded-xl border p-3 text-left transition-colors",
                                tone,
                                "disabled:cursor-not-allowed disabled:opacity-60",
                            ].join(" ")}
                        >
                            <div className="flex items-start gap-3">
                                <div className={["mt-0.5 h-4 w-4 rounded-full border", dotTone].join(" ")} />
                                <div className="min-w-0 text-sm ui-text">
                                    <MathMarkdown inline content={o.text} />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="ui-meta">
                {ui.t("storedAsPrefix", {}, "Stored as")}{" "}
                <span className="font-mono">optionId</span>{" "}
                {ui.t("storedAsSuffix", {}, "for submit.")}
            </div>
        </div>
    );
}