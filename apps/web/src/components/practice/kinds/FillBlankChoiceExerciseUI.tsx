"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { normalizePresentableOptions } from "@/lib/practice/presentationOrder";
import { useRandomizedOptions } from "./_shared/useRandomizedOptions";
import type { FillBlankChoiceExercise } from "@/lib/practice/types";

const BLANK_PATTERN = /\[blank[^\]]*\]|_{2,}/gi;

function renderTemplate(template: string, fill: string) {
    return template.replace(BLANK_PATTERN, fill || "______");
}

function getBlankCharCount(choices: string[]) {
    const longest = Math.max(...choices.map((choice) => choice.length), 8);

    // Deterministic width based on the longest choice.
    // Adds breathing room but caps very long answers.
    return Math.min(Math.max(longest + 4, 14), 36);
}

function renderSentenceWithBlank(
    template: string,
    fill: string,
    blankCharCount: number,
) {
    const parts = template.split(BLANK_PATTERN);
    const underline = "_".repeat(blankCharCount);

    return (
        <span className="inline-flex flex-wrap items-end gap-y-3">
            {parts.map((part, index) => (
                <React.Fragment key={`${part}-${index}`}>
                    <span>{part}</span>

                    {index < parts.length - 1 ? (
                        <span
                            className="mx-2 inline-flex flex-col items-center align-bottom leading-none"
                            style={{ width: `${blankCharCount}ch` }}
                        >
                            <span className="min-h-[1rem] max-w-full truncate whitespace-nowrap text-center text-sm font-semibold leading-none text-current">
                                {fill || "\u00A0"}
                            </span>

                            <span
                                className="-mt-0.5 block w-full overflow-hidden whitespace-nowrap text-center leading-none text-current"
                                aria-hidden="true"
                            >
                                {underline}
                            </span>
                        </span>
                    ) : null}
                </React.Fragment>
            ))}
        </span>
    );
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
    exercise: FillBlankChoiceExercise;
    value: string;
    onChangeValue: (v: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    reviewCorrectValue?: string | null;
}) {
    const [selected, setSelected] = useState<string>(value ?? "");

    useEffect(() => {
        setSelected(value ?? "");
    }, [value]);

    const normalizedChoices = useMemo(
        () => normalizePresentableOptions(exercise.choices ?? []),
        [exercise.choices],
    );

    const choices = useRandomizedOptions(normalizedChoices);

    const blankCharCount = useMemo(
        () => getBlankCharCount(normalizedChoices.map((choice) => choice.text)),
        [normalizedChoices],
    );

    const choose = (choice: string) => {
        if (disabled) return;

        setSelected(choice);
        onChangeValue(choice);
    };

    return (
        <div className="ui-review-topic-shell space-y-4">
            <div className="flex items-start justify-between gap-3">
                <ExercisePrompt exercise={exercise} />
            </div>

            <div className="ui-review-note space-y-3 border-none">
                <div className="ui-title-sm leading-10">
                    {renderSentenceWithBlank(
                        exercise.template,
                        selected,
                        blankCharCount,
                    )}
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                {choices.map((choice) => {
                    const active = selected === choice.text;

                    return (
                        <button
                            key={choice.id}
                            type="button"
                            onClick={() => choose(choice.text)}
                            disabled={disabled}
                            className={
                                active
                                    ? "ui-review-topic-btn-active"
                                    : "ui-review-topic-btn"
                            }
                        >
                            <div className="ui-title-sm">{choice.text}</div>
                        </button>
                    );
                })}
            </div>

            {checked && ok === false && reviewCorrectValue ? (
                <div className="ui-review-note-danger space-y-3">
                    <div>
                        <div className="ui-kicker">Correct answer</div>
                        <div className="ui-title-sm mt-1">
                            {reviewCorrectValue}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}