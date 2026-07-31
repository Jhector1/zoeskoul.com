"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";

import type { PracticeRunMetaApi } from "@/lib/practice/apiTypes";
import type { Difficulty } from "@/lib/practice/types";
import type { TopicValue } from "@/lib/practice/uiTypes";

import { difficultyOptions } from "@/components/vectorpad/types";
import { useTopicOptions } from "./topicOptions";
import { readReturnUrlFromSearchParams } from "./storage";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import type { PracticeRuntimeSurface } from "@/lib/practice/experience/routePolicy";
import { resolveClientPracticeExperienceMode } from "./experienceModePolicy";

export type RunMeta = PracticeRunMetaApi;
export type { TopicValue };

type UsePracticeRunMetaArgs = {
  subjectSlug?: string;
  moduleSlug?: string;
  surface: PracticeRuntimeSurface;
  initialExperienceMode?: PracticeExperienceMode;
};

type TopicOption = {
  id: TopicValue;
  label: string;
  titleKey?: string | null;
};
type DifficultyOption = (typeof difficultyOptions)[number];

export function usePracticeRunMeta({
  subjectSlug,
  moduleSlug,
  surface,
  initialExperienceMode,
}: UsePracticeRunMetaArgs) {
  const sp = useSearchParams();
  const returnUrlFromQuery = useMemo(
    () => readReturnUrlFromSearchParams(new URLSearchParams(sp.toString())),
    [sp],
  );
  const [run, setRun] = useState<RunMeta | null>(null);
  const hasModuleContext = Boolean(subjectSlug && moduleSlug);

  // Route intent is available before the session status request finishes. Keep
  // assignment links on the embedded assignment surface from the first render
  // instead of briefly (or, with stale state, permanently) mounting subscriber
  // practice controls. The server run remains authoritative for every other
  // experience.
  const requestedAssignment = sp.get("type") === "assignment";
  const experienceMode = resolveClientPracticeExperienceMode({
    surface,
    requestedAssignment,
    runMode: run?.mode ?? null,
    initialExperienceMode,
  });

  const isAssignmentRun = experienceMode === "assignment";
  const isPublicChallengeRun = experienceMode === "public_challenge";
  const isOnboardingTrialRun = experienceMode === "onboarding_trial";
  const isDailyFiveRun = experienceMode === "daily_five";
  const isSessionRun = Boolean(
    isAssignmentRun || (run && run.mode !== "practice"),
  );

  const topicLocked = Boolean(
    isAssignmentRun || (run && !run.filters.topicEditable),
  );
  const difficultyLocked = Boolean(
    isAssignmentRun || (run && !run.filters.difficultyEditable),
  );
  const isLockedRun = Boolean(
    isAssignmentRun ||
      (run &&
        (run.maxAttempts != null ||
          topicLocked ||
          difficultyLocked)),
  );

  const topicOptionsFixed = useTopicOptions(subjectSlug ?? "", moduleSlug ?? "");

  const effectiveTopicOptions = useMemo<TopicOption[]>(() => {
    if (!hasModuleContext) return [];
    if (run && !run.filters.topicEditable && run.lockTopic != null) {
      if (run.lockTopic === "all") {
        return [{ id: "all", label: "All topics (locked)", titleKey: null }];
      }
      const only = topicOptionsFixed.find(
        (option) => String(option.id) === String(run.lockTopic),
      );
      return only
        ? [
            {
              id: only.id as TopicValue,
              label: only.label,
              titleKey: only.titleKey ?? null,
            },
          ]
        : [
            {
              id: run.lockTopic as TopicValue,
              label: String(run.lockTopic),
              titleKey: null,
            },
          ];
    }
    return topicOptionsFixed.map((option) => ({
      id: option.id as TopicValue,
      label: option.label,
      titleKey: option.titleKey ?? null,
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
    experienceMode,
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
