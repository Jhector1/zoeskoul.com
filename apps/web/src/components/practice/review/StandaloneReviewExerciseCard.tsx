"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ReviewQuestion } from "@/lib/subjects/types";
import type { PracticeState } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import QuizPracticeCard from "@/components/review/quiz/components/QuizPracticeCard";
import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import type { ReviewFinalizedPracticeAction } from "@/components/review/quiz/reviewQuizCompletion";
import { DEFAULT_PRACTICE_HELP_POLICY } from "@/lib/practice/help/steps";
import { resolveStablePracticeExerciseId } from "@/lib/practice/exerciseIdentity";
import { isExcusedPracticeItem } from "@/lib/flow/excuse";

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export default function StandaloneReviewExerciseCard({
  props,
  surface,
  onSubmitStart,
  finalizedAction,
  onFinalizedNext,
}: {
  props: PracticeShellProps;
  surface: "embedded" | "tools";
  onSubmitStart?: () => void;
  finalizedAction?: ReviewFinalizedPracticeAction | null;
  onFinalizedNext?: () => void | Promise<void>;
}) {
  const t = useTranslations("Practice.workspace");
  const question = useMemo<Extract<ReviewQuestion, { kind: "practice" }> | null>(() => {
    if (!props.exercise || !props.current) return null;

    const standalonePurpose =
      props.experienceMode === "assignment" || props.experienceMode === "onboarding_trial"
        ? "quiz"
        : "project";

    const exerciseKey = resolveStablePracticeExerciseId({
      item: props.current,
      exercise: props.exercise,
      fallbackIndex: props.idx,
    });
    const topic = firstText(props.exercise.topic, props.topic, "all");

    return {
      kind: "practice",
      id: `standalone:${props.experienceMode}:${exerciseKey}`,
      exerciseKey,
      fetch: {
        subject: props.subjectSlug || "practice",
        module: props.moduleSlug || props.experienceMode,
        section: props.section || undefined,
        topic,
        difficulty: (props.exercise as any).difficulty || props.difficulty || "easy",
        allowReveal: props.allowReveal,
        preferPurpose: standalonePurpose,
        purposePolicy: "strict",
        exerciseKey,
        seedPolicy: "actor",
        salt: `${props.experienceMode}|${exerciseKey}|${props.idx}`,
      } as any,
      maxAttempts: Number.isFinite(props.maxAttempts)
        ? props.maxAttempts
        : null,
    } as Extract<ReviewQuestion, { kind: "practice" }>;
  }, [
    props.allowReveal,
    props.current,
    props.difficulty,
    props.exercise,
    props.experienceMode,
    props.idx,
    props.maxAttempts,
    props.moduleSlug,
    props.section,
    props.subjectSlug,
    props.topic,
  ]);

  const practiceState = useMemo<PracticeState | undefined>(() => {
    if (!props.exercise || !props.current) return undefined;

    return {
      loading: Boolean(props.busy && !props.exercise),
      error: props.loadErr || props.actionErr,
      busy: Boolean(props.busy || props.submitBusy),
      exercise: props.exercise,
      item: props.current,
      attempts: props.current.attempts ?? 0,
      maxAttempts: Number.isFinite(props.maxAttempts)
        ? props.maxAttempts
        : null,
      ok:
        typeof props.current.result?.ok === "boolean"
          ? props.current.result.ok
          : null,
      helpPolicy: props.helpPolicy ?? DEFAULT_PRACTICE_HELP_POLICY,
      exerciseKey: (question as any)?.exerciseKey,
      topicId: firstText(props.exercise.topic, props.topic, "all"),
      subjectSlug: props.subjectSlug || "practice",
      moduleSlug: props.moduleSlug || props.experienceMode,
      sectionSlug: props.section || "",
    };
  }, [
    props.actionErr,
    props.busy,
    props.current,
    props.exercise,
    props.experienceMode,
    props.helpPolicy,
    props.loadErr,
    props.maxAttempts,
    props.moduleSlug,
    props.section,
    props.subjectSlug,
    props.submitBusy,
    props.topic,
    (question as any)?.exerciseKey,
  ]);

  if (!question) {
    return (
      <div className="ui-page-surface p-6">
        <div className="ui-title-sm">
          {props.loadErr ? t("stage.errorTitle") : t("stage.loadingTitle")}
        </div>
        <div className="mt-2 ui-meta">
          {props.loadErr || t("stage.loadingBody")}
        </div>
        {props.loadErr ? (
          <button
            type="button"
            className="ui-btn ui-btn-secondary mt-4"
            onClick={props.retryLoad}
          >
            {t("stage.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ui-page-surface" data-testid="practice-review-exercise-card">
      <QuizPracticeCard
        q={question}
        ownerCardId={`standalone-${props.experienceMode}`}
        ps={practiceState}
        toolScopedId={(question as any).exerciseKey || question.id}
        toolsActive={surface === "tools"}
        codeSurfaceOverride={surface}
        suppressInlineHint={props.experienceMode === "assignment"}
        unlocked
        isCompleted={false}
        locked={false}
        unlimitedAttempts={!Number.isFinite(props.maxAttempts)}
        strictSequential={false}
        seqOrder={props.idx}
        padRef={props.padRef}
        excused={isExcusedPracticeItem(props.current)}
        onRetryExercise={props.retryLoad}
        onExcused={() => props.excuseAndNext?.("exercise_load_failed")}
        onUpdateItem={props.updateCurrent}
        onSubmit={() => {
          onSubmitStart?.();
          void props.submit();
        }}
        finalizedAction={finalizedAction}
        onFinalizedNext={onFinalizedNext}
        onHelp={(stepKey) => {
          void props.openHelp(stepKey);
        }}
      />
    </div>
  );
}
