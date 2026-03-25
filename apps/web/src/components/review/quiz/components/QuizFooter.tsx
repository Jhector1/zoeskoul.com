// src/components/review/quiz/components/QuizFooter.tsx
"use client";

import React from "react";
import { cn } from "@/lib/cn";
import {useTaggedT} from "@/i18n/tagged";

export default function QuizFooter(props: {
  checkedCount: number;
  correctCount: number;
  total: number;
  scorePct: number;

  isCompleted: boolean;
  passed: boolean;
  sequential: boolean;
  locked?: boolean;

  onResetClick: () => void;
}) {
  const pct = props.total > 0 ? Math.round((props.checkedCount / props.total) * 100) : 0;
  const ui = useTaggedT("reviewQuizUi");
  return (
    <div
      className={cn(
        "ui-quiz-card flex flex-wrap items-center justify-between gap-2",
        props.locked && "ui-quiz-card--locked",
      )}
    >
      <div className="min-w-0">
        <div className="text-xs font-extrabold text-neutral-600 dark:text-white/70">
          {ui.t(
              "footer.summary",
              { checked: props.checkedCount, total: props.total, correct: props.correctCount, score: props.scorePct },
              `Checked: ${props.checkedCount}/${props.total} • Correct: ${props.correctCount}/${props.total} • Score: ${props.scorePct}%`,
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="ui-progress-track" aria-label="Quiz progress">
            <div className="ui-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/50">{pct}%</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!props.isCompleted ? (
          <button
            type="button"
            onClick={props.onResetClick}
            className="ui-quiz-action ui-quiz-action--primary"
          >
            {ui.t("buttons.resetQuiz", {}, "Reset quiz")}          </button>
        ) : null}

        {props.locked ? (
          <span className="ui-pill ui-pill--warn">{ui.t("status.locked", {}, "Locked")}</span>
        ) : props.isCompleted ? (
            <span className="ui-pill ui-pill--good">{ui.t("status.completed", {}, "✓ Completed")}</span>
        ) : props.passed ? (
            <span className="ui-pill ui-pill--good">{ui.t("status.passed", {}, "✓ Passed")}</span>
        ) : (
          <span className="text-xs font-extrabold text-neutral-500 dark:text-white/50">
{props.sequential ? ui.t("footer.sequentialHint", {}, "Check each question in order to pass") : ui.t("footer.nonSequentialHint", {}, "Check all questions to pass")}          </span>
        )}
      </div>
    </div>
  );
}
