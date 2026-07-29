"use client";

import React, { useMemo } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import type { PseudocodeInputExercise } from "@/lib/practice/types";

const KEYWORDS = [
    "PROCEDURE", "IF", "ELSE", "WHILE", "FOR", "RETURN", "CREATE",
    "SET", "SWAP", "ENQUEUE", "DEQUEUE", "PUSH", "POP", "VISIT", "NULL",
];

export default function PseudocodeInputExerciseUI({
    exercise,
    value,
    onChange,
    disabled,
    checked,
    ok,
}: {
    exercise: PseudocodeInputExercise;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
}) {
    const rows = Math.max(8, Math.min(28, exercise.editor?.minRows ?? 12));
    const lineCount = useMemo(() => Math.max(rows, String(value ?? "").split("\n").length), [rows, value]);
    const showLineNumbers = exercise.editor?.showLineNumbers !== false;
    const tone = checked && ok === false
        ? "border-[rgb(var(--ui-danger)/0.28)]"
        : checked && ok === true
            ? "border-[rgb(var(--ui-accent)/0.28)]"
            : "ui-border";

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Tab" || exercise.editor?.allowIndentation === false) return;
        event.preventDefault();
        const target = event.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const next = `${value.slice(0, start)}    ${value.slice(end)}`;
        onChange(next);
        requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = start + 4;
        });
    };

    return (
        <div>
            <ExercisePrompt exercise={exercise} />
            <div className="mt-4 overflow-hidden rounded-xl border ui-border ui-bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b ui-border px-3 py-2">
                    <div>
                        <div className="ui-meta-strong">Pseudocode</div>
                        <div className="ui-meta">{exercise.mode.replace(/_/g, " ")} · ZoeSkoul v1</div>
                    </div>
                    {exercise.editor?.showKeywordReference !== false ? (
                        <div className="flex max-w-full flex-wrap justify-end gap-1">
                            {KEYWORDS.slice(0, 8).map((keyword) => (
                                <code key={keyword} className="rounded bg-[rgb(var(--ui-fill)/0.65)] px-1.5 py-0.5 text-[10px] ui-text-soft">
                                    {keyword}
                                </code>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className={`grid ${showLineNumbers ? "grid-cols-[3rem_1fr]" : "grid-cols-1"} border ${tone}`}>
                    {showLineNumbers ? (
                        <pre aria-hidden="true" className="select-none overflow-hidden border-r ui-border bg-[rgb(var(--ui-fill)/0.42)] px-2 py-3 text-right font-mono text-xs leading-6 ui-text-soft">
                            {Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")}
                        </pre>
                    ) : null}
                    <textarea
                        value={value ?? ""}
                        disabled={disabled}
                        rows={rows}
                        spellCheck={false}
                        onKeyDown={handleKeyDown}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder="Write the algorithm steps here…"
                        className="min-h-[13rem] w-full resize-y bg-transparent px-3 py-3 font-mono text-sm leading-6 ui-text outline-none placeholder:ui-text-soft disabled:cursor-not-allowed disabled:opacity-60"
                    />
                </div>
            </div>
            {exercise.hint ? <div className="mt-3 ui-meta">Hint: <span className="ui-text">{exercise.hint}</span></div> : null}
        </div>
    );
}
