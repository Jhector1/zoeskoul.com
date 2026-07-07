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
import { isExcusedPracticeItem } from "@/lib/flow/excuse";
import { usePracticeExcuseActions } from "@/lib/flow/usePracticeExcuseActions";
import { getSessionStatus, SessionStatus } from "./sessionStatus";
import { SESSION_DEFAULT } from "./constants";
import type { RunMeta, TopicValue } from "./usePracticeRunMeta";
import type { VectorPadState } from "@/components/vectorpad/types";
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
import { PurposeMode, PurposePolicy } from "@/lib/subjects/types";
import { samePracticeExerciseIdentity } from "@/lib/practice/exerciseIdentity";
import { resolveRevealCompletionTransition } from "@/lib/practice/experience/revealCompletion";

export type Phase = "practice" | "summary";

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

  const abortRef = useRef<AbortController | null>(null);
  const submitLockRef = useRef(false);
  const loadLockRef = useRef(false);
  const bootCompleteRef = useRef(false);
  const [serverStatus, setServerStatus] = useState<SessionStatus | null>(null);

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

  function updateCurrent(patch: Partial<QItem>) {
    setStack((prev) => {
      if (idx < 0 || idx >= prev.length) return prev;
      const next = prev.slice();
      next[idx] = {
        ...next[idx],
        ...patch,
        help: patch.help
            ? {
              ...next[idx].help,
              ...patch.help,
              entries: {
                ...next[idx].help.entries,
                ...(patch.help.entries ?? {}),
              },
            }
            : next[idx].help,
      };
      return next;
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

  const serverAnswered = Math.max(
      serverStatus?.totalCount ?? 0,
      serverStatus?.answeredCount ?? 0,
  );
  const serverCorrect = serverStatus?.correctCount ?? 0;

  const answeredCount = Math.max(localAnswered, serverAnswered);
  const correctCount = Math.max(localCorrect, serverCorrect);

  const pct = computePracticePct({
    answeredCount,
    correctCount,
    excusedAnswered: localExcusedAnswered,
  });

  function buildPracticeRequest(args: {
    sid: string | null;
    signal?: AbortSignal;
  }) {
    const useSession = Boolean(args.sid);

    return {
      sessionId: useSession ? args.sid ?? undefined : undefined,
      allowReveal: allowReveal ? true : undefined,
      signal: args.signal,
      subject: useSession ? undefined : subjectSlug,
      module: useSession ? undefined : moduleSlug,
      topic: useSession ? undefined : String(topic === "all" ? "" : topic),
      difficulty:
        useSession || difficulty === "all" ? undefined : difficulty,
      section: useSession ? undefined : section ?? undefined,
      preferPurpose: preferPurpose as any,
      purposePolicy: purposePolicy as any,
    };
  }

  async function refreshCurrentPracticeKey() {
    if (!current || !exercise) return null;

    const sid = getEffectiveSid({ sessionId, resolvedSessionIdRef });
    if (!sid) return null;

    const response = await fetchPracticeExercise(
      buildPracticeRequest({ sid }),
    );

    const runFromApi = (response as any)?.run;
    if (runFromApi?.mode) setRun(runFromApi);

    if ((response as any)?.complete) {
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
    const sameExercise = samePracticeExerciseIdentity({
      leftItem: current,
      leftExercise: exercise,
      rightItem: freshBase,
      rightExercise: freshExercise,
    });

    const freshItem: QItem = sameExercise
      ? {
          ...freshBase,
          ...current,
          key: freshKey,
          exercise: freshExercise,
          help: {
            ...freshBase.help,
            ...current.help,
            entries: {
              ...freshBase.help.entries,
              ...current.help.entries,
            },
          },
        }
      : freshBase;

    setStack((prev) => {
      if (idx < 0 || idx >= prev.length) return prev;
      const next = prev.slice();
      next[idx] = freshItem;
      return next;
    });

    if (!sameExercise) {
      padRef.current.a = cloneVec(freshItem.dragA) as any;
      padRef.current.b = cloneVec(freshItem.dragB) as any;
    }

    return { item: freshItem, exercise: freshExercise };
  }

  async function loadNextExercise(opts?: { forceNew?: boolean }) {
    if (phase === "summary" && !opts?.forceNew) return;
    if (completed && !opts?.forceNew) return;
    if (loadLockRef.current) return;
    if (answeredCount >= sessionSize && !opts?.forceNew) return;

    loadLockRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setLoadErr(null);

    try {
      const effectiveSid = getEffectiveSid({ sessionId, resolvedSessionIdRef });
      const sid = opts?.forceNew ? null : effectiveSid;
      const useSession = Boolean(sid);

      const response = await fetchPracticeExercise(
        buildPracticeRequest({ sid, signal: controller.signal }),
      );

      const runFromApi = (response as any)?.run;
      if (runFromApi?.mode) setRun(runFromApi);

      if ((response as any)?.complete) {
        const sid2 = (response as any)?.sessionId;
        if (sid2) setSessionId(String(sid2));

        try {
          const st = await getSessionStatus(String(sid2 ?? sid), {
            includeMissed: true,
            includeHistory: true,
            subject: subjectSlug,
            module: moduleSlug,
          });

          if (st) {
            if (st?.history?.length) {
              setServerHistoryStack(st.history.map(historyRowToQItem));
            }
            setServerStatus(st);
            if (st?.missed) setServerMissed(st.missed);
            if (st?.run?.mode) setRun(st.run as any);
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

    const effectiveSid = getEffectiveSid({ sessionId, resolvedSessionIdRef });
    let alive = true;

    (async () => {
      if (effectiveSid) {
        const st = await getSessionStatus(String(effectiveSid), {
          includeMissed: true,
          subject: subjectSlug,
          module: moduleSlug,
        });
        if (!alive) return;

        if (st) {
          setServerStatus(st);
          if (st?.missed) setServerMissed(st.missed);
          if (st?.run?.mode) setRun(st.run as any);

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

      if (stack.length > 0) return;
      await loadNextExercise({ forceNew: !effectiveSid });
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
    resolvedSessionIdRef,
    setRun,
    setSessionSize,
    setCompleted,
    setAutoSummarized,
    setPhase,
    setCompletionReturnUrl,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (phase !== "summary") return;

    const effectiveSid = getEffectiveSid({ sessionId, resolvedSessionIdRef });
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
        if (st?.run?.mode) setRun(st.run as any);
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

      updateCurrent({
        ...(submitted.statePatch ?? {}),
        result: submitted.data as any,
        attempts: submitted.used,
        submitted: submitted.finalized,
      });

      if ((submitted.data as any)?.sessionComplete) {
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
    if (isPracticeItemFinalized(current, maxAttempts, isLockedRun)) return;

    setBusy(true);
    setActionErr(null);

    try {
      const chosenKey =
        stepKey ??
        (allowReveal ? "reveal" : "hint_1");

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

      updateCurrent({
        ...(opened.dragA ? { dragA: opened.dragA } : {}),
        ...(opened.dragB ? { dragB: opened.dragB } : {}),
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
      });

      if (opened.data.sessionComplete) {
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

      if (opened.dragA) padRef.current.a = cloneVec(opened.dragA) as any;
      if (opened.dragB) padRef.current.b = cloneVec(opened.dragB) as any;
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
    sessionId,
    resolvedSessionIdRef,
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
    missed,
    badge,
    pct,
    reviewStack,
    submitBusy,
    updateCurrent,
    resetCurrentExercise,
    loadNextExercise,
    retryLoad: () => loadNextExercise({ forceNew: false }),

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