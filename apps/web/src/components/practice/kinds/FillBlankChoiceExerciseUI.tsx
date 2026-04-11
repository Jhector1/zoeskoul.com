"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useSpeak } from "./_shared/useSpeak";
import {
    normalizePresentableOptions,
} from "@/lib/practice/presentationOrder";
import { useRandomizedOptions } from "./_shared/useRandomizedOptions";

type Exercise = {
    title: string;
    prompt: string;
    template: string;
    choices: string[];
    correct?: string;
    locale?: string;
    hint?: string;
    audio?: boolean;
};

function renderTemplate(template: string, fill: string) {
    return template.replace(/_{2,}/g, fill || "______");
}

function renderSentenceWithBlank(template: string, fill: string) {
    const parts = template.split(/_{2,}/g);

    return (
        <>
            {parts.map((part, index) => (
                <React.Fragment key={`${part}-${index}`}>
                    <span>{part}</span>
                    {index < parts.length - 1 ? (
                        <span className="mx-1 inline-flex align-middle">
              <span className={fill ? "ui-pill-good" : "ui-pill-neutral"}>
                {fill || "Choose"}
              </span>
            </span>
                    ) : null}
                </React.Fragment>
            ))}
        </>
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
    exercise: Exercise;
    value: string;
    onChangeValue: (v: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    reviewCorrectValue?: string | null;
}) {
    const { speak, ttsStatus } = useSpeak();

    const [selected, setSelected] = useState<string>(value ?? "");

    useEffect(() => {
        setSelected(value ?? "");
    }, [value]);

    const audioEnabled = exercise.audio === true;

    const normalizedChoices = useMemo(
        () => normalizePresentableOptions(exercise.choices ?? []),
        [exercise.choices],
    );

    const choices = useRandomizedOptions(normalizedChoices);

    const spokenSentence = useMemo(
        () => renderTemplate(exercise.template, selected),
        [exercise.template, selected],
    );

    const choose = (choice: string) => {
        if (disabled) return;
        setSelected(choice);
        onChangeValue(choice);
    };

    const listenCurrent = () =>
        void speak(spokenSentence, { voice: "marin", speed: 1.0 });

    const listenCorrect = () => {
        if (!reviewCorrectValue) return;
        void speak(renderTemplate(exercise.template, reviewCorrectValue), {
            voice: "marin",
            speed: 1.0,
        });
    };

    return (
        <div className="ui-review-topic-shell space-y-4">
            <div className="flex items-start justify-between gap-3">
                <ExercisePrompt exercise={exercise} />
            </div>

            <div className="ui-review-note space-y-3 border-none">
                <div className="flex items-start justify-between gap-3">
                    {audioEnabled ? (
                        <button
                            type="button"
                            className="ui-btn-secondary"
                            onClick={listenCurrent}
                            disabled={disabled}
                        >
                            Listen
                        </button>
                    ) : null}
                </div>

                <div className="ui-title-sm leading-8">
                    {renderSentenceWithBlank(exercise.template, selected)}
                </div>

                {audioEnabled && ttsStatus ? (
                    <div className="ui-quiz-status">{ttsStatus}</div>
                ) : null}
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
                            className={active ? "ui-review-topic-btn-active" : "ui-review-topic-btn"}
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
                        <div className="ui-title-sm mt-1">{reviewCorrectValue}</div>
                    </div>

                    {audioEnabled ? (
                        <div>
                            <button
                                type="button"
                                className="ui-btn-secondary"
                                onClick={listenCorrect}
                            >
                                Listen
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}