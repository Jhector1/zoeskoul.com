"use client";

import React from "react";
import type { Exercise } from "@/lib/practice/types";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import {normalizeMath} from "@/lib/markdown/normalizeMath";
import {ExercisePrompt} from "@/components/practice/kinds/KindHelper";

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

  checked: boolean; // current.submitted
  ok: boolean | null; // current.result?.ok ?? null
}) {
  const placeholder = (exercise as any).placeholder ?? "Enter a number…";
  const hasDraft = String(value ?? "").trim().length > 0;

  // ✅ theme-aware using your ui tokens
  const tone = checked
    ? ok === true
      ? "border-emerald-300/40 bg-emerald-300/10"
      : "border-rose-300/40 bg-rose-300/10"
    : hasDraft
      ? "border-sky-300/30 bg-sky-300/10"
      : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.06]";

  const focusTone = checked
    ? ok === true
      ? "focus:border-emerald-400/60"
      : "focus:border-rose-400/60"
    : "focus:border-sky-300/60";

  return (
    <div className="grid gap-2">
        {/*<>{JSON.stringify(exercise)}</>*/}
        <ExercisePrompt exercise={exercise} />

        <div className="ui-sketch-label">Your answer</div>

      <input
        className={[
          "h-11 w-full rounded-xl border px-3",
          "text-sm font-extrabold text-neutral-900 outline-none transition",
          "dark:text-white/90",
          tone,
          focusTone,
          "disabled:opacity-60 disabled:cursor-not-allowed",
        ].join(" ")}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="ui-sketch-muted">
        Tip: decimals are allowed unless the prompt says “integer”.
      </div>
    </div>
  );
}
