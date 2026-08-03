"use client";

import React, { useEffect, useRef } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

export default function TextInputExerciseUI({
                                                exercise,
                                                value,
                                                onChange,
                                                disabled,
                                                checked,
                                                ok,
                                                reviewCorrectText = null,
                                            }: {
    exercise: any;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    reviewCorrectText?: string | null;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const hasDraft = String(value ?? "").trim().length > 0;
    const graded = checked && typeof ok === "boolean";

    useEffect(() => {
        if (checked && ok == null) {
            inputRef.current?.blur();
        }
    }, [checked, ok]);

    const tone = graded
        ? ok === true
            ? "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.08)] ui-text"
            : "border-[rgb(var(--ui-danger)/0.24)] bg-[rgb(var(--ui-danger)/0.08)] ui-text"
        : hasDraft
            ? "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.08)] ui-text"
            : "ui-border ui-bg-surface ui-text";

    return (
        <div>
            <ExercisePrompt exercise={exercise} />

            <div className="mt-4">
                <div className="ui-meta-strong">Your answer</div>

                <input
                    ref={inputRef}
                    value={value ?? ""}
                    disabled={disabled}
                    placeholder={exercise.placeholder ?? "Type here…"}
                    onChange={(e) => onChange(e.target.value)}
                    className={[
                        "mt-1 h-11 w-full rounded-lg border px-3 text-sm font-medium outline-none transition-colors",
                        "placeholder:[color:rgb(var(--ui-text-soft)/0.82)]",
                        tone,
                        "focus:border-[rgb(var(--ui-ring)/0.42)] focus:shadow-[0_0_0_3px_rgb(var(--ui-ring)/0.10)]",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                    ].join(" ")}
                />

                {graded && ok === false && reviewCorrectText ? (
                    <div className="mt-3 ui-surface-muted p-3">
                        <div className="ui-meta-strong">Correct</div>
                        <div className="mt-1 ui-title-sm">{reviewCorrectText}</div>
                    </div>
                ) : null}

                {exercise.hint ? (
                    <div className="mt-3 ui-meta">
                        Hint: <span className="ui-text">{exercise.hint}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}