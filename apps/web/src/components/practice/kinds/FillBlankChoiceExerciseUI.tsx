"use client";

import React, {useEffect, useMemo, useState} from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useSpeak } from "./_shared/useSpeak";

type Exercise = {
    title: string;
    prompt: string;

    // Use "__" as the blank marker (or "____")
    template: string;          // e.g. "Il y a un ____ mexicain dans ma rue."
    choices: string[];         // e.g. ["chargeur", "restaurant", "merci"]
    correct?: string;          // optional (parent can grade)
    locale?: string;
    hint?: string;
};

function renderTemplate(template: string, fill: string) {
    return template.replace(/_{2,}/g, fill || "______");
}

export default function FillBlankChoiceExerciseUI({
                                                      exercise,
                                                      value,
                                                      onChangeValue,
                                                      disabled,
                                                      checked,
                                                      ok,
                                                      reviewCorrectValue = null,
                                                  }: {
    exercise: Exercise;
    value: string;               // selected choice
    onChangeValue: (v: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    reviewCorrectValue?: string | null;
}) {
    const { speak, ttsStatus } = useSpeak();
    const [selected, setSelected] = useState<string>(value ?? "");

    const sentence = useMemo(
        () => renderTemplate(exercise.template, selected),
        [exercise.template, selected]
    );

    useEffect(() => {
        setSelected(value ?? "");
    }, [value]);
    const choose = (c: string) => {
        if (disabled) return;
        setSelected(c);
        onChangeValue(c);
    };

    const listen = () => void speak(sentence, { voice: "marin", speed: 1.0 });

    const shell =
        "rounded-2xl border p-4 border-neutral-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]";
    const muted = "text-neutral-600 dark:text-white/60";
    const text = "text-neutral-900 dark:text-white/90";
    const btn =
        "rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed " +
        "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:text-white/90";

    const optBase =
        "w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition " +
        "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 " +
        "dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:text-white/90";

    const optActive =
        "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";

    const pillBase = "rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums";
    const pillOk = "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    const pillBad = "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200";

    return (
        <div className={shell}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <ExercisePrompt exercise={exercise} />
                {typeof ok === "boolean" ? (
                    <div className={[pillBase, ok ? pillOk : pillBad].join(" ")}>
                        {ok ? "Correct" : "Try again"}
                    </div>
                ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className={btn} onClick={listen} disabled={disabled}>
                    🔊 Listen
                </button>
                {ttsStatus ? <div className={`text-xs font-semibold ${muted}`}>{ttsStatus}</div> : null}
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className={`text-xs font-semibold ${muted}`}>Sentence</div>
                <div className={`mt-2 text-lg font-semibold ${text}`}>{sentence}</div>
                {exercise.hint ? (
                    <div className={`mt-2 text-xs ${muted}`}>
                        Hint:{" "}
                        <span className="font-semibold text-neutral-700 dark:text-white/70">{exercise.hint}</span>
                    </div>
                ) : null}
            </div>

            <div className="mt-4 grid gap-2">
                {exercise.choices.map((c) => (
                    <button
                        key={c}
                        className={[optBase, selected === c ? optActive : ""].join(" ")}
                        onClick={() => choose(c)}
                        disabled={disabled}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {checked && ok === false && reviewCorrectValue ? (
                <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className={`text-xs font-semibold ${muted}`}>Correct</div>
                    <div className={`mt-1 text-sm font-semibold ${text}`}>{reviewCorrectValue}</div>
                    <button className={`${btn} mt-3`} onClick={() => void speak(renderTemplate(exercise.template, reviewCorrectValue))}>
                        🔊 Listen (correct)
                    </button>
                </div>
            ) : null}
        </div>
    );
}