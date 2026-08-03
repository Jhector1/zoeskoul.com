"use client";

import React, { useMemo } from "react";
import type { Exercise } from "@/lib/practice/types";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import {
  normalizePresentableOptions,
} from "@/lib/practice/presentationOrder";
import { useRandomizedOptions } from "./_shared/useRandomizedOptions";

export default function MultiChoiceExerciseUI({
                                                exercise,
                                                value,
                                                onChange,
                                                disabled,
                                                checked,
                                                ok,
                                                reviewCorrectIds = null,
                                              }: {
  exercise: Exercise;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  checked: boolean;
  ok: boolean | null;
  reviewCorrectIds?: string[] | null;
}) {
  const normalizedOptions = useMemo(
      () =>
          normalizePresentableOptions(
              (exercise as any)?.options ?? (exercise as any)?.choices ?? []
          ),
      [exercise],
  );

  const options = useRandomizedOptions(normalizedOptions);

  const selected = Array.isArray(value) ? value : [];

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

    let tone = "ui-border ui-bg-surface ui-text hover:ui-bg-hover";
    let boxTone = "ui-border bg-[rgb(var(--ui-surface-2)/1)]";

    if (!checked) {
      if (isOn) {
        tone =
            "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.08)] ui-text";
        boxTone =
            "border-[rgb(var(--ui-info)/0.32)] bg-[rgb(var(--ui-info)/0.28)]";
      }
      return { tone, boxTone };
    }

    if (canRevealPerOption) {
      if (isOn && isCorrect) {
        tone =
            "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.08)] ui-text";
        boxTone =
            "border-[rgb(var(--ui-accent)/0.32)] bg-[rgb(var(--ui-accent)/0.28)]";
      } else if (isOn && !isCorrect) {
        tone =
            "border-[rgb(var(--ui-danger)/0.24)] bg-[rgb(var(--ui-danger)/0.08)] ui-text";
        boxTone =
            "border-[rgb(var(--ui-danger)/0.32)] bg-[rgb(var(--ui-danger)/0.28)]";
      } else if (!isOn && isCorrect) {
        tone =
            "border-[rgb(var(--ui-accent)/0.18)] bg-[rgb(var(--ui-accent)/0.05)] ui-text";
        boxTone =
            "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.16)]";
      }
      return { tone, boxTone };
    }

    if (isOn) {
      if (ok === true) {
        tone =
            "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.08)] ui-text";
        boxTone =
            "border-[rgb(var(--ui-accent)/0.32)] bg-[rgb(var(--ui-accent)/0.28)]";
      } else if (ok === false) {
        tone =
            "border-[rgb(var(--ui-danger)/0.24)] bg-[rgb(var(--ui-danger)/0.08)] ui-text";
        boxTone =
            "border-[rgb(var(--ui-danger)/0.32)] bg-[rgb(var(--ui-danger)/0.28)]";
      }
    }

    return { tone, boxTone };
  }

  return (
      <div className="grid gap-2">
        <ExercisePrompt exercise={exercise} />

        <div className="ui-meta-strong">Choose all that apply</div>

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
                      "rounded-xl border p-3 text-left transition-colors",
                      tone,
                      "disabled:cursor-not-allowed disabled:opacity-60",
                    ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className={["mt-0.5 h-4 w-4 rounded border", boxTone].join(" ")} />
                    <div className="min-w-0 text-sm ui-text">
                      <MathMarkdown inline content={o.text} />
                    </div>
                  </div>
                </button>
            );
          })}
        </div>

      </div>
  );
}