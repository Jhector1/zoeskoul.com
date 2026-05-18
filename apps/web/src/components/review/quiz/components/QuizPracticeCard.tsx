"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewQuestion } from "@/lib/subjects/types";
import type { PracticeState } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import { isEmptyPracticeAnswer } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import type { VectorPadState } from "@/components/vectorpad/types";

import ExerciseRenderer from "@/components/practice/ExerciseRenderer";
import { exerciseDebug, summarizeExercisePatch } from "@/components/review/module/runtime/exerciseDebug";
import PracticeHelpPanel from "@/components/practice/PracticeHelpPanel";
import { useOptionalReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import { getExerciseStateKey } from "@/components/review/module/runtime/exerciseKeys";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import {
  normalizeWorkspaceLanguage,
  stateLanguageMatches,
} from "@/components/review/module/runtime/workspaceCodeSource";
import { normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";

import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import type { Exercise } from "@/lib/practice/types";
import {
  DEFAULT_PRACTICE_HELP_POLICY,
  getNextPracticeHelpStepKey,
  PRACTICE_HELP_STEP_DEF_MAP,
} from "@/lib/practice/help/steps";

const LOADING_TIMEOUT_MS = 8000;

function getStableExerciseSlotId(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const anyQ = q as any;

  return (
      anyQ.fetch?.exerciseKey ??
      anyQ.exerciseKey ??
      anyQ.item?.exerciseKey ??
      anyQ.exercise?.exerciseKey ??
      anyQ.exercise?.id ??
      anyQ.fetch?.stepId ??
      anyQ.item?.id ??
      anyQ.stepId ??
      anyQ.sourceStepId ??
      anyQ.key ??
      q.id
  );
}

function getWorkspaceEntryCodeForPracticeCard(workspace: any) {
  if (
      !workspace ||
      typeof workspace !== "object" ||
      workspace.version !== 2 ||
      !Array.isArray(workspace.nodes)
  ) {
    return "";
  }

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const file =
      workspace.nodes.find((node: any) => node?.kind === "file" && node.id === entryId) ??
      workspace.nodes.find((node: any) => node?.kind === "file");

  return file?.kind === "file" ? String(file.content ?? "") : "";
}

function getWorkspaceFromAnyState(value: any): WorkspaceStateV2 | null {
  if (value?.workspace?.version === 2) return value.workspace as WorkspaceStateV2;
  if (value?.codeWorkspace?.version === 2) return value.codeWorkspace as WorkspaceStateV2;
  if (value?.ideWorkspace?.version === 2) return value.ideWorkspace as WorkspaceStateV2;
  return null;
}

function getManifestExerciseLanguage(exercise: Exercise | null | undefined) {
  const exAny = exercise as any;
  const isSqlExercise =
      exercise?.kind === "code_input" &&
      (
          exAny?.language === "sql" ||
          Boolean(exAny?.fixedSqlDialect) ||
          Boolean(exAny?.runtime?.datasetId) ||
          typeof exAny?.sqlSchemaSql === "string" ||
          typeof exAny?.sqlSeedSql === "string" ||
          Boolean(exAny?.sqlDatasetId)
      );

  if (isSqlExercise) return "sql";

  return normalizeWorkspaceLanguage(exAny?.language ?? "python");
}

export default function QuizPracticeCard(props: {
  q: Extract<ReviewQuestion, { kind: "practice" }>;
  ownerCardId?: string;
  ps?: PracticeState;
  toolScopedId?: string;
  toolsActive?: boolean;

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
    ownerCardId,
    ps,
    toolScopedId,
    toolsActive = true,
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
  } = props;

  const tools = useOptionalReviewTools();
  const toolsAny = tools as any;
  const excused = Boolean(props.excused);

  const ui = useTaggedT("reviewQuizUi");
  const { raw } = useTaggedT();

  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const autoRetriedRef = useRef<string | null>(null);
  const lastToolsBindKeyRef = useRef<string | null>(null);
  const lastEnsureRuntimeExerciseKeyRef = useRef<string | null>(null);

  const ex: Exercise | null = useMemo(() => {
    if (!ps?.exercise) return null;
    return resolveDeepTagged(ps.exercise, (key) => raw(key, "")) as Exercise;
  }, [ps?.exercise, raw]);

  const toolsEnabled = Boolean(toolsAny?.enabled);
  const isCodeInput = ex?.kind === "code_input";
  const codeRunnerMode: "embedded" | "tools" =
      toolsEnabled && isCodeInput ? "tools" : "embedded";

  const codeTools = toolsEnabled && isCodeInput ? toolsAny : null;

  const stableExerciseSlotId = useMemo(() => getStableExerciseSlotId(q), [q]);

  const effectiveToolId = toolScopedId ?? stableExerciseSlotId;
  const codeInputId = toolsEnabled && isCodeInput ? effectiveToolId : undefined;

  const exerciseKeyForTools = useMemo(() => {
    return getExerciseStateKey(
        {
          subjectSlug: (q as any).fetch?.subject ?? "",
          moduleSlug: (q as any).fetch?.module ?? "",
          sectionSlug: (q as any).fetch?.section,
          topicId: normalizeTopicProgressKey((q as any).fetch?.topic ?? ""),
          cardId: ownerCardId ?? "",
        },
        stableExerciseSlotId,
    );
  }, [q, ownerCardId, stableExerciseSlotId]);

  const runtimeExercise = useReviewRuntimeStore(
      (s) => s.exercises[exerciseKeyForTools] ?? null,
  );
  const ensureRuntimeExercise = useReviewRuntimeStore((s) => s.ensureExercise);
  const fetchSubjectSlug = (q as any).fetch?.subject ?? "";
  const fetchModuleSlug = (q as any).fetch?.module ?? "";
  const fetchSectionSlug = (q as any).fetch?.section;
  const fetchTopicId = normalizeTopicProgressKey((q as any).fetch?.topic ?? "");
  const fetchOwnerCardId = ownerCardId ?? "";
  const practiceExerciseKind = ex?.kind ?? "";
  const practiceExerciseId = String((ex as any)?.id ?? "");
  const practiceExerciseKey = String((ex as any)?.exerciseKey ?? "");
  const practiceExerciseLanguage = String((ex as any)?.language ?? "");
  const practiceExerciseRuntimeDatasetId = String(
      (ex as any)?.runtime?.datasetId ?? "",
  );
  const practiceExerciseSqlDatasetId = String((ex as any)?.sqlDatasetId ?? "");
  const practiceExerciseHasSqlSchema =
      typeof (ex as any)?.sqlSchemaSql === "string";
  const practiceExerciseHasSqlSeed = typeof (ex as any)?.sqlSeedSql === "string";
  const practiceItemReady = Boolean(ps?.item);

  const runtimeExerciseCode = useMemo(() => {
    return (
        getWorkspaceEntryCodeForPracticeCard(runtimeExercise?.workspace) ||
        (typeof runtimeExercise?.code === "string" ? runtimeExercise.code : "")
    );
  }, [runtimeExercise]);

  useEffect(() => {
    if (!ex) return;
    if (ex.kind !== "code_input") return;
    if (!ps?.item) return;

    const manifestLanguage = getManifestExerciseLanguage(ex);
    const ensureKey = [
      exerciseKeyForTools,
      fetchSubjectSlug,
      fetchModuleSlug,
      fetchSectionSlug || "",
      fetchTopicId,
      fetchOwnerCardId,
      practiceExerciseKind,
      practiceExerciseId,
      practiceExerciseKey,
      practiceExerciseLanguage,
      practiceExerciseRuntimeDatasetId,
      practiceExerciseSqlDatasetId,
      practiceExerciseHasSqlSchema ? "sql-schema" : "",
      practiceExerciseHasSqlSeed ? "sql-seed" : "",
    ].join("|");

    if (lastEnsureRuntimeExerciseKeyRef.current === ensureKey) return;

    const existing = useReviewRuntimeStore.getState().exercises[exerciseKeyForTools];

    if (
        existing &&
        stateLanguageMatches(
            existing,
            manifestLanguage,
            getWorkspaceFromAnyState(existing),
        )
    ) {
      lastEnsureRuntimeExerciseKeyRef.current = ensureKey;
      return;
    }

    lastEnsureRuntimeExerciseKeyRef.current = ensureKey;

    ensureRuntimeExercise({
      exerciseKey: exerciseKeyForTools,
      subjectSlug: fetchSubjectSlug,
      moduleSlug: fetchModuleSlug,
      sectionSlug: fetchSectionSlug,
      topicId: fetchTopicId,
      cardId: fetchOwnerCardId,
      manifest: ex,
      saved: ps.item,
    });

    // Intentionally do not depend on full `ex`, `ps.item`, or `q`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ensureRuntimeExercise,
    exerciseKeyForTools,
    fetchSubjectSlug,
    fetchModuleSlug,
    fetchSectionSlug,
    fetchTopicId,
    fetchOwnerCardId,
    practiceExerciseKind,
    practiceExerciseId,
    practiceExerciseKey,
    practiceExerciseLanguage,
    practiceExerciseRuntimeDatasetId,
    practiceExerciseSqlDatasetId,
    practiceExerciseHasSqlSchema,
    practiceExerciseHasSqlSeed,
    practiceItemReady,
  ]);

  const attemptsCapped = useMemo(() => {
    if (!ps) return false;
    if (unlimitedAttempts) return false;

    const max = ps.maxAttempts;
    if (max == null) return false;

    return ps.attempts >= max;
  }, [ps, unlimitedAttempts]);

  const hasInput = useMemo(() => {
    if (!ex || !ps?.item) return false;

    if (ex.kind === "code_input" && runtimeExerciseCode.trim().length > 0) {
      return true;
    }

    return !isEmptyPracticeAnswer(ex, ps.item, padRef?.current);
  }, [ex, ps?.item, padRef, runtimeExerciseCode]);

  const isCodeExerciseWithInput = ex?.kind === "code_input" && hasInput;

  const feedbackDismissed = Boolean((ps?.item as any)?.feedbackDismissed);

  const resultOk =
      typeof (ps?.item as any)?.result?.ok === "boolean"
          ? Boolean((ps?.item as any).result.ok)
          : null;

  const isCorrect =
      (Boolean((ps?.item as any)?.result?.finalized) && resultOk === true) ||
      ps?.ok === true ||
      resultOk === true;

  const isFinalized =
      Boolean((ps?.item as any)?.result?.finalized) ||
      isCorrect ||
      attemptsCapped ||
      isCompleted ||
      locked;

  const updateItemSafe = useCallback(
      (patch: any) => {
        const isDismissFeedbackEdit =
            Boolean(patch?.dismissFeedbackOnEdit) &&
            Boolean(patch?.feedbackDismissed);

        // Always allow real typing/edit patches to dismiss stale feedback.
        // Even if the item is finalized/completed, the old red feedback should not remain visible.
        if (isDismissFeedbackEdit) {
          onUpdateItem({
            ...patch,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: true,
            submitted: false,
            userEdited: true,
            updateOrigin: "user",
            workspaceOrigin: "user",
          });
          return;
        }

        if (!unlocked || isCompleted || locked || excused || isFinalized) return;

        onUpdateItem(patch);
      },
      [unlocked, isCompleted, locked, excused, isFinalized, onUpdateItem],
  );

  useEffect(() => {
    if (!toolsEnabled) return;
    if (!toolsAny) return;
    if (!ex) return;
    if (ex.kind !== "code_input") return;
    if (!ps) return;

    const doneForFlow =
        isCorrect || isFinalized || excused || (!strictSequential && attemptsCapped);

    const eligible =
        toolsActive && unlocked && !locked && !isCompleted && !excused && !isFinalized;

    toolsAny.setCodeInputMeta?.(effectiveToolId, {
      order: seqOrder,
      eligible,
      done: doneForFlow,
    });
  }, [
    toolsEnabled,
    toolsAny,
    ex,
    ps,
    effectiveToolId,
    toolsActive,
    unlocked,
    locked,
    isCompleted,
    excused,
    strictSequential,
    attemptsCapped,
    isCorrect,
    isFinalized,
    seqOrder,
  ]);

  useEffect(() => {
    if (!toolsActive) {
      lastToolsBindKeyRef.current = null;
      return;
    }
    if (!toolsEnabled) return;
    if (!toolsAny) return;
    if (!isCodeInput) return;
    if (!codeInputId) return;
    if (!ex) return;
    if (!ps?.item) return;
    if (isFinalized) return;

    const bindKey = `${codeInputId}:${exerciseKeyForTools}`;
    if (lastToolsBindKeyRef.current === bindKey) return;
    lastToolsBindKeyRef.current = bindKey;

    const timer = window.setTimeout(() => {
      toolsAny.requestBind?.(codeInputId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    toolsActive,
    toolsEnabled,
    toolsAny,
    isCodeInput,
    codeInputId,
    ex,
    Boolean(ps?.item),
    exerciseKeyForTools,
    isFinalized,
  ]);

  const disableCheck =
      (!isCodeExerciseWithInput && !unlocked) ||
      isCompleted ||
      (locked && !isCodeExerciseWithInput) ||
      excused ||
      (ps?.busy ?? false) ||
      isFinalized ||
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
      (!isCodeExerciseWithInput && !unlocked) ||
      isCompleted ||
      (locked && !isCodeExerciseWithInput) ||
      excused ||
      (ps?.busy ?? false) ||
      isFinalized ||
      !nextHelpStepKey;

  const disableSkip =
      !unlocked || isCompleted || locked || excused || isFinalized;

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

  const hasExercise = Boolean(ex && ps?.item);
  const isInitialLoading = Boolean(ps?.loading && !hasExercise && !ps?.error);
  const isRefreshing = Boolean(ps?.loading && hasExercise);
  const hasBlockingError = Boolean(ps?.error && !hasExercise);
  const hasInlineError = Boolean(ps?.error && hasExercise);

  useEffect(() => {
    setLoadTimedOut(false);
    autoRetriedRef.current = null;
  }, [q.id]);

  useEffect(() => {
    if (!isInitialLoading) {
      setLoadTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [isInitialLoading, q.id]);

  useEffect(() => {
    if (!isInitialLoading) return;
    if (!loadTimedOut) return;
    if (!props.onRetryExercise) return;

    const retryKey = `${q.id}:${ps?.attempts ?? 0}`;
    if (autoRetriedRef.current === retryKey) return;

    autoRetriedRef.current = retryKey;
    props.onRetryExercise();
  }, [isInitialLoading, loadTimedOut, props.onRetryExercise, q.id, ps?.attempts]);

  const showStuckLoading = isInitialLoading && loadTimedOut;

  return (
      <div className={["p-2", !unlocked ? "opacity-70" : ""].join(" ")}>
        {!unlocked ? (
            <div className="ui-quiz-hint">
              {ui.t(
                  "unlockHint",
                  {},
                  "Answer the previous question correctly to unlock this one.",
              )}
            </div>
        ) : null}

        {showStuckLoading ? (
            <div className="ui-quiz-note-danger">
              <div>
                {ui.t(
                    "practice.loadingStuck",
                    {},
                    "This exercise is taking longer than expected to load.",
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {props.onRetryExercise ? (
                    <button
                        type="button"
                        onClick={props.onRetryExercise}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                      {ui.t("buttons.retry", {}, "Retry")}
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
        ) : isInitialLoading ? (
            <div className="mt-2 ui-quiz-status-soft flex items-center gap-2">
              <span>{ui.t("practice.loadingExercise", {}, "Loading exercise…")}</span>
            </div>
        ) : hasBlockingError ? (
            <div className="ui-quiz-note-danger">
              <div>{ps?.error}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                {props.onRetryExercise ? (
                    <button
                        type="button"
                        onClick={props.onRetryExercise}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                      {ui.t("buttons.retry", {}, "Retry")}
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
              {isRefreshing ? (
                  <div className="mb-2 ui-quiz-status-soft flex items-center gap-2">
                    <span>{ui.t("practice.refreshing", {}, "Refreshing…")}</span>
                  </div>
              ) : null}

              {hasInlineError ? (
                  <div className="mb-2 ui-quiz-note-danger">
                    <div>{ps?.error}</div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {props.onRetryExercise ? (
                          <button
                              type="button"
                              onClick={props.onRetryExercise}
                              className="ui-quiz-action ui-quiz-action--ghost"
                          >
                            {ui.t("buttons.retry", {}, "Retry")}
                          </button>
                      ) : null}
                    </div>
                  </div>
              ) : null}

              <div className="mt-2">
                {exerciseDebug("A_QuizPracticeCard_before_ExerciseRenderer", {
                  qId: q.id,
                  ownerCardId,
                  stableExerciseSlotId,
                  codeInputId,
                  codeRunnerMode,
                  toolsActive,
                  fetchExerciseKey: (q as any).fetch?.exerciseKey,
                  fetchStepId: (q as any).fetch?.stepId,
                  qExerciseKey: (q as any).exerciseKey,
                  qStepId: (q as any).stepId,
                  psExerciseKind: ps.exercise?.kind,
                  psItem: summarizeExercisePatch(ps.item),
                  exKind: ex.kind,
                  exId: (ex as any).id,
                  exExerciseKey: (ex as any).exerciseKey,
                  fetchTopic: (q as any).fetch?.topic,
                }) as any}

                <ExerciseRenderer
                    key={stableExerciseSlotId}
                    exercise={ex}
                    current={
                      isCorrect || isCompleted
                          ? {
                            ...ps.item,
                            feedbackDismissed: true,
                          }
                          : ps.item
                    }
                    exerciseStateId={stableExerciseSlotId}
                    busy={ps.busy || !unlocked || isCompleted || locked || isFinalized}
                    isAssignmentRun={false}
                    maxAttempts={maxForRenderer as any}
                    padRef={padRef as any}
                    updateCurrent={updateItemSafe}
                    readOnly={!unlocked || isCompleted || locked || isFinalized}
                    codeRunnerMode={codeRunnerMode}
                    codeTools={codeTools}
                    codeInputId={codeInputId}
                    codeOwnerCardId={ownerCardId ?? null}
                    codeToolsAutoOpen={toolsActive}
                    subjectSlug={(q as any).fetch?.subject}
                    moduleSlug={(q as any).fetch?.module}
                    sectionSlug={(q as any).fetch?.section}
                    topicId={normalizeTopicProgressKey((q as any).fetch?.topic)}
                    cardId={ownerCardId}
                    // showPrompt={true}

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
                        "ui-btn-primary",
                        disableCheck ? "ui-quiz-action--disabled" : "ui-btn-primary",
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
                    {
                      n: ps.attempts,
                      max: ps.maxAttempts == null ? "∞" : ps.maxAttempts,
                    },
                    `Attempts: ${ps.attempts}/${ps.maxAttempts == null ? "∞" : ps.maxAttempts}`,
                )}
              </span>

                  {isCorrect ? (
                      <span className="ml-2 whitespace-nowrap ui-quiz-status-good">
      ✓ Correct
    </span>
                  ) : !feedbackDismissed && resultOk === false && ps.item?.result ? (
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
                  codeInputId={codeInputId}
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
