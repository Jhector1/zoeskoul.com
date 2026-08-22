"use client";

import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { Difficulty } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import PracticeShell from "@/components/practice/PracticeShell";

import { usePracticeRunMeta, type TopicValue } from "./usePracticeRunMeta";
import {
  usePracticeStatePersistence,
  type Phase,
} from "./usePracticeStatePersistence";
import { usePracticeEngine } from "./usePracticeEngine";
import { useVectorPadRef } from "./useVectorPadRef";
import { SESSION_DEFAULT } from "./constants";
import { buildPracticeUrlSyncSearch } from "@student/features/practice/client/storage";
import {coercePurposeMode, coercePurposePolicy} from "@zoeskoul/curriculum-contracts/subjects/quizClient";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import { getPracticeRuntimeSurfacePolicy, type PracticeRuntimeSurface } from "@/lib/practice/experience/routePolicy";
import { resolvePracticeResumePolicy } from "./assignmentResumePolicy";
import { resolvePracticePurposeDefaults } from "./experienceModePolicy";
import type { SessionStatus } from "./sessionStatus";
import { startSelfPacedPractice } from "@zoeskoul/learning-client";

type PendingChange =
  | { kind: "topic"; value: TopicValue }
  | { kind: "difficulty"; value: Difficulty | "all" }
  | null;

export function usePracticeController(args: {
  subjectSlug?: string;
  moduleSlug?: string;
  sessionId?: string | null;
  isTrial?: boolean;
  authoritativeSessionId?: boolean;
  surface: PracticeRuntimeSurface;
  initialExperienceMode?: PracticeExperienceMode;
  clientStatePersistence?: "session" | "off";
  initialSessionStatus?: SessionStatus | null;
}) {
  const {
    subjectSlug,
    moduleSlug,
    sessionId: initialSessionId,
    isTrial = false,
    authoritativeSessionId = false,
    surface,
    initialExperienceMode,
    clientStatePersistence = "session",
    initialSessionStatus = null,
  } = args;

  const t = useTranslations("Practice");

  const router = useRouter();
  const pathname = usePathname();

  const {
    sp,
    run,
    setRun,
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

    effectiveTopicOptions,
    effectiveDifficultyOptions,
  } = usePracticeRunMeta({
    subjectSlug,
    moduleSlug,
    surface,
    initialExperienceMode,
  });

  const surfacePolicy = getPracticeRuntimeSurfacePolicy(surface);

  // filters / phase / misc UI state
  const [topic, setTopic] = useState<TopicValue>("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [section, setSection] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(
      initialSessionId ?? null,
  );
  const [phase, setPhase] = useState<Phase>("practice");
  const [showMissed, setShowMissed] = useState(true);

  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [sessionSize, setSessionSize] = useState<number>(SESSION_DEFAULT);
  const [autoSummarized, setAutoSummarized] = useState(false);

  // ✅ new: once completed, refresh should default to summary
  const [completed, setCompleted] = useState(false);

  const [completionReturnUrl, setCompletionReturnUrl] = useState<string | null>(
    null,
  );

  // ✅ SINGLE SOURCE OF TRUTH for progress
  const [stack, setStack] = useState<QItem[]>([]);
  const [idx, setIdx] = useState(0);

  const current = stack[idx] ?? null;

  // internal refs used by persistence/url-sync and filter reset
  const firstFiltersEffectRef = useRef(true);
  const skipUrlSyncRef = useRef(true);
  const preferPurposeFromQuery = coercePurposeMode((sp as any)?.get?.("preferPurpose"));
  const purposePolicyFromQuery = coercePurposePolicy((sp as any)?.get?.("purposePolicy"));
  const practiceRunId =
    String((sp as any)?.get?.("practiceRunId") ?? "").trim() || null;
  const practiceRunStartedAt =
    String((sp as any)?.get?.("practiceRunStartedAt") ?? "").trim() || null;
  const rawPracticeQuestionCount = Number(
    (sp as any)?.get?.("questionCount"),
  );
  const practiceQuestionCount =
    Number.isFinite(rawPracticeQuestionCount) && rawPracticeQuestionCount > 0
      ? Math.floor(rawPracticeQuestionCount)
      : null;

  const { preferPurpose, purposePolicy } = resolvePracticePurposeDefaults({
    experienceMode,
    requestedPurpose: preferPurposeFromQuery,
    requestedPolicy: purposePolicyFromQuery,
    isLockedRun,
  });

  const resumePolicy = resolvePracticeResumePolicy({
    experienceMode,
    requestedPersistence: clientStatePersistence,
    expectedExperienceMode: initialExperienceMode,
  });

// ✅ persistence hydrates + persists stack/idx (+ completed)
  const { hydrated, resolvedSessionIdRef } = usePracticeStatePersistence({
    subjectSlug,
    moduleSlug,

    section,
    topic,
    difficulty,
    sessionId,
    practiceRunId,
    initialSessionId: initialSessionId ?? null,
    authoritativeSessionId,
    expectedExperienceMode: resumePolicy.expectedExperienceMode,
    clientStatePersistence: resumePolicy.clientStatePersistence,
    run,

    phase,
    autoSummarized,
    completed, // ✅
    showMissed,

    stack,
    idx,
    sessionSize,

    setSection,
    setTopic,
    setDifficulty,
    setSessionId,
    setRun,

    setPhase,
    setAutoSummarized,
    setCompleted, // ✅
    setShowMissed,

    setStack,
    setIdx,
    setSessionSize,

    setLoadErr,

    firstFiltersEffectRef,
    skipUrlSyncRef,
  });

  // vector refs based on current (shared)
  const { padRef, zHeldRef } = useVectorPadRef(current);

  // ✅ engine uses controller-owned stack/idx + can set completed
  const engine = usePracticeEngine({
    subjectSlug,
    moduleSlug,
    t, // ✅ ADD THIS

    run,
    setRun,
    isLockedRun,
    allowReveal,
    maxAttempts,
    returnUrlFromQuery,

    hydrated,
    resolvedSessionIdRef,

    topic,
    difficulty,
    section,
    sessionSize,
    setSessionSize,
    sessionId,
    setSessionId,

    phase,
    setPhase,
    autoSummarized,
    setAutoSummarized,

    completed, // ✅
    setCompleted, // ✅

    busy,
    setBusy,
    setLoadErr,
    setActionErr,

    completionReturnUrl,
    setCompletionReturnUrl,

    stack,
    setStack,
    idx,
    setIdx,

    padRef,

    // ✅ NEW
    preferPurpose,
    purposePolicy,
    allowedExperienceModes: surfacePolicy.allowedModes,
    expectedExperienceMode: resumePolicy.expectedExperienceMode,
    resumeHistoryOnBoot: resumePolicy.resumeHistoryOnBoot,
    authoritativeSessionId,
    initialSessionId: initialSessionId ?? null,
    initialSessionStatus,
    practiceRunId,
    practiceRunStartedAt,
    practiceQuestionCount,
  } as any);

  // lock selected values when run says so
  useEffect(() => {
    if (!run) return;
    if (!run.filters.difficultyEditable && run.lockDifficulty) {
      setDifficulty(run.lockDifficulty as any);
    }
    if (!run.filters.topicEditable && run.lockTopic) {
      setTopic(run.lockTopic as any);
    }
  }, [run]);

  // ✅ force initial landing to Summary once completed
  // (but still allow user to go back to questions afterward)
  const forcedSummaryOnceRef = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!completed) return;
    if (forcedSummaryOnceRef.current) return;

    forcedSummaryOnceRef.current = true;
    setPhase("summary");
  }, [hydrated, completed]);

  // Scope selection belongs to the shared self-paced start contract.
  // Normal self-paced Practice has no DB session; URL run identity owns only deterministic browser-run selection.
  // Header chooses module/section/topic before start; Lesson/Review supplies
  // whole-module scope.

  // URL sync preserves the stateless run query. Real sessionId remains authoritative only for legacy/assignment/session-backed experiences.
  useEffect(() => {
    if (!hydrated) return;

    const currentSearch = sp.toString();
    const normalizedSessionId = String(sessionId ?? "").trim() || null;
    const currentSessionId =
      String(sp.get("sessionId") ?? "").trim() || null;
    const needsSessionIdentitySync =
      currentSessionId !== normalizedSessionId;

    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      if (!needsSessionIdentitySync) return;
    }

    const desired = buildPracticeUrlSyncSearch({
      currentSearch,
      sessionId: normalizedSessionId,
      isLockedRun,
      section,
      topic,
      difficulty,
      preferPurpose,
      purposePolicy,
      sessionSize,
    });
    if (desired === currentSearch) return;

    router.replace(`${pathname}?${desired}`, { scroll: false });
  }, [
    hydrated,
    isLockedRun,
    sp,
    sessionId,
    section,
    topic,
    difficulty,
    preferPurpose,
    purposePolicy,
    sessionSize,
    router,
    pathname,
  ]);

  // confirm modal + guarded filter changes
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);

  const hasProgress =
    phase === "practice" &&
    (engine.answeredCount > 0 ||
      !!sessionId ||
      !!current?.result ||
      (current?.single?.trim()?.length ?? 0) > 0 ||
      (current?.multi?.length ?? 0) > 0 ||
      (current?.num?.trim()?.length ?? 0) > 0 ||
      (current?.code?.trim()?.length ?? 0) > 0 ||
      (current?.codeStdin?.trim()?.length ?? 0) > 0);

  function requestChange(next: PendingChange) {
    if (!next) return;
    if (isLockedRun) return;

    if (!hasProgress) {
      if (next.kind === "topic") setTopic(next.value);
      if (next.kind === "difficulty") setDifficulty(next.value);
      return;
    }
    setPendingChange(next);
    setConfirmOpen(true);
  }

  function applyPendingChange() {
    if (!pendingChange) return;
    if (pendingChange.kind === "topic") setTopic(pendingChange.value);
    if (pendingChange.kind === "difficulty") setDifficulty(pendingChange.value);
    setConfirmOpen(false);
    setPendingChange(null);
  }

  function cancelPendingChange() {
    setConfirmOpen(false);
    setPendingChange(null);
  }
  const restartPractice = useCallback(async () => {
    if (
      surface !== "module_practice" ||
      isAssignmentRun ||
      !subjectSlug ||
      !moduleSlug
    ) {
      return;
    }

    setLoadErr(null);
    setActionErr(null);

    const locale = pathname.split("/").filter(Boolean)[0] || "en";
    const rawTargetCount = Number(sp.get("questionCount"));
    const requestedTargetCount =
      Number.isFinite(rawTargetCount) && rawTargetCount > 0
        ? Math.floor(rawTargetCount)
        : null;

    try {
      setBusy(true);
      const started = await startSelfPacedPractice({
        locale,
        subjectSlug,
        moduleSlug,
        sectionSlug: section,
        topicSlug: topic === "all" ? null : String(topic),
        targetCount: requestedTargetCount,
        difficulty:
          difficulty === "easy" ||
          difficulty === "medium" ||
          difficulty === "hard"
            ? difficulty
            : null,
        returnTo: returnUrlFromQuery,
      });

      router.replace(started.href, { scroll: false });
    } catch (error) {
      setLoadErr(
        error instanceof Error
          ? error.message
          : "Could not restart Practice.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    surface,
    isAssignmentRun,
    subjectSlug,
    moduleSlug,
    pathname,
    sp,
    section,
    topic,
    difficulty,
    returnUrlFromQuery,
    router,
    setActionErr,
    setBusy,
    setLoadErr,
  ]);

  const resolvedReturnUrl = completionReturnUrl || returnUrlFromQuery || null;
  const shellProps: React.ComponentProps<typeof PracticeShell> = useMemo(
    () => ({
      locale: pathname.split("/").filter(Boolean)[0] || "en",
      subjectSlug,
      moduleSlug,
      returnUrl: resolvedReturnUrl,
      leaderboardUrl: (() => {
        const locale = pathname.split("/").filter(Boolean)[0] || "en";
        return `/${locale}/leaderboard`;
      })(),
      dailyResetAt: run?.daily?.nextResetAt ?? null,
      reviewStack: engine.reviewStack,
      experienceMode,
      viewer: run?.viewer ?? {
        tier: "guest",
        authenticated: false,
        subscribed: false,
      },
      isOnboardingTrial: isOnboardingTrialRun,
      isSharedChallenge: isPublicChallengeRun,
      isDailyFive: isDailyFiveRun,
      challengeTitle: run?.challenge?.title ?? null,
      helpPolicy: run?.help ?? null,
      modulePracticeProgress:
        engine.modulePracticeProgress ??
        run?.subscriberPractice ??
        run?.daily?.modulePractice ??
        null,

      // ...existing props...
      excuseAndNext: (reason?: string | null) => engine.excuseAndNext?.(reason),
      skipLoadError: () => engine.skipLoadError?.(),

      onReturn: () => {
        const parts = pathname.split("/").filter(Boolean);
        const locale = parts[0] || "en";

        if (run?.mode === "daily_five") {
          if (!run.viewer.subscribed) {
            router.replace(`/${locale}/billing`, { scroll: false });
            return;
          }
          if (subjectSlug && moduleSlug) {
            router.replace(
              `/${locale}/subjects/${encodeURIComponent(subjectSlug)}/modules/${encodeURIComponent(moduleSlug)}/practice`,
              { scroll: false },
            );
            return;
          }
        }

        const raw = String(resolvedReturnUrl ?? "").trim();

        // use session-provided returnUrl first
        if (raw && !raw.startsWith("//") && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
          const path = raw.startsWith("/") ? raw : `/${raw}`;
          const hasLocalePrefix =
              path.startsWith(`/${locale}/`) || path === `/${locale}`;

          const safe = hasLocalePrefix ? path : `/${locale}${path}`;
          router.replace(safe, { scroll: false });
          return;
        }

        // fallback: if this is onboarding trial and we know the subject, go to auth
        if (isTrial && subjectSlug) {
          const returnTo = `/${locale}/subjects/${encodeURIComponent(subjectSlug)}/modules`;
          const qs = new URLSearchParams({
            from: "trial",
            subject: subjectSlug,
            returnTo,
          });

          router.replace(`/${locale}/authenticate?${qs.toString()}`, {
            scroll: false,
          });
          return;
        }

        // final safe fallback
        router.replace(`/${locale}/subjects`, { scroll: false });
      },
      t,

      isAssignmentRun,
      isSessionRun,
      isLockedRun,
      topicLocked,
      difficultyLocked,
      allowReveal,
      showDebug,
      maxAttempts,

      sessionSize,
      setSessionSize,

      topic,
      setTopic: (v: any) => requestChange({ kind: "topic", value: v }),
      difficulty,
      setDifficulty: (v: any) =>
        requestChange({ kind: "difficulty", value: v }),

      section,
      setSection,

      topicOptionsFixed: effectiveTopicOptions as any,
      difficultyOptions: effectiveDifficultyOptions as any,

      badge: engine.badge,
      // reviewStack: (engine as any).reviewStack,

      busy,
      loadErr,
      actionErr,

      phase,
      setPhase, // ✅ allow back to questions

      showMissed,
      setShowMissed,

      pct: engine.pct,
      answeredCount: engine.answeredCount,
      correctCount: engine.correctCount,

      stack,
      idx,
      setIdx,

      current,
      exercise: engine.exercise,

      missed: engine.missed,

      confirmOpen,
      applyPendingChange,
      cancelPendingChange,

      canGoPrev: engine.canGoPrev,
      canGoNext: engine.canGoNext,
      goPrev: engine.goPrev,
      goNext: engine.goNext,
      submit: engine.submit,
      openHelp: engine.openHelp,
      reveal: () => engine.openHelp("reveal"),
      pendingRevealCompletion: engine.deferredRevealCompletion,
      finishRevealedSession: engine.finishDeferredReveal,
      retryLoad: engine.retryLoad,
      resetCurrentExercise: engine.resetCurrentExercise,
      restartPractice,
      submitBusy: engine.submitBusy,
      padRef,
      zHeldRef,
      updateCurrent: engine.updateCurrent,
    }),
    [
      completionReturnUrl,
      resolvedReturnUrl,
      returnUrlFromQuery,
      pathname,
      subjectSlug,
      run,
      experienceMode,
      router,
      t,
    engine.reviewStack, // ✅ add this

      isAssignmentRun,
      isPublicChallengeRun,
      isOnboardingTrialRun,
      isDailyFiveRun,
      isSessionRun,
      isLockedRun,
      topicLocked,
      difficultyLocked,
      allowReveal,
      showDebug,
      maxAttempts,
      engine.submitBusy,
      engine.deferredRevealCompletion,
      engine.openHelp,
      engine.finishDeferredReveal,
      engine.resetCurrentExercise,
      restartPractice,
      sessionSize,
      topic,
      difficulty,
      section,

      effectiveTopicOptions,
      effectiveDifficultyOptions,

      engine.badge,
      engine.pct,
      engine.answeredCount,
      engine.correctCount,
      engine.exercise,
      engine.missed,
      engine.canGoPrev,
      engine.canGoNext,

      busy,
      loadErr,
      actionErr,
      phase,
      showMissed,
      confirmOpen,
      padRef,
      zHeldRef,
      engine.excuseAndNext,
      engine.skipLoadError,
      isTrial, // ✅ add

      stack,
      idx,
      current,
    ],
  );


  return { shellProps };
}
