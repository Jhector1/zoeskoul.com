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
import { isPracticeItemFinalized } from "@/lib/practice/runtime";
import type { PracticeExperienceMode, PracticeRunViewer } from "@/lib/practice/experience/types";
import type { PracticeHelpPolicy } from "@/lib/practice/help/steps";

export type TFn = (key: string, values?: Record<string, any>) => string;

export type PracticeShellProps = {
  t: TFn;

  isAssignmentRun: boolean;
  isSessionRun: boolean;
  isLockedRun: boolean;
  submitBusy: boolean;

  returnUrl?: string | null;
  leaderboardUrl?: string | null;
  onReturn?: () => void;
  experienceMode: PracticeExperienceMode;
  viewer: PracticeRunViewer;
  isOnboardingTrial?: boolean;
  isSharedChallenge?: boolean;
  isDailyFive?: boolean;
  challengeTitle?: string | null;
  helpPolicy?: PracticeHelpPolicy | null;

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
  openHelp: (stepKey?: string) => Promise<void> | void;
  reveal: () => Promise<void> | void;
  pendingRevealCompletion?: boolean;
  finishRevealedSession?: () => Promise<void> | void;
  retryLoad: () => void;

  padRef: React.MutableRefObject<VectorPadState>;
  zHeldRef: React.MutableRefObject<boolean>;
  codeInputId?: string;
  updateCurrent: (patch: Partial<QItem>) => void;

  excuseAndNext?: (reason?: string | null) => Promise<void> | void;
  skipLoadError?: () => Promise<void> | void;
};

function getResultBoxClass(current: QItem | null) {
  if (isExcusedPracticeItem(current)) {
    return "ui-surface-warn";
  }
  if (current?.revealed) {
    return "ui-surface-soft border-sky-300/40 bg-sky-50/70 dark:border-sky-300/25 dark:bg-sky-300/10";
  }
  if (current?.result?.ok === true) {
    return "ui-surface-success";
  }
  if (current?.result) {
    return "ui-surface-danger";
  }
  return "ui-surface-soft";
}

export default function PracticeShell(props: PracticeShellProps) {
  const { phase, isLockedRun, maxAttempts, current, exercise } = props;

  const canSubmitNow = useMemo(
      () => !!(current && buildSubmitAnswerFromItem(current)),
      [current],
  );

  const finalized = isPracticeItemFinalized(current, maxAttempts, isLockedRun);
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