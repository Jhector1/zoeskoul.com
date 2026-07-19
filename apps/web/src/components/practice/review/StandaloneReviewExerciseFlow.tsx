"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";

import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import {
  useQuizAutoAdvanceController,
  useQuizAutoAdvancePreference,
} from "@/components/review/quiz/hooks/useQuizAutoAdvance";
import { resolveStablePracticeExerciseId } from "@/lib/practice/exerciseIdentity";
import StandaloneReviewExerciseCard from "./StandaloneReviewExerciseCard";
import {
  isStandaloneAnswerResolved,
  resolveStandaloneAutoAdvanceEnabled,
  supportsStandaloneAutoAdvance,
} from "./standaloneAutoAdvance";

export default function StandaloneReviewExerciseFlow({
  props,
  surface,
}: {
  props: PracticeShellProps;
  surface: "embedded" | "tools";
}) {
  const submittedExerciseRef = useRef<string | null>(null);
  const [autoAdvance] = useQuizAutoAdvancePreference(true);

  const exerciseIdentity = useMemo(() => {
    if (!props.current || !props.exercise) return null;

    return resolveStablePracticeExerciseId({
      item: props.current,
      exercise: props.exercise,
      fallbackIndex: props.idx,
    });
  }, [props.current, props.exercise, props.idx]);

  useEffect(() => {
    if (
      submittedExerciseRef.current &&
      submittedExerciseRef.current !== exerciseIdentity
    ) {
      submittedExerciseRef.current = null;
    }
  }, [exerciseIdentity]);

  const supportsAutoAdvance = supportsStandaloneAutoAdvance(
    props.experienceMode,
  );
  const autoAdvanceEnabled = resolveStandaloneAutoAdvanceEnabled({
    mode: props.experienceMode,
    preferenceEnabled: autoAdvance,
  });
  const actionKey = supportsAutoAdvance
    ? submittedExerciseRef.current
    : null;
  const resolved = Boolean(
    actionKey &&
      exerciseIdentity &&
      actionKey === exerciseIdentity &&
      props.phase === "practice" &&
      isStandaloneAnswerResolved({
        current: props.current,
        maxAttempts: props.maxAttempts,
      }),
  );

  useQuizAutoAdvanceController({
    actionKey,
    resolved,
    enabled: autoAdvanceEnabled,
    onAdvance: async (resolvedExerciseId) => {
      // The timer can outlive a fast manual navigation/reset. Re-check the
      // current exercise before advancing so stale success cannot skip ahead.
      if (submittedExerciseRef.current !== resolvedExerciseId) return;
      if (props.phase !== "practice" || !props.canGoNext) return;
      await props.goNext();
    },
    onConsumed: (resolvedExerciseId) => {
      if (submittedExerciseRef.current === resolvedExerciseId) {
        submittedExerciseRef.current = null;
      }
    },
  });

  const markSubmitAction = useCallback(() => {
    if (!supportsAutoAdvance || !exerciseIdentity) return;
    submittedExerciseRef.current = exerciseIdentity;
  }, [exerciseIdentity, supportsAutoAdvance]);

  return (
    <StandaloneReviewExerciseCard
      props={props}
      surface={surface}
      onSubmitStart={markSubmitAction}
    />
  );
}
