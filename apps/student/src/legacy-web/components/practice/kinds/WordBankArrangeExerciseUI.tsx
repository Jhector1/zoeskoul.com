"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useSpeak } from "./_shared/useSpeak";

type Exercise = {
    title: string;
    prompt: string;
    targetText: string;
    locale?: string;
    hint?: string;
    wordBank?: string[];
    distractors?: string[];
    ttsText?: string;
};

function tokenizeLoose(s: string): string[] {
    const re = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*|\d+|[^\s]/gu;
    return (s.match(re) ?? []).filter(Boolean);
}

function joinNice(tokens: string[]): string {
    const s = tokens.join(" ");
    return s.replace(/\s+([.,!?;:])/g, "$1").replace(/\s+'/g, "'").trim();
}

function shuffle<T>(arr: T[]) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// multiset remove from a SEED order (preserves order, removes only one occurrence)
function removeUsedFromSeed(seed: string[], used: string[]) {
    const out = seed.slice();
    for (const t of used) {
        const idx = out.indexOf(t);
        if (idx >= 0) out.splice(idx, 1);
    }
    return out;
}

export default function WordBankArrangeExerciseUI({
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

    const baseTokens = useMemo(() => {
        const fromTarget = exercise.wordBank?.length ? exercise.wordBank : tokenizeLoose(exercise.targetText);
        return [...fromTarget, ...(exercise.distractors ?? [])].filter(Boolean);
    }, [exercise.wordBank, exercise.targetText, exercise.distractors]);

    // stable “exercise identity”
    const baseKey = useMemo(
        () => `${exercise.targetText}::${baseTokens.join("|")}`,
        [exercise.targetText, baseTokens]
    );

    // Seed order should be stable for an exercise instance (don’t reshuffle every keystroke)
    const seedRef = useRef<string[]>([]);
    const [bank, setBank] = useState<string[]>([]);
    const [answer, setAnswer] = useState<string[]>(() => tokenizeLoose(value ?? ""));
    const answerRef = useRef(answer);

    useEffect(() => {
        answerRef.current = answer;
    }, [answer]);

    // Initialize / reset when exercise changes
    useEffect(() => {
        seedRef.current = shuffle(baseTokens);
        const nextAnswer = tokenizeLoose(value ?? "");
        const nextBank = removeUsedFromSeed(seedRef.current, nextAnswer);

        setAnswer(nextAnswer);
        setBank(nextBank);
    }, [baseKey, baseTokens, value]);

    // If parent externally changes value (reset / hydrate), sync local state.
    // IMPORTANT: do NOT shuffle on every value change that already matches local state.
    useEffect(() => {
        const currentStr = joinNice(answerRef.current);
        const incoming = String(value ?? "");

        if (incoming === currentStr) return;

        const nextAnswer = tokenizeLoose(incoming);
        const nextBank = removeUsedFromSeed(seedRef.current.length ? seedRef.current : shuffle(baseTokens), nextAnswer);

        setAnswer(nextAnswer);
        setBank(nextBank);
    }, [value, baseTokens]);

    // ✅ Emit to parent AFTER commit (no render-phase updates)
    useEffect(() => {
        const nextStr = joinNice(answer);
        const cur = String(value ?? "");
        if (nextStr === cur) return; // prevents loops
        onChangeValue(nextStr);
    }, [answer, value, onChangeValue]);

    const pushToAnswer = useCallback(
        (token: string, fromIndex: number) => {
            if (disabled) return;

            setBank((b) => {
                const next = b.slice();
                next.splice(fromIndex, 1);
                return next;
            });

            setAnswer((a) => [...a, token]);
        },
        [disabled]
    );

    const popFromAnswer = useCallback(
        (token: string, index: number) => {
            if (disabled) return;

            setAnswer((a) => {
                const next = a.slice();
                next.splice(index, 1);
                return next;
            });

            setBank((b) => [...b, token]);
        },
        [disabled]
    );

    // drag reorder inside answer
    const dragFromRef = useRef<number | null>(null);
    const onDragStart = (i: number) => (dragFromRef.current = i);
    const onDropOn = (to: number) => {
        const from = dragFromRef.current;
        dragFromRef.current = null;
        if (disabled) return;
        if (from == null || from === to) return;

        setAnswer((a) => {
            const copy = a.slice();
            const [item] = copy.splice(from, 1);
            copy.splice(to, 0, item);
            return copy;
        });
    };

    const shuffleBank = () => setBank((b) => shuffle(b));
    const clear = () => {
        if (disabled) return;
        setAnswer([]);
        setBank(removeUsedFromSeed(seedRef.current.length ? seedRef.current : shuffle(baseTokens), []));
    };

    const speakSentence = () => {
        const text = (exercise.ttsText ?? exercise.targetText).trim();
        void speak(text, {
            voice: "marin",
            speed: 1.0,
            instructions: "Speak clearly and naturally. Slightly slow. Friendly teacher.",
        });
    };

    const shell =
        "rounded-2xl border p-4 border-neutral-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]";
    const muted = "text-neutral-600 dark:text-white/60";
    const text = "text-neutral-900 dark:text-white/90";
    const btn =
        "rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed " +
        "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:text-white/90";

    const chip =
        "select-none rounded-xl border px-3 py-2 text-sm font-semibold " +
        "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 " +
        "dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:text-white/90";

    const answerSlot =
        "min-h-[70px] rounded-2xl border border-neutral-200/70 bg-white/70 p-3 " +
        "dark:border-white/10 dark:bg-white/[0.03]";

    const pillBase = "rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums";
    const pillOk = "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    const pillBad = "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200";

    return (
        <div className={shell}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <ExercisePrompt exercise={exercise as any} />
                {typeof ok === "boolean" ? (
                    <div className={[pillBase, ok ? pillOk : pillBad].join(" ")}>
                        {ok ? "Correct" : "Try again"}
                    </div>
                ) : null}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className={`text-xs font-semibold ${muted}`}>
                    Tap tiles to build the sentence. Drag tiles in the answer to reorder.
                </div>

                <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn} onClick={speakSentence} disabled={disabled}>
                        🔊 Listen
                    </button>
                    <button type="button" className={btn} onClick={shuffleBank} disabled={disabled}>
                        🔀 Shuffle
                    </button>
                    <button type="button" className={btn} onClick={clear} disabled={disabled}>
                        ↩ Clear
                    </button>
                </div>
            </div>

            {exercise.hint ? (
                <div className={`mt-2 text-xs ${muted}`}>
                    Hint:{" "}
                    <span className="font-semibold text-neutral-700 dark:text-white/70">{exercise.hint}</span>
                </div>
            ) : null}

            {ttsStatus ? <div className={`mt-2 text-xs font-semibold ${muted}`}>{ttsStatus}</div> : null}

            <div className="mt-4">
                <div className={`text-xs font-semibold ${muted}`}>Your sentence</div>
                <div className={`${answerSlot} mt-2`}>
                    <div className="flex flex-wrap gap-2">
                        {answer.length ? (
                            answer.map((t, i) => (
                                <button
                                    key={`${t}-${i}`}
                                    type="button"
                                    className={chip}
                                    title="Click to remove"
                                    onClick={() => popFromAnswer(t, i)}
                                    draggable={!disabled}
                                    onDragStart={() => onDragStart(i)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => onDropOn(i)}
                                >
                                    {t}
                                </button>
                            ))
                        ) : (
                            <div className={`text-sm font-semibold ${muted}`}>Tap words below…</div>
                        )}
                    </div>

                    <div className={`mt-3 text-xs ${muted}`}>
                        Preview: <span className={`font-semibold ${text}`}>{joinNice(answer) || "—"}</span>
                    </div>
                </div>
            </div>

            <div className="mt-4">
                <div className={`text-xs font-semibold ${muted}`}>Word bank</div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {bank.map((t, i) => (
                        <button
                            key={`${t}-${i}`}
                            type="button"
                            className={chip}
                            onClick={() => pushToAnswer(t, i)}
                            disabled={disabled}
                            title="Tap to add"
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {checked && ok === false && reviewCorrectValue ? (
                <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className={`text-xs font-semibold ${muted}`}>Correct</div>
                    <div className={`mt-1 text-sm font-semibold ${text}`}>{reviewCorrectValue}</div>
                    <button type="button" className={`${btn} mt-3`} onClick={() => void speak(reviewCorrectValue)}>
                        🔊 Listen (correct)
                    </button>
                </div>
            ) : null}
        </div>
    );
}