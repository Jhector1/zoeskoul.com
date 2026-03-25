// src/components/practice/kinds/MultiChoiceExerciseUI.tsx
"use client";

import React, { useMemo } from "react";
import type { Exercise } from "@/lib/practice/types";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import {ExercisePrompt} from "@/components/practice/kinds/KindHelper";

type Opt = { id: string; text: string };

function normalizeOptions(ex: any): Opt[] {
  const raw = ex?.options ?? ex?.choices ?? [];
  return (Array.isArray(raw) ? raw : []).map((o: any, i: number) => ({
    id: String(o?.id ?? o?.optionId ?? o?.value ?? o?.key ?? i),
    text: String(
      o?.text ??
        o?.label ??
        o?.content ??
        o?.latex ??
        o?.contentLatex ??
        "",
    ),
  }));
}

export default function MultiChoiceExerciseUI({
  exercise,
  value,
  onChange,
  disabled,

  checked,
  ok,

  // ✅ NEW: during review, pass the correct ids to highlight in-place
  reviewCorrectIds = null,
}: {
  exercise: Exercise;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;

  checked: boolean; // current.submitted || current.result
  ok: boolean | null;

  reviewCorrectIds?: string[] | null;
}) {
  const options = useMemo(() => normalizeOptions(exercise as any), [exercise]);
  const selected = Array.isArray(value) ? value : [];

  // ✅ Correct ids:
  // 1) prefer reviewCorrectIds (from expected)
  // 2) fallback to exercise-provided correct ids (if any)
  const correctIds: string[] = useMemo(() => {
    if (Array.isArray(reviewCorrectIds) && reviewCorrectIds.length) {
      return reviewCorrectIds.map((x) => String(x));
    }

    const ex: any = exercise as any;
    const raw =
      ex?.answerIds ??
      ex?.correctOptionIds ??
      ex?.correctIds ??
      ex?.answers ??
      null;

    if (Array.isArray(raw)) return raw.map((x: any) => String(x));
    if (typeof raw === "string") return [raw];
    return [];
  }, [exercise, reviewCorrectIds]);

  const canRevealPerOption = correctIds.length > 0;

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    onChange(next);
  }

  function toneForOption(optionId: string) {
    const isOn = selected.includes(optionId);
    const isCorrect = correctIds.includes(optionId);

    // Defaults
   // was:
// let tone = "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]";
// let boxTone = "border-white/20 bg-black/20";

// use:
let tone =
  "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.10]";
let boxTone =
  "border-neutral-200 bg-white dark:border-white/20 dark:bg-black/20";

    // Before checking: selected is BLUE
    if (!checked) {
      if (isOn) {
        tone = "border-sky-300/30 bg-sky-300/10";
        boxTone = "border-sky-300/50 bg-sky-300/30";
      }
      return { tone, boxTone };
    }

    // After checking:
    // If we know correctIds, color each selected as correct/wrong; reveal correct unselected too
    if (canRevealPerOption) {
      if (isOn && isCorrect) {
        tone = "border-emerald-300/40 bg-emerald-300/12";
        boxTone = "border-emerald-300/60 bg-emerald-300/40";
      } else if (isOn && !isCorrect) {
        tone = "border-rose-300/40 bg-rose-300/12";
        boxTone = "border-rose-300/60 bg-rose-300/40";
      } else if (!isOn && isCorrect) {
        tone = "border-emerald-300/25 bg-emerald-300/08";
        boxTone = "border-emerald-300/35 bg-emerald-300/20";
      }
      return { tone, boxTone };
    }

    // If we DON'T know correctIds, we can only color the selection as a whole using ok.
    if (isOn) {
      if (ok === true) {
        tone = "border-emerald-300/40 bg-emerald-300/12";
        boxTone = "border-emerald-300/60 bg-emerald-300/40";
      } else if (ok === false) {
        tone = "border-rose-300/40 bg-rose-300/12";
        boxTone = "border-rose-300/60 bg-rose-300/40";
      }
    }

    return { tone, boxTone };
  }
// ✅ only className strings changed

  return (
    <div className="grid gap-2">
      <ExercisePrompt exercise={exercise} />

      <div className="text-xs font-extrabold text-neutral-600 dark:text-white/70">
        Choose all that apply
      </div>

      <div className="grid gap-2">
        {options.map((o) => {
          const { tone, boxTone } = toneForOption(o.id);

          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o.id)}
              className={[
                "rounded-2xl border p-3 text-left transition",
                // keep your tone logic, but ensure default tones are theme-aware inside toneForOption (see note below)
                tone,
                "disabled:opacity-60 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <div className={["mt-0.5 h-4 w-4 rounded border", boxTone].join(" ")} />
                <div className="min-w-0 text-sm text-neutral-900 dark:text-white/90">
                  <MathMarkdown inline content={o.text} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-neutral-500 dark:text-white/45">
        Stored as <span className="font-mono">optionIds[]</span> for submit.
      </div>
    </div>
  );

}
