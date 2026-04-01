"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import type { ReviewQuestion } from "@/lib/subjects/types";
import type { PracticeState } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import { isEmptyPracticeAnswer } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import type { VectorPadState } from "@/components/vectorpad/types";

import ExerciseRenderer from "@/components/practice/ExerciseRenderer";
import PracticeHelpPanel from "@/components/practice/PracticeHelpPanel";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";

import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import type { Exercise } from "@/lib/practice/types";
import {
  DEFAULT_PRACTICE_HELP_POLICY,
  getNextPracticeHelpStepKey,
  PRACTICE_HELP_STEP_DEF_MAP,
} from "@/lib/practice/help/steps";

export default function QuizPracticeCard(props: {
  q: Extract<ReviewQuestion, { kind: "practice" }>;
  ps?: PracticeState;

  unlocked: boolean;
  isCompleted: boolean;
  locked: boolean;
  unlimitedAttempts: boolean;
  strictSequential: boolean;

  seqOrder: number;

  padRef: React.MutableRefObject<VectorPadState>;
  onUpdateItem: (patch: any) => void;
  onSubmit: () => void;
  onHelp: (stepKey?: string) => void;
  onRetryExercise?: () => void;
  excused?: boolean;
  onExcused?: () => void;
}) {
  const {
    q,
    ps,
    unlocked,
    isCompleted,
    locked,
    unlimitedAttempts,
    strictSequential,
    seqOrder,
    padRef,
    onUpdateItem,
    onSubmit,
    onHelp,
      onRetryExercise,
  } = props;

  const tools = useReviewTools();
  const excused = Boolean(props.excused);

  const ui = useTaggedT("reviewQuizUi");
  const { raw } = useTaggedT();

  const ex: Exercise | null = useMemo(() => {
    if (!ps?.exercise) return null;
    return resolveDeepTagged(ps.exercise, (key) => raw(key, "")) as Exercise;
  }, [ps?.exercise, raw]);

  const toolsEnabled = Boolean(tools?.enabled);
  const isCodeInput = ex?.kind === "code_input";
  const codeRunnerMode: "embedded" | "tools" =
      toolsEnabled && isCodeInput ? "tools" : "embedded";

  const codeTools = toolsEnabled && isCodeInput ? (tools as any) : null;
  const codeInputId = toolsEnabled && isCodeInput ? q.id : undefined;

  const updateItemSafe = useCallback(
      (patch: any) => {
        if (!unlocked || isCompleted || locked || excused) return;
        onUpdateItem(patch);
      },
      [unlocked, isCompleted, locked, excused, onUpdateItem],
  );

  const attemptsCapped = useMemo(() => {
    if (!ps) return false;
    if (unlimitedAttempts) return false;

    const max = ps.maxAttempts;
    if (max == null) return false;

    return ps.attempts >= max;
  }, [ps, unlimitedAttempts]);

  const hasInput = useMemo(() => {
    if (!ex || !ps?.item) return false;
    return !isEmptyPracticeAnswer(ex, ps.item, padRef?.current);
  }, [ex, ps?.item, padRef]);

  useEffect(() => {
    if (!toolsEnabled) return;
    if (!tools) return;
    if (!ex) return;
    if (ex.kind !== "code_input") return;
    if (!ps) return;

    const doneForFlow =
        ps.ok === true || excused || (!strictSequential && attemptsCapped);
    const eligible = unlocked && !locked && !isCompleted && !excused;

    tools.setCodeInputMeta(q.id, {
      order: seqOrder,
      eligible,
      done: doneForFlow,
    });
  }, [
    toolsEnabled,
    tools,
    ex,
    ps,
    q.id,
    unlocked,
    locked,
    isCompleted,
    excused,
    strictSequential,
    attemptsCapped,
    seqOrder,
  ]);

  const disableCheck =
      !unlocked ||
      isCompleted ||
      locked ||
      excused ||
      (ps?.busy ?? false) ||
      attemptsCapped ||
      ps?.ok === true ||
      !hasInput;

  const enabledHelpSteps = ps?.helpPolicy?.stepKeys?.length
      ? ps.helpPolicy.stepKeys
      : DEFAULT_PRACTICE_HELP_POLICY.stepKeys;

  const openedHelpSteps = ps?.item?.help?.openedStepKeys ?? [];

  const nextHelpStepKey = getNextPracticeHelpStepKey(
      enabledHelpSteps,
      openedHelpSteps,
  );

  const nextHelpLabel = nextHelpStepKey
      ? PRACTICE_HELP_STEP_DEF_MAP.get(nextHelpStepKey)?.label ?? nextHelpStepKey
      : null;

  const disableHelp =
      !unlocked ||
      isCompleted ||
      locked ||
      excused ||
      (ps?.busy ?? false) ||
      ps?.ok === true ||
      !nextHelpStepKey;

  const disableSkip =
      !unlocked || isCompleted || locked || excused || ps?.ok === true;

  const hasOpenedHelp = Boolean(ps?.item?.help?.openedStepKeys?.length);

  const btnLabel = ps?.busy ? (
      <span className="inline-flex items-center gap-2">
      <span className="ui-quiz-spinner" />
        {ui.t("practice.checking", {}, "Checking…")}
    </span>
  ) : (
      ui.t("buttons.checkAnswer", {}, "Check this answer")
  );

  const maxForRenderer = ps?.maxAttempts ?? Number.POSITIVE_INFINITY;

  return (
      <div className={["ui-surface p-2", !unlocked ? "opacity-70" : ""].join(" ")}>
        {!unlocked ? (
            <div className="ui-quiz-hint">
              {ui.t(
                  "unlockHint",
                  {},
                  "Answer the previous question correctly to unlock this one.",
              )}
            </div>
        ) : null}

        {ps?.loading ? (
            <div className="mt-2 ui-quiz-status-soft flex items-center gap-2">
              <span>{ui.t("practice.loadingExercise", {}, "Loading exercise…")}</span>
            </div>
        ) : ps?.error ? (
            <div className="ui-quiz-note-danger">
              <div>{ps.error}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                {props.onRetryExercise ? (
                    <button
                        type="button"
                        onClick={props.onRetryExercise}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                      Retry
                    </button>
                ) : null}

                <button
                    type="button"
                    onClick={props.onExcused}
                    disabled={disableSkip}
                    className={[
                      "ui-quiz-action",
                      disableSkip ? "ui-quiz-action--disabled" : "ui-quiz-action--ghost",
                    ].join(" ")}
                >
                  {props.excused
                      ? ui.t("buttons.excused", {}, "Excused")
                      : ui.t("buttons.continue", {}, "Continue")}
                </button>
              </div>
            </div>
        ) : ex && ps?.item ? (
            <div className="mt-1">
              <div className="mt-2">
                <ExerciseRenderer
                    exercise={ex}
                    current={ps.item}
                    busy={ps.busy || !unlocked || isCompleted || locked}
                    isAssignmentRun={false}
                    maxAttempts={maxForRenderer as any}
                    padRef={padRef as any}
                    updateCurrent={updateItemSafe}
                    readOnly={!unlocked || isCompleted || locked}
                    codeRunnerMode={codeRunnerMode}
                    codeTools={codeTools}
                    codeInputId={codeInputId}
                />
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                      type="button"
                      onClick={onSubmit}
                      disabled={disableCheck}
                      data-flow-focus="1"
                      className={[
                        "ui-quiz-action",
                        disableCheck ? "ui-quiz-action--disabled" : "ui-quiz-action--primary",
                      ].join(" ")}
                  >
                    {btnLabel}
                  </button>

                  {!hasOpenedHelp ? (
                      <button
                          type="button"
                          onClick={() => onHelp(nextHelpStepKey ?? undefined)}
                          disabled={disableHelp}
                          className={[
                            "ui-quiz-action",
                            disableHelp ? "ui-quiz-action--disabled" : "ui-quiz-action--ghost",
                          ].join(" ")}
                      >
                        {nextHelpLabel ?? ui.t("buttons.help", {}, "Help")}
                      </button>
                  ) : null}
                </div>

                <div className="ui-quiz-checkrow-status">
              <span className="whitespace-normal">
                {ui.t(
                    "practice.attempts",
                    { n: ps.attempts, max: ps.maxAttempts == null ? "∞" : ps.maxAttempts },
                    `Attempts: ${ps.attempts}/${ps.maxAttempts == null ? "∞" : ps.maxAttempts}`,
                )}
              </span>

                  {ps.ok === true ? (
                      <span className="ml-2 whitespace-nowrap ui-quiz-status-good">
                  ✓ Correct
                </span>
                  ) : ps.ok === false && ps.item?.result ? (
                      <span className="ml-2 whitespace-nowrap ui-quiz-status-danger">
                  ✕ Not correct
                </span>
                  ) : null}
                </div>
              </div>

              <PracticeHelpPanel
                  exercise={ex}
                  current={ps.item}
                  help={ps.item.help}
                  helpPolicy={ps.helpPolicy}
                  updateCurrent={updateItemSafe}
                  onOpenHelp={onHelp}
              />
            </div>
        ) : (
            <div className="mt-2 ui-quiz-status-soft">
              {ui.t("practice.noExercise", {}, "No exercise.")}
            </div>
        )}
      </div>
  );
}