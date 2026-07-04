"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { useTaggedT } from "@/i18n/tagged";

export default function QuizFooter(props: {
  checkedCount: number;
  correctCount: number;
  total: number;
  scorePct: number;

  isCompleted: boolean;
  passed: boolean;
  sequential: boolean;
  locked?: boolean;
}) {
  const pct = props.total > 0 ? Math.round((props.checkedCount / props.total) * 100) : 0;
  const ui = useTaggedT("reviewQuizUi");

  return (
      <div
          className={cn(
              "ui-quiz-card flex flex-wrap items-center justify-between gap-2",
              props.locked && "ui-quiz-card-locked","rounded-none",
          )}
      >
        <div className="min-w-0">
          <div className="ui-review-footer-summary">
            {ui.t(
                "footer.summary",
                {
                  checked: props.checkedCount,
                  total: props.total,
                  correct: props.correctCount,
                  score: props.scorePct,
                },
                `Checked: ${props.checkedCount}/${props.total} • Correct: ${props.correctCount}/${props.total} • Score: ${props.scorePct}%`,
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="ui-progress-track" aria-label="Quiz progress">
              <div className="ui-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="ui-review-footer-percent">{pct}%</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {props.locked ? (
              <span className="ui-pill-warn">{ui.t("status.locked", {}, "Locked")}</span>
          ) : props.isCompleted ? (
              <span className="ui-pill-good">{ui.t("status.completed", {}, "✓ Completed")}</span>
          ) : props.passed ? (
              <span className="ui-pill-good">{ui.t("status.passed", {}, "✓ Passed")}</span>
          ) : (
              <span className="ui-review-footer-hint">
            {props.sequential
                ? ui.t("footer.sequentialHint", {}, "Check each question in order to pass")
                : ui.t("footer.nonSequentialHint", {}, "Check all questions to pass")}
          </span>
          )}
        </div>
      </div>
  );
}
