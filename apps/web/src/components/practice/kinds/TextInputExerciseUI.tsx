// src/components/practice/kinds/TextInputExerciseUI.tsx
"use client";

import React, { useEffect, useRef } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import {ExercisePrompt} from "@/components/practice/kinds/KindHelper";

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

  // ✅ only show green/red when we actually have a boolean result
  const graded = checked && typeof ok === "boolean";

  // ✅ if "reveal" sets checked=true but ok=null, don't keep focus (prevents "auto red focus")
  useEffect(() => {
    if (checked && ok == null) {
      inputRef.current?.blur();
    }
  }, [checked, ok]);

  // ✅ card stays neutral (no green/red panel)
  const cardBorder = "border-neutral-200 dark:border-white/10";
  const cardBg = "bg-white dark:bg-white/[0.03]";

  // ✅ same style logic as NumericExerciseUI (but uses graded instead of checked)
  const tone = graded
    ? ok === true
      ? "border-emerald-300/40 bg-emerald-300/10"
      : "border-rose-300/40 bg-rose-300/10"
    : hasDraft
      ? "border-sky-300/30 bg-sky-300/10"
      : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.06]";

  const focusTone = graded
    ? ok === true
      ? "focus:border-emerald-400/60"
      : "focus:border-rose-400/60"
    : "focus:border-sky-300/60";

  return (
    <div>
        <ExercisePrompt exercise={exercise} />


        <div className="mt-4">
        <div className="text-xs font-extrabold text-neutral-600 dark:text-white/70">
          Your answer
        </div>

        <input
          ref={inputRef}
          value={value ?? ""}
          disabled={disabled}
          placeholder={exercise.placeholder ?? "Type here…"}
          onChange={(e) => onChange(e.target.value)}
          className={[
            "mt-1 h-11 w-full rounded-xl border px-3",
            "text-sm font-extrabold text-neutral-900 outline-none transition",
            "placeholder:text-neutral-400 dark:text-white/90 dark:placeholder:text-white/40",
            tone,
            focusTone,
            // blue hover only when not graded (and not disabled)
            !graded && !disabled
              ? "hover:!border-sky-300/60 dark:hover:!border-sky-300/40"
              : "",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          ].join(" ")}
        />

        {graded && ok === false && reviewCorrectText ? (
          <div className="mt-3 ui-soft p-3">
            <div className="text-xs font-extrabold text-neutral-600 dark:text-white/70">
              Correct
            </div>
            <div className="mt-1 text-sm font-black text-neutral-900 dark:text-white/90">
              {reviewCorrectText}
            </div>
          </div>
        ) : null}

        {exercise.hint ? (
          <div className="mt-3 text-xs font-extrabold text-neutral-500 dark:text-white/60">
            Hint:{" "}
            <span className="font-bold text-neutral-700 dark:text-white/70">
              {exercise.hint}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
