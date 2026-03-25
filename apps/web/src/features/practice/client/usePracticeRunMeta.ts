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

type TopicOption = {
  id: TopicValue;
  label: string;
};

type DifficultyOption = (typeof difficultyOptions)[number];

type UsePracticeRunMetaResult = {
  sp: ReturnType<typeof useSearchParams>;
  run: RunMeta | null;
  setRun: Dispatch<SetStateAction<RunMeta | null>>;

  returnUrlFromQuery: string | null;

  isAssignmentRun: boolean;
  isSessionRun: boolean;
  isLockedRun: boolean;
  topicLocked: boolean;
  difficultyLocked: boolean;

  allowReveal: boolean;
  maxAttempts: number;
  showDebug: boolean;

  effectiveRunModeOptions: Array<{ id: string; label: string }>;
  effectiveSessionSizeOptions: Array<{ id: number; label: string }>;
  effectiveTopicOptions: TopicOption[];
  effectiveDifficultyOptions: DifficultyOption[];
};

export function usePracticeRunMeta({
                                     subjectSlug,
                                     moduleSlug,
                                   }: UsePracticeRunMetaArgs): UsePracticeRunMetaResult {
  const sp = useSearchParams();

  const returnUrlFromQuery = useMemo(
      () => readReturnUrlFromSearchParams(new URLSearchParams(sp.toString())),
      [sp],
  );

  const [run, setRun] = useState<RunMeta | null>(null);

  const hasModuleContext = Boolean(subjectSlug && moduleSlug);

  const isAssignmentRun = run?.mode === "assignment";
  const isSessionRun = run?.mode === "session";
  const isLockedRun = isAssignmentRun || isSessionRun;

  const topicLocked = isLockedRun || run?.lockTopic != null;
  const difficultyLocked = isLockedRun || run?.lockDifficulty != null;

  const topicOptionsFixed = useTopicOptions(subjectSlug ?? "", moduleSlug ?? "");

  const effectiveTopicOptions = useMemo<TopicOption[]>(() => {
    if (!hasModuleContext) return [];

    if (run?.mode === "assignment" || run?.mode === "session") {
      if (run.lockTopic === "all") {
        return [{ id: "all", label: "All topics (locked)" }];
      }

      const only = topicOptionsFixed.find(
          (x) => String(x.id) === String(run.lockTopic),
      );

      return only
          ? [{ id: only.id as TopicValue, label: only.label }]
          : [{ id: run.lockTopic as TopicValue, label: String(run.lockTopic) }];
    }

    return topicOptionsFixed.map((x) => ({
      id: x.id as TopicValue,
      label: x.label,
    }));
  }, [hasModuleContext, run, topicOptionsFixed]);

  const effectiveDifficultyOptions = useMemo<DifficultyOption[]>(() => {
    if (!hasModuleContext) return [];

    if (run?.mode === "assignment" || run?.mode === "session") {
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
  const allowReveal = run ? run.allowReveal : hasSessionInUrl ? false : true;
  const maxAttempts = run ? run.maxAttempts : 5;
  const showDebug = run ? run.showDebug : false;

  return {
    sp,
    run,
    setRun,

    returnUrlFromQuery,

    isAssignmentRun,
    isSessionRun,
    isLockedRun,
    topicLocked,
    difficultyLocked,

    allowReveal,
    maxAttempts,
    showDebug,

    effectiveRunModeOptions: [],
    effectiveSessionSizeOptions: [],
    effectiveTopicOptions,
    effectiveDifficultyOptions,
  };
}