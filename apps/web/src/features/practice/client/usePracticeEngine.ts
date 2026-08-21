"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  Exercise,
  SubmitAnswer,
  Difficulty,
  TopicSlug,
} from "@/lib/practice/types";
import type { QItem, MissedItem } from "@/lib/practice/uiTypes";
import {
  fetchPracticeExercise,
  type PracticeGetResponse,
} from "@/lib/practice/clientApi";
import {
  buildSubmitAnswerFromItem,
  cloneVec,
  initItemFromExercise,
} from "@/lib/practice/uiHelpers";
import { isExcusedPracticeItem } from "@zoeskoul/learner-ui/lib/flow/excuse";
import { usePracticeExcuseActions } from "@/lib/flow/usePracticeExcuseActions";
import { getSessionStatus, type SessionStatus } from "./sessionStatus";
import { SESSION_DEFAULT } from "./constants";
import type { RunMeta, TopicValue } from "./usePracticeRunMeta";
import type { VectorPadState } from "@zoeskoul/learner-ui/vectorpad/types";
import { getEffectiveSid } from "./storage";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { emitSfx } from "@/lib/sfx/bus";
import {
  buildLocalMissed,
  computePracticeCounts,
  computePracticePct,
  historyRowToQItem,
  isPracticeItemFinalized,
  isRecoverablePracticeKeyError,
  requestPracticeHelpItem,
  submitPracticeItem,
} from "@/lib/practice/runtime";
import { PurposeMode, PurposePolicy } from "@zoeskoul/curriculum-contracts/subjects/types";
import {
  readInstanceIdFromSignedPracticeKey,
  samePracticeExerciseIdentity,
} from "@/lib/practice/exerciseIdentity";
import { resolveRevealCompletionTransition } from "@/lib/practice/experience/revealCompletion";
import { reconcileSelfPacedCompletionStack } from "@/lib/practice/experience/selfPacedCompletionReconciliation";
import {
  canRevealPracticeAnswer,
  isRevealStepKey,
} from "@/lib/practice/help/steps";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import { buildServerResumePlan } from "./assignmentResumePolicy";
import { resolvePracticePurposeRequestParams } from "./practiceRequestPolicy";
import { resolvePracticeProgressCounts } from "./practiceProgressCounts";

export type Phase = "practice" | "summary";

type CompletedPracticeGetResponse = Extract<
  PracticeGetResponse,
  { complete: true }
>;
type PracticeProgressSnapshot =
  | SessionStatus
  | CompletedPracticeGetResponse;

function applyAnswerPayloadToItem(item: QItem, payload: any) {
  if (!payload || typeof payload !== "object") return;

  switch (payload.kind) {
    case "single_choice":
      (item as any).single = payload.optionId ?? null;
      break;
    case "multi_choice":
      (item as any).multi = Array.isArray(payload.optionIds) ? payload.optionIds : [];
      break;
    case "numeric":
      (item as any).num =
          payload.value === null || payload.value === undefined ? "" : String(payload.value);
      break;
    case "matrix_input":
      if (Array.isArray(payload.raw)) (item as any).mat = payload.raw;
      break;
    case "pseudocode_input":
      (item as any).pseudocode = String(payload.value ?? payload.solution ?? "");
      break;
    case "code_input": {
      const code =
          typeof payload.code === "string"
              ? payload.code
              : typeof payload.source === "string"
                  ? payload.source
                  : "";

      const stdin =
          typeof payload.stdin === "string"
              ? payload.stdin
              : typeof payload.codeStdin === "string"
                  ? payload.codeStdin
                  : "";

      const lang =
          typeof payload.language === "string"
              ? payload.language
              : typeof payload.codeLang === "string"
                  ? payload.codeLang
                  : null;

      if (lang) (item as any).codeLang = lang;
      (item as any).code = code;
      (item as any).codeStdin = stdin;
      break;
    }
    case "vector_drag_dot":
      (item as any).dragA = payload.a ?? (item as any).dragA;
      break;
    case "vector_drag_target":
      (item as any).dragA = payload.a ?? (item as any).dragA;
      (item as any).dragB = payload.b ?? (item as any).dragB;
      break;
  }
}

export function buildCorrectItemFromExpected(q: QItem, expectedPayload: any): QItem | null {
  const exercise = q.exercise as Exercise | undefined;
  if (!exercise || !expectedPayload) return null;

  const payload =
      typeof expectedPayload === "object" && expectedPayload?.kind
          ? expectedPayload
          : {
            kind: String(exercise.kind),
            ...(typeof expectedPayload === "object" ? expectedPayload : {}),
          };

  const item = initItemFromExercise(exercise, `expected:${q.key}`);
  applyAnswerPayloadToItem(item, payload);

  (item as any).submitted = true;
  (item as any).result = { ok: true, finalized: true };

  return item;
}

function exerciseSignature(ex: Exercise | null | undefined): string {
  if (!ex) return "";
  return [
    String(ex.topic ?? ""),
    String(ex.kind ?? ""),
    String(ex.title ?? ""),
    String(ex.prompt ?? ""),
  ].join("||");
}

function stableAt(q: QItem): number {
  const anyQ = q as any;
  const v = anyQ.at ?? anyQ.createdAt ?? anyQ.loadedAt ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function usePracticeEngine(args: {
  subjectSlug: string;
  moduleSlug: string;
  t: any;

  run: RunMeta | null;
  setRun: (r: RunMeta | null) => void;
  isLockedRun: boolean;
  allowReveal: boolean;
  maxAttempts: number;
  returnUrlFromQuery: string | null;

  preferPurpose?: string;
  purposePolicy?: string;
  allowedExperienceModes?: readonly PracticeExperienceMode[];
  expectedExperienceMode?: PracticeExperienceMode;
  resumeHistoryOnBoot?: boolean;
  authoritativeSessionId?: boolean;
  initialSessionId?: string | null;
  initialSessionStatus?: SessionStatus | null;
  practiceRunId?: string | null;
  practiceRunStartedAt?: string | null;
  practiceQuestionCount?: number | null;

  hydrated: boolean;
  resolvedSessionIdRef: MutableRefObject<string | null>;

  topic: TopicValue;
  difficulty: any;
  section: string | null;

  sessionSize: number;
  setSessionSize: (n: number | ((p: number) => number)) => void;

  sessionId: string | null;
  setSessionId: (v: string | null) => void;

  phase: Phase;
  setPhase: (p: Phase) => void;

  autoSummarized: boolean;
  setAutoSummarized: (v: boolean) => void;

  completed: boolean;
  setCompleted: (v: boolean) => void;

  busy: boolean;
  setBusy: (v: boolean) => void;
  setLoadErr: (v: string | null) => void;
  setActionErr: (v: string | null) => void;

  completionReturnUrl: string | null;
  setCompletionReturnUrl: (v: string | null) => void;

  stack: QItem[];
  setStack: (v: QItem[] | ((p: QItem[]) => QItem[])) => void;

  idx: number;
  setIdx: (v: number | ((p: number) => number)) => void;

  padRef: MutableRefObject<VectorPadState>;
}) {
  const {
    subjectSlug,
    moduleSlug,
    t,
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
    preferPurpose,
    purposePolicy,
    allowedExperienceModes,
    expectedExperienceMode,
    resumeHistoryOnBoot = false,
    authoritativeSessionId = false,
    initialSessionId = null,
    initialSessionStatus = null,
    practiceRunId = null,
    practiceRunStartedAt = null,
    practiceQuestionCount = null,
    phase,
    setPhase,
    autoSummarized,
    setAutoSummarized,
    completed,
    setCompleted,
    busy,
    setBusy,
    setLoadErr,
    setActionErr,
    setCompletionReturnUrl,
    stack,
    setStack,
    idx,
    setIdx,
    padRef,
  } = args;

  const initialSessionStatusRef = useRef<SessionStatus | null>(
    initialSessionStatus,
  );

  const abortRef = useRef<AbortController | null>(null);
  const submitLockRef = useRef(false);
  const loadLockRef = useRef(false);
  const bootCompleteRef = useRef(false);
  const [serverStatus, setServerStatus] =
    useState<PracticeProgressSnapshot | null>(null);

  const [serverMissed, setServerMissed] = useState<MissedItem[]>([]);
  const [serverHistoryStack, setServerHistoryStack] = useState<QItem[]>([]);

  const appliedRunCountRef = useRef(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [deferredRevealCompletion, setDeferredRevealCompletion] = useState(false);
  const current = stack[idx] ?? null;
  const exercise = current?.exercise ?? null;

  const tt = useTaggedT();
  const rawKeyRef = useRef<(key: string) => string>((key) => key);
  const resolveTextRef = useRef<(value: string) => string>((value) => value);

  rawKeyRef.current = (key: string) => tt.raw(key, key);
  resolveTextRef.current = (value: string) => tt.resolve(value, value);

  function acceptRunMeta(candidate: RunMeta | null | undefined) {
    if (!candidate?.mode) return true;

    const allowed =
      allowedExperienceModes && allowedExperienceModes.length > 0
        ? allowedExperienceModes.includes(candidate.mode)
        : !expectedExperienceMode || candidate.mode === expectedExperienceMode;

    if (!allowed) {
      // A route may host more than one intentional experience (the shared
      // module-practice route hosts subscriber practice and assignments), but
      // it must never hydrate a session owned by another surface such as Daily
      // Practice or the onboarding trial.
      setRun(null);
      setStack([]);
      setIdx(0);
      setLoadErr("This practice session cannot open on this page.");
      return false;
    }

    setRun(candidate);
    return true;
  }

  useEffect(() => {
    setActionErr(null);
  }, [idx, setActionErr]);

  const localMissed: MissedItem[] = useMemo(() => {
    return buildLocalMissed(stack, maxAttempts, isLockedRun);
  }, [stack, maxAttempts, isLockedRun]);

  const missed = useMemo(() => {
    const serverAns = Math.max(
        serverStatus?.totalCount ?? 0,
        serverStatus?.answeredCount ?? 0,
    );
    const stackLooksPartial = completed && serverAns > stack.length;

    if (stackLooksPartial) return serverMissed;
    return localMissed.length ? localMissed : serverMissed;
  }, [localMissed, serverMissed, serverStatus, completed, stack.length]);

  useEffect(() => {
    if (!hydrated) return;
    if (!completed) return;
    if (!autoSummarized) setAutoSummarized(true);
    if (phase !== "summary") setPhase("summary");
  }, [hydrated, completed, autoSummarized, phase, setAutoSummarized, setPhase]);

  useEffect(() => {
    if (!hydrated) return;
    if (!run?.targetCount) return;
    if (appliedRunCountRef.current) return;

    setSessionSize((cur) => (cur === SESSION_DEFAULT ? run.targetCount : cur));
    appliedRunCountRef.current = true;
  }, [hydrated, run, setSessionSize]);

  function updatePracticeItemForIdentity(args: {
    sourceItem: QItem;
    sourceExercise: Exercise;
    patch: Partial<QItem>;
  }) {
    setStack((prev) => {
      if (idx < 0 || idx >= prev.length) return prev;

      const targetItem = prev[idx];
      if (
        !samePracticeExerciseIdentity({
          leftItem: args.sourceItem,
          leftExercise: args.sourceExercise,
          rightItem: targetItem,
          rightExercise: targetItem?.exercise ?? null,
        })
      ) {
        return prev;
      }

      const next = prev.slice();
      next[idx] = {
        ...targetItem,
        ...args.patch,
        help: args.patch.help
            ? {
              ...targetItem.help,
              ...args.patch.help,
              entries: {
                ...targetItem.help.entries,
                ...(args.patch.help.entries ?? {}),
              },
            }
            : targetItem.help,
      };
      return next;
    });
  }

  function updateCurrent(patch: Partial<QItem>) {
    if (!current || !exercise) return;
    updatePracticeItemForIdentity({
      sourceItem: current,
      sourceExercise: exercise,
      patch,
    });
  }

  function resetCurrentExercise() {
    if (!current || !exercise) return;

    const resetItem = initItemFromExercise(exercise, current.key, {
      resolveText: (value) => resolveTextRef.current(value),
    });

    // Reset the learner workspace and answer, but never refund ranked/limited
    // attempts that have already been recorded by the server.
    resetItem.attempts = current.attempts ?? 0;

    setStack((prev) => {
      if (idx < 0 || idx >= prev.length) return prev;
      const next = prev.slice();
      next[idx] = resetItem;
      return next;
    });

    padRef.current.a = cloneVec(resetItem.dragA) as any;
    padRef.current.b = cloneVec(resetItem.dragB) as any;
    setDeferredRevealCompletion(false);
    setLoadErr(null);
    setActionErr(null);
  }

  const {
    answeredCount: localAnswered,
    correctCount: localCorrect,
    excusedAnswered: localExcusedAnswered,
  } = useMemo(() => {
    return computePracticeCounts(stack, maxAttempts, isLockedRun);
  }, [stack, maxAttempts, isLockedRun]);

  const reviewStack = useMemo(() => {
    const serverAns = Math.max(
        serverStatus?.totalCount ?? 0,
        serverStatus?.answeredCount ?? 0,
    );

    const serverIsMoreComplete =
        Array.isArray(serverHistoryStack) &&
        serverHistoryStack.length > 0 &&
        (completed ||
            serverAns > stack.length ||
            serverHistoryStack.length > stack.length);

    if (serverIsMoreComplete) return serverHistoryStack;
    return stack;
  }, [stack, serverHistoryStack, serverStatus, completed]);

  const canonicalSubscriberPractice =
    serverStatus?.run?.mode === "practice"
      ? serverStatus.run.subscriberPractice ?? null
      : run?.mode === "practice"
        ? run.subscriberPractice ?? null
        : null;

  const { answeredCount, correctCount } =
    resolvePracticeProgressCounts({
      localAnswered,
      localCorrect,
      serverStatus,
      subscriberPractice: canonicalSubscriberPractice,
    });

  const pct = computePracticePct({
    answeredCount,
    correctCount,
    excusedAnswered: localExcusedAnswered,
  });

  function buildPracticeRequest(args: {
    sid?: string | null;
    signal?: AbortSignal;
  }) {
    const sid = String(args.sid ?? "").trim() || null;
    const purposeRequest = resolvePracticePurposeRequestParams({
      sessionId: sid,
      preferPurpose: preferPurpose as PurposeMode | undefined,
      purposePolicy: purposePolicy as PurposePolicy | undefined,
    });
    if (sid) {
      return {
        sessionId: sid,
        allowReveal: allowReveal ? true : undefined,
        signal: args.signal,
        ...purposeRequest,
      };
    }

    return {
      subject: subjectSlug,
      module: moduleSlug,
      section: section ?? undefined,
      topic: topic === "all" ? undefined : topic,
      difficulty: difficulty === "all" ? undefined : difficulty,
      questionCount: practiceQuestionCount ?? undefined,
      practiceRunId: practiceRunId ?? undefined,
      practiceRunStartedAt: practiceRunStartedAt ?? undefined,
      allowReveal: allowReveal ? true : undefined,
      signal: args.signal,
      ...purposeRequest,
    };
  }

  async function hydrateCompletedSessionSnapshot() {
    const sid = getEffectiveSid({
      sessionId,
      resolvedSessionIdRef,
      authoritativeSessionId,
      initialSessionId,
    });

    if (!sid) return;

    try {
      const status = await getSessionStatus(String(sid), {
        includeMissed: true,
        includeHistory: true,
        subject: subjectSlug,
        module: moduleSlug,
      });

      if (!status) return;
      if (status.run?.mode && !acceptRunMeta(status.run as any)) return;

      setServerStatus(status);
      setServerMissed(Array.isArray(status.missed) ? status.missed : []);

      if (Array.isArray(status.history) && status.history.length > 0) {
        setServerHistoryStack(status.history.map(historyRowToQItem));
      }

      setCompletionReturnUrl(status.returnUrl || returnUrlFromQuery);
    } catch {
      // Completion can still render from the local item. The summary refresh
      // effect will retry the authoritative history request.
    }
  }

  function applyCompletedPracticeSnapshot(
    response: CompletedPracticeGetResponse,
  ) {
    setServerStatus(response);
    setServerMissed(
      Array.isArray(response.missed) ? response.missed : [],
    );
    setServerHistoryStack(
      Array.isArray(response.history)
        ? response.history.map(historyRowToQItem)
        : [],
    );

    const responseTargetCount = Math.max(
      Number(response.targetCount ?? 0),
      Number(response.totalCount ?? 0),
    );
    if (
      Number.isFinite(responseTargetCount) &&
      responseTargetCount > 0
    ) {
      setSessionSize(responseTargetCount);
    }

    setCompletionReturnUrl(
      response.returnUrl ||
      response.run?.returnUrl ||
      returnUrlFromQuery,
    );
  }

  async function refreshCurrentPracticeKey() {
    if (!current || !exercise) return null;

    const sourceItem = current;
    const sourceExercise = exercise;
    const refreshInstanceId = readInstanceIdFromSignedPracticeKey(sourceItem.key);
    if (!refreshInstanceId) {
      throw new Error("Unable to refresh this practice authorization identity.");
    }

    const sid = getEffectiveSid({
      sessionId,
      resolvedSessionIdRef,
      authoritativeSessionId,
      initialSessionId,
    });
    if (
      !sid &&
      (!practiceRunId || !practiceRunStartedAt)
    ) {
      return null;
    }
    const response = await fetchPracticeExercise({
      ...buildPracticeRequest({ sid }),
      keyRefreshOnly: true,
      keyRefreshInstanceId: refreshInstanceId,
    });

    const runFromApi = (response as any)?.run;
    if (runFromApi?.mode && !acceptRunMeta(runFromApi)) return null;

    if ((response as any)?.complete) {
      applyCompletedPracticeSnapshot(
        response as CompletedPracticeGetResponse,
      );
      setCompleted(true);
      setAutoSummarized(true);
      setPhase("summary");
      return null;
    }

    const rawExercise = (response as any)?.exercise;
    const freshKey = (response as any)?.key;
    if (
      !rawExercise ||
      typeof rawExercise?.kind !== "string" ||
      typeof freshKey !== "string"
    ) {
      throw new Error("Unable to refresh this practice exercise.");
    }

    if ((response as any)?.sessionId) {
      setSessionId(String((response as any).sessionId));
    }

    const freshExercise = resolveDeepTagged(
      rawExercise,
      (key) => rawKeyRef.current(key),
    ) as Exercise;
    const freshBase = initItemFromExercise(freshExercise, freshKey, {
      resolveText: (value) => resolveTextRef.current(value),
    });

    if (
      !samePracticeExerciseIdentity({
        leftItem: sourceItem,
        leftExercise: sourceExercise,
        rightItem: freshBase,
        rightExercise: freshExercise,
      })
    ) {
      throw new Error(
        "Practice exercise changed while refreshing its authorization. Please retry.",
      );
    }

    const freshItem: QItem = {
      ...freshBase,
      ...sourceItem,
      key: freshKey,
      exercise: freshExercise,
      help: {
        ...freshBase.help,
        ...sourceItem.help,
        entries: {
          ...freshBase.help.entries,
          ...sourceItem.help.entries,
        },
      },
    };

    updatePracticeItemForIdentity({
      sourceItem,
      sourceExercise,
      patch: freshItem,
    });

    if (runFromApi?.mode === "practice") {
      setStack((prev) =>
        reconcileSelfPacedCompletionStack({
          stack: prev,
          completedPrefix:
            runFromApi?.subscriberPractice?.completedPrefix ?? [],
        }),
      );
    }

    return { item: freshItem, exercise: freshExercise };
  }

  async function loadNextExercise() {
    if (phase === "summary") return;
    if (completed) return;
    if (loadLockRef.current) return;
    if (answeredCount >= sessionSize) return;

    loadLockRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setLoadErr(null);

    try {
      const effectiveSid = getEffectiveSid({
        sessionId,
        resolvedSessionIdRef,
        authoritativeSessionId,
        initialSessionId,
      });
      if (
        !effectiveSid &&
        (!practiceRunId || !practiceRunStartedAt)
      ) {
        throw new Error(
          "Practice run identity is missing. Start Practice from a supported entry point.",
        );
      }

      const sid = effectiveSid;
      const response = await fetchPracticeExercise(
        buildPracticeRequest({ sid, signal: controller.signal }),
      );

      const runFromApi = (response as any)?.run;
      if (runFromApi?.mode && !acceptRunMeta(runFromApi)) {
        throw new Error("Practice session experience mismatch.");
      }

      if ((response as any)?.complete) {
        applyCompletedPracticeSnapshot(
          response as CompletedPracticeGetResponse,
        );
        const sid2 = (response as any)?.sessionId;
        if (sid2) setSessionId(String(sid2));

        try {
          const completionSid = sid2 ?? sid;
          const st = completionSid
            ? await getSessionStatus(String(completionSid), {
                includeMissed: true,
                includeHistory: true,
                subject: subjectSlug,
                module: moduleSlug,
              })
            : null;

          if (st) {
            if (st?.history?.length) {
              setServerHistoryStack(st.history.map(historyRowToQItem));
            }
            setServerStatus(st);
            if (st?.missed) setServerMissed(st.missed);
            if (st?.run?.mode && !acceptRunMeta(st.run as any)) {
              throw new Error("Practice session experience mismatch.");
            }
            setCompletionReturnUrl(st.returnUrl || returnUrlFromQuery);
          } else {
            const serverReturn =
                (response as any)?.returnUrl || (response as any)?.run?.returnUrl || (response as any)?.returnTo || null;
            setCompletionReturnUrl(serverReturn || returnUrlFromQuery);
          }
        } catch {
          const serverReturn =
              (response as any)?.returnUrl || (response as any)?.run?.returnUrl || (response as any)?.returnTo || null;
          setCompletionReturnUrl(serverReturn || returnUrlFromQuery);
        }

        setCompleted(true);
        setAutoSummarized(true);
        setPhase("summary");
        return;
      }

      const ex = (response as any)?.exercise;
      const key = (response as any)?.key;

      if (!ex || typeof ex?.kind !== "string" || typeof key !== "string") {
        throw new Error("Malformed response from /api/practice (missing exercise/key).");
      }

      if ((response as any)?.sessionId) {
        setSessionId(String((response as any).sessionId));
      }

      const resolvedEx = resolveDeepTagged(
          ex,
          (k) => rawKeyRef.current(k),
      ) as Exercise;

      const item = initItemFromExercise(resolvedEx, key, {
        resolveText: (value) => resolveTextRef.current(value),
      });
      const challengeAttemptsUsed = Number(
          runFromApi?.challenge?.attemptsUsed ?? 0,
      );
      if (Number.isFinite(challengeAttemptsUsed) && challengeAttemptsUsed > 0) {
        item.attempts = Math.floor(challengeAttemptsUsed);
      }

      setStack((prev) => {
        const next = [...prev, item];
        setIdx(next.length - 1);
        return next;
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setLoadErr(e?.message ?? t("errors.failedToLoad"));
    } finally {
      if (abortRef.current === controller) setBusy(false);
      loadLockRef.current = false;
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    if (bootCompleteRef.current) return;
    if (phase === "summary") return;
    if (completed) return;

    const effectiveSid = getEffectiveSid({
      sessionId,
      resolvedSessionIdRef,
      authoritativeSessionId,
      initialSessionId,
    });
    let alive = true;

    (async () => {
      let shouldLoadCurrent = stack.length === 0;

      if (effectiveSid) {
        const prefetchedStatus = initialSessionStatusRef.current;
        initialSessionStatusRef.current = null;

        const st =
          prefetchedStatus ??
          (await getSessionStatus(String(effectiveSid), {
            includeMissed: true,
            includeHistory: resumeHistoryOnBoot,
            subject: subjectSlug,
            module: moduleSlug,
          }));
        if (!alive) return;

        if (st) {
          setServerStatus(st);
          if (st?.missed) setServerMissed(st.missed);
          if (st?.run?.mode && !acceptRunMeta(st.run as any)) return;

          const historyStack = Array.isArray(st.history)
            ? st.history.map(historyRowToQItem)
            : [];
          if (historyStack.length > 0) {
            setServerHistoryStack(historyStack);
          }

          const resumePlan = buildServerResumePlan({
            enabled: resumeHistoryOnBoot,
            complete: Boolean(st.complete),
            localStack: stack,
            history: historyStack,
          });

          if (resumePlan.seedStack) {
            setStack(resumePlan.seedStack);
            setIdx(Math.max(0, resumePlan.seedStack.length - 1));
          }
          shouldLoadCurrent = resumePlan.shouldLoadCurrent;

          const tc = st?.targetCount;
          if (typeof tc === "number" && tc > 0) {
            setSessionSize((cur) => (cur === SESSION_DEFAULT ? tc : cur));
          }

          if (st?.complete) {
            bootCompleteRef.current = true;
            setCompleted(true);
            setAutoSummarized(true);
            setPhase("summary");
            setCompletionReturnUrl(st.returnUrl || returnUrlFromQuery);
            return;
          }
        }
      }

      if (
        !effectiveSid &&
        stack.length > 0 &&
        practiceRunId &&
        practiceRunStartedAt
      ) {
        try {
          // A restored stateless run can be older than canonical learner
          // history. Refresh the exact current key: the server returns the
          // same exercise plus a freshly loaded canonical completedPrefix,
          // without generating or reordering this browser run.
          await refreshCurrentPracticeKey();
        } catch {
          // Keep the restored run usable if this opportunistic reconciliation
          // fails. The normal signed-key recovery path will retry later.
        }
        if (!alive) return;
      }

      if (!shouldLoadCurrent) {
        bootCompleteRef.current = true;
        return;
      }

      if (
        !effectiveSid &&
        (!practiceRunId || !practiceRunStartedAt)
      ) {
        bootCompleteRef.current = true;
        setLoadErr(
          "Practice run identity is missing. Start Practice from a supported entry point.",
        );
        return;
      }

      await loadNextExercise();
      if (alive) bootCompleteRef.current = true;
    })();

    return () => {
      alive = false;
    };
  }, [
    hydrated,
    phase,
    sessionId,
    stack.length,
    returnUrlFromQuery,
    completed,
    subjectSlug,
    moduleSlug,
    practiceRunId,
    practiceRunStartedAt,
    resolvedSessionIdRef,
    setRun,
    expectedExperienceMode,
    allowedExperienceModes,
    resumeHistoryOnBoot,
    authoritativeSessionId,
    initialSessionId,
    setSessionSize,
    setCompleted,
    setAutoSummarized,
    setPhase,
    setCompletionReturnUrl,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (phase !== "summary") return;

    const effectiveSid = getEffectiveSid({
      sessionId,
      resolvedSessionIdRef,
      authoritativeSessionId,
      initialSessionId,
    });
    if (!effectiveSid) return;

    if (serverMissed.length > 0 && serverHistoryStack.length > 0) return;

    let alive = true;

    (async () => {
      const st = await getSessionStatus(String(effectiveSid), {
        includeMissed: true,
        includeHistory: true,
        subject: subjectSlug,
        module: moduleSlug,
      });
      if (!alive) return;

      if (st) {
        setServerStatus(st);
        if (st?.missed) setServerMissed(st.missed);
        if (st?.run?.mode && !acceptRunMeta(st.run as any)) return;
        if (st?.complete) setCompletionReturnUrl(st.returnUrl || returnUrlFromQuery);

        if (Array.isArray(st.history) && st.history.length) {
          setServerHistoryStack(st.history.map(historyRowToQItem));
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    hydrated,
    phase,
    sessionId,
    resolvedSessionIdRef,
    serverMissed.length,
    serverHistoryStack.length,
    returnUrlFromQuery,
    subjectSlug,
    moduleSlug,
    setRun,
    expectedExperienceMode,
    allowedExperienceModes,
    authoritativeSessionId,
    initialSessionId,
    setCompletionReturnUrl,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (completed) return;
    if (deferredRevealCompletion) return;

    if (!autoSummarized && answeredCount >= sessionSize) {
      setCompleted(true);
      setAutoSummarized(true);
      setPhase("summary");
    }
  }, [
    hydrated,
    answeredCount,
    sessionSize,
    autoSummarized,
    completed,
    setCompleted,
    setAutoSummarized,
    setPhase,
    deferredRevealCompletion,
  ]);

  function canGoPrev() {
    return idx > 0;
  }

  function canGoNext() {
    if (!current) return true;
    if (idx < stack.length - 1) return true;

    // Navigation must follow the same finalization rule used by progress
    // counting. In particular, a revealed answer is final even after the
    // learner fills or edits the revealed solution for study.
    if (!isPracticeItemFinalized(current, maxAttempts, isLockedRun)) {
      return false;
    }

    return answeredCount < sessionSize;
  }

  async function goNext() {
    if (!canGoNext()) return;

    if (!current) {
      await loadNextExercise();
      return;
    }

    if (idx < stack.length - 1) {
      setIdx((i) => Math.min(stack.length - 1, i + 1));
      return;
    }

    await loadNextExercise();
  }

  function goPrev() {
    if (!canGoPrev()) return;
    setIdx((i) => Math.max(0, i - 1));
  }

  async function submit() {
    if (completed) return;
    if (deferredRevealCompletion) return;
    if (submitLockRef.current) return;
    if (!current || !exercise) return;
    if (submitBusy) return;

    if (current.submitted) return;
    if (isLockedRun && (current.attempts ?? 0) >= maxAttempts) return;

    submitLockRef.current = true;
    setActionErr(null);

    try {
      setSubmitBusy(true);

      let activeItem = current;
      let activeExercise = exercise;
      let submitted: Awaited<ReturnType<typeof submitPracticeItem>>;
      // Reuse this UUID if an expired signed key forces a refresh/retry. The
      // server maps it to PracticeAttempt.id, making the retry durable and
      // idempotent across processes and tabs.
      const submissionId = crypto.randomUUID();

      try {
        submitted = await submitPracticeItem({
          item: activeItem,
          exercise: activeExercise,
          padRef,
          maxAttempts,
          isLockedRun,
          submissionId,
        });
      } catch (error) {
        if (!isRecoverablePracticeKeyError(error)) throw error;

        const refreshed = await refreshCurrentPracticeKey();
        if (!refreshed) return;
        activeItem = refreshed.item;
        activeExercise = refreshed.exercise;

        submitted = await submitPracticeItem({
          item: activeItem,
          exercise: activeExercise,
          padRef,
          maxAttempts,
          isLockedRun,
          submissionId,
        });
      }

      emitSfx(submitted.ok ? "answer:correct" : "answer:wrong");

      updatePracticeItemForIdentity({
        sourceItem: activeItem,
        sourceExercise: activeExercise,
        patch: {
          ...(submitted.statePatch ?? {}),
          result: {
            ...(submitted.data as any),
            ok: submitted.ok,
            finalized: submitted.finalized,
          },
          attempts: submitted.used,
          submitted: submitted.finalized,

          // Every new validation result must control feedback visibility.
          // Wrong feedback remains visible until the learner makes another real edit.
          feedbackDismissed: submitted.ok,
        },
      });

      if ((submitted.data as any)?.sessionComplete) {
        const waitForReveal = canRevealPracticeAnswer({
          allowReveal,
          attempts: submitted.used,
          solved: submitted.ok,
          revealed: false,
        });

        if (waitForReveal) {
          // The server may consider the final failed attempt terminal, but the
          // learner still owns the reveal decision. Keep the exercise visible
          // so Reveal answer can fill the solution before explicit navigation.
          setCompleted(false);
          setAutoSummarized(false);
          return;
        }

        await hydrateCompletedSessionSnapshot();
        setCompleted(true);
        setAutoSummarized(true);
        setPhase("summary");

        const serverReturn =
            (submitted.data as any)?.returnUrl ||
            (submitted.data as any)?.run?.returnUrl ||
            null;

        setCompletionReturnUrl(serverReturn || returnUrlFromQuery);
        return;
      }
    } catch (e: any) {
      setActionErr(e?.message ?? t("errors.failedToSubmit"));
    } finally {
      setSubmitBusy(false);
      submitLockRef.current = false;
    }
  }

  async function openHelp(stepKey?: string) {
    if (completed) return;
    if (!current || !exercise || busy) return;

    const chosenKey =
      stepKey ??
      (allowReveal ? "reveal" : "hint_1");
    const openingReveal = isRevealStepKey(chosenKey);
    const alreadyRevealed = Boolean(
      current.revealed ||
      (current.result as any)?.revealUsed ||
      (current.result as any)?.revealAnswer,
    );

    if (
      isPracticeItemFinalized(current, maxAttempts, isLockedRun) &&
      !(openingReveal && !alreadyRevealed)
    ) {
      return;
    }

    setBusy(true);
    setActionErr(null);

    try {

      let activeItem = current;
      let activeExercise = exercise;
      let opened: Awaited<ReturnType<typeof requestPracticeHelpItem>>;

      try {
        opened = await requestPracticeHelpItem({
          item: activeItem,
          exercise: activeExercise,
          stepKey: chosenKey,
          padRef,
        });
      } catch (error) {
        if (!isRecoverablePracticeKeyError(error)) throw error;

        const refreshed = await refreshCurrentPracticeKey();
        if (!refreshed) return;
        activeItem = refreshed.item;
        activeExercise = refreshed.exercise;

        opened = await requestPracticeHelpItem({
          item: activeItem,
          exercise: activeExercise,
          stepKey: chosenKey,
          padRef,
        });
      }

      const previousHelp = activeItem.help;
      const nextOpenedKeys = previousHelp.openedStepKeys.includes(chosenKey)
        ? previousHelp.openedStepKeys
        : [...previousHelp.openedStepKeys, chosenKey];

      updatePracticeItemForIdentity({
        sourceItem: activeItem,
        sourceExercise: activeExercise,
        patch: {
          ...(!openingReveal && opened.dragA ? { dragA: opened.dragA } : {}),
          ...(!openingReveal && opened.dragB ? { dragB: opened.dragB } : {}),
          ...(opened.data.finalized
            ? {
                revealed: true,
                submitted: true,
                result: {
                  ok: false,
                  finalized: true,
                  revealUsed: true,
                  explanation: opened.data.content ?? null,
                  sessionComplete: Boolean(opened.data.sessionComplete),
                  returnUrl:
                    (opened.data as any)?.returnUrl ??
                    (opened.data as any)?.run?.returnUrl ??
                    null,
                } as any,
              }
            : {}),
          help: {
            ...previousHelp,
            openedStepKeys: nextOpenedKeys,
            activeStepKey: chosenKey,
            busyStepKey: null,
            error: null,
            entries: {
              ...previousHelp.entries,
              [chosenKey]: opened.entry,
            },
          },
        },
      });

      if (opened.data.sessionComplete) {
        await hydrateCompletedSessionSnapshot();
        const serverReturn =
          (opened.data as any)?.returnUrl ??
          (opened.data as any)?.run?.returnUrl ??
          null;
        if (serverReturn) setCompletionReturnUrl(serverReturn);

        const revealTransition = resolveRevealCompletionTransition(run?.mode);
        const shouldWaitForExplicitContinue =
          chosenKey === "reveal" && revealTransition === "explicit";

        if (shouldWaitForExplicitContinue) {
          setDeferredRevealCompletion(true);
        } else {
          setDeferredRevealCompletion(false);
          setCompleted(true);
          setAutoSummarized(true);
          setPhase("summary");
        }
      }

      if (!openingReveal && opened.dragA) {
        padRef.current.a = cloneVec(opened.dragA) as any;
      }
      if (!openingReveal && opened.dragB) {
        padRef.current.b = cloneVec(opened.dragB) as any;
      }
    } catch (e: any) {
      setActionErr(e?.message ?? t("errors.failedToSubmit"));
    } finally {
      setBusy(false);
    }
  }

  function finishDeferredReveal() {
    if (!deferredRevealCompletion) return;
    setDeferredRevealCompletion(false);
    setCompleted(true);
    setAutoSummarized(true);
    setPhase("summary");
  }

  const { excuseAndNext, skipLoadError } = usePracticeExcuseActions({
    current,
    idx,
    setStack: (u) => setStack((p) => u(p)),
    goNext,
    loadNextExercise,
    actionErr: (args as any).actionErr ?? null,
    setActionErr,
  });

  const badge = useMemo(() => {
    if (!exercise) return "";
    return `${String(exercise.topic).toUpperCase()} • ${exercise.kind.replaceAll("_", " ")}`;
  }, [exercise]);

  return {
    current,
    exercise,
    answeredCount,
    correctCount,
    modulePracticeProgress: canonicalSubscriberPractice,
    missed,
    badge,
    pct,
    reviewStack,
    submitBusy,
    updateCurrent,
    resetCurrentExercise,
    loadNextExercise,
    retryLoad: () => loadNextExercise(),

    canGoPrev: canGoPrev(),
    canGoNext: canGoNext(),
    goPrev,
    goNext,
    submit,
    openHelp,
    deferredRevealCompletion,
    finishDeferredReveal,

    excuseAndNext,
    skipLoadError,
  };
}