"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";

import type { PracticeRunMetaApi } from "@/lib/practice/apiTypes";
import type { Difficulty } from "@/lib/practice/types";
import type { TopicValue } from "@/lib/practice/uiTypes";

import { difficultyOptions } from "@/components/vectorpad/types";
import { useTopicOptions } from "./topicOptions";
import { readReturnUrlFromSearchParams } from "./storage";

export type RunMeta = PracticeRunMetaApi;
export type { TopicValue };

type UsePracticeRunMetaArgs = {
  subjectSlug?: string;
  moduleSlug?: string;
};

type TopicOption = { id: TopicValue; label: string };
type DifficultyOption = (typeof difficultyOptions)[number];

export function usePracticeRunMeta({
  subjectSlug,
  moduleSlug,
}: UsePracticeRunMetaArgs) {
  const sp = useSearchParams();
  const returnUrlFromQuery = useMemo(
    () => readReturnUrlFromSearchParams(new URLSearchParams(sp.toString())),
    [sp],
  );
  const [run, setRun] = useState<RunMeta | null>(null);
  const hasModuleContext = Boolean(subjectSlug && moduleSlug);

  const isAssignmentRun = run?.mode === "assignment";
  const isPublicChallengeRun = run?.mode === "public_challenge";
  const isOnboardingTrialRun = run?.mode === "onboarding_trial";
  const isDailyFiveRun = run?.mode === "daily_five";
  const isSessionRun = Boolean(run && run.mode !== "practice");

  const topicLocked = Boolean(run && !run.filters.topicEditable);
  const difficultyLocked = Boolean(run && !run.filters.difficultyEditable);
  const isLockedRun = Boolean(
    run &&
      (run.maxAttempts != null ||
        topicLocked ||
        difficultyLocked ||
        !run.filters.purposeEditable),
  );

  const topicOptionsFixed = useTopicOptions(subjectSlug ?? "", moduleSlug ?? "");

  const effectiveTopicOptions = useMemo<TopicOption[]>(() => {
    if (!hasModuleContext) return [];
    if (run && !run.filters.topicEditable && run.lockTopic != null) {
      if (run.lockTopic === "all") {
        return [{ id: "all", label: "All topics (locked)" }];
      }
      const only = topicOptionsFixed.find(
        (option) => String(option.id) === String(run.lockTopic),
      );
      return only
        ? [{ id: only.id as TopicValue, label: only.label }]
        : [{ id: run.lockTopic as TopicValue, label: String(run.lockTopic) }];
    }
    return topicOptionsFixed.map((option) => ({
      id: option.id as TopicValue,
      label: option.label,
    }));
  }, [hasModuleContext, run, topicOptionsFixed]);

  const effectiveDifficultyOptions = useMemo<DifficultyOption[]>(() => {
    if (!hasModuleContext) return [];
    if (run && !run.filters.difficultyEditable && run.lockDifficulty) {
      return [
        {
          id: run.lockDifficulty,
          label: `${run.lockDifficulty} (locked)`,
        },
      ] as DifficultyOption[];
    }
    return difficultyOptions;
  }, [hasModuleContext, run]);

  const hasSessionInUrl = Boolean(sp.get("sessionId"));
  const allowReveal = run ? run.allowReveal : !hasSessionInUrl;
  const maxAttempts = run?.maxAttempts ?? Number.POSITIVE_INFINITY;
  const showDebug = run?.showDebug ?? false;

  return {
    sp,
    run,
    setRun: setRun as Dispatch<SetStateAction<RunMeta | null>>,
    returnUrlFromQuery,
    isAssignmentRun,
    isPublicChallengeRun,
    isOnboardingTrialRun,
    isDailyFiveRun,
    isSessionRun,
    isLockedRun,
    topicLocked,
    difficultyLocked,
    allowReveal,
    maxAttempts,
    showDebug,
    effectiveRunModeOptions: [] as Array<{ id: string; label: string }>,
    effectiveSessionSizeOptions: [] as Array<{ id: number; label: string }>,
    effectiveTopicOptions,
    effectiveDifficultyOptions,
  };
}
