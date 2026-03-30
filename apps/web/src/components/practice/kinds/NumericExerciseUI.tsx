"use client";

import React from "react";
import type { Exercise } from "@/lib/practice/types";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

export default function NumericExerciseUI({
                                              exercise,
                                              value,
                                              onChange,
                                              disabled,
                                              checked,
                                              ok,
                                          }: {
    exercise: Exercise;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
}) {
    const placeholder = (exercise as any).placeholder ?? "Enter a number…";
    const hasDraft = String(value ?? "").trim().length > 0;

    const tone = checked
        ? ok === true
            ? "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.08)] ui-text"
            : "border-[rgb(var(--ui-danger)/0.24)] bg-[rgb(var(--ui-danger)/0.08)] ui-text"
        : hasDraft
            ? "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.08)] ui-text"
            : "ui-border ui-bg-surface ui-text";

    return (
        <div className="grid gap-2">
            <ExercisePrompt exercise={exercise} />

            <div className="ui-meta-strong">Your answer</div>

            <input
                className={[
                    "h-11 w-full rounded-lg border px-3 text-sm font-medium outline-none transition-colors",
                    tone,
                    "placeholder:[color:rgb(var(--ui-text-soft)/0.82)]",
                    "focus:border-[rgb(var(--ui-ring)/0.42)] focus:shadow-[0_0_0_3px_rgb(var(--ui-ring)/0.10)]",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                ].join(" ")}
                placeholder={placeholder}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />

            <div className="ui-meta">
                Tip: decimals are allowed unless the prompt says “integer”.
            </div>
        </div>
    );
}