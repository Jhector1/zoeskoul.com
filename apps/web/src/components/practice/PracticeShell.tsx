// src/components/practice/PracticeShell.tsx
"use client";

import React, { useMemo } from "react";
import type { Exercise, Difficulty } from "@/lib/practice/types";
import type { VectorPadState } from "@/components/vectorpad/types";

import type { MissedItem, QItem, TopicValue } from "./practiceType";
import { buildSubmitAnswerFromItem } from "@/lib/practice/uiHelpers";

import SummaryView from "./shell/SummaryView";
import PracticeView from "./shell/PracticeView";
import { useConceptExplain } from "./hooks/useConceptExplain";
import { isExcusedPracticeItem } from "@/lib/flow/excuse";

export type TFn = (key: string, values?: Record<string, any>) => string;

export type PracticeShellProps = {
  t: TFn;

  isAssignmentRun: boolean;
  isSessionRun: boolean;
  isLockedRun: boolean;

  returnUrl?: string | null;
  onReturn?: () => void;
  isOnboardingTrial?: boolean; // ✅ NEW

  allowReveal: boolean;
  showDebug: boolean;
  maxAttempts: number;
  reviewStack?: QItem[];

  topicLocked: boolean;
  difficultyLocked: boolean;

  sessionSize: number;
  setSessionSize: (n: number) => void;

  topic: TopicValue;
  setTopic: (v: TopicValue) => void;

  difficulty: Difficulty | "all";
  setDifficulty: (v: Difficulty | "all") => void;

  section: string | null;
  setSection: (s: string | null) => void;

  topicOptionsFixed: { id: TopicValue; label: string }[];
  difficultyOptions: { id: Difficulty | "all"; label: string }[];

  badge: string;

  busy: boolean;
  loadErr: string | null;
  actionErr: string | null;

  phase: "practice" | "summary";
  setPhase: (p: "practice" | "summary") => void;

  showMissed: boolean;
  setShowMissed: (v: boolean) => void;

  pct: number;
  answeredCount: number;
  correctCount: number;

  stack: QItem[];
  idx: number;
  setIdx: (n: number) => void;

  current: QItem | null;
  exercise: Exercise | null;

  missed: MissedItem[];

  confirmOpen: boolean;
  applyPendingChange: () => void;
  cancelPendingChange: () => void;

  canGoPrev: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => Promise<void> | void;
  submit: () => Promise<void> | void;
  reveal: () => Promise<void> | void;
  retryLoad: () => void;

  padRef: React.MutableRefObject<VectorPadState>;
  zHeldRef: React.MutableRefObject<boolean>;

  updateCurrent: (patch: Partial<QItem>) => void;

  /** ✅ NEW: excuse current and continue */
  excuseAndNext?: (reason?: string | null) => Promise<void> | void;

  /** ✅ NEW: skip a load error (try another exercise) */
  skipLoadError?: () => Promise<void> | void;
};

function getResultBoxClass(current: QItem | null) {
  if (isExcusedPracticeItem(current)) {
    return "border-amber-600/25 bg-amber-50/70 dark:border-amber-300/30 dark:bg-amber-300/10";
  }
  if (current?.revealed) {
    return "border-sky-300/50 bg-sky-50/70 dark:border-sky-300/25 dark:bg-sky-300/10";
  }
  if (current?.result?.ok === true) {
    return "border-emerald-600/25 bg-emerald-50 dark:border-emerald-300/30 dark:bg-emerald-300/10";
  }
  if (current?.result) {
    return "border-rose-400/40 bg-rose-50 dark:border-rose-300/30 dark:bg-rose-300/10";
  }
  return "border-neutral-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.06]";
}

export default function PracticeShell(props: PracticeShellProps) {
  const { phase, isLockedRun, maxAttempts, current, exercise } = props;

  const canSubmitNow = useMemo(
      () => !!(current && buildSubmitAnswerFromItem(current)),
      [current],
  );

  const finalized = Boolean((current as any)?.result?.finalized);
  const attempts = current?.attempts ?? 0;

  const outOfAttempts =
      isLockedRun && attempts >= maxAttempts && current?.result?.ok !== true;

  const resultBoxClass = useMemo(() => getResultBoxClass(current), [current]);
  const concept = useConceptExplain({ current, exercise });

  if (phase === "summary") return <SummaryView {...props} />;

  return (
      <PracticeView
          {...props}
          canSubmitNow={canSubmitNow}
          finalized={finalized}
          attempts={attempts}
          outOfAttempts={outOfAttempts}
          resultBoxClass={resultBoxClass}
          concept={concept}
      />
  );
}