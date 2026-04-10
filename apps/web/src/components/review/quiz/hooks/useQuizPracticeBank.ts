"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { ReviewQuestion, ReviewQuizSpec } from "@/lib/subjects/types";
import type { VectorPadState } from "@/components/vectorpad/types";
import { defaultVectorPadState } from "@/components/vectorpad/defaultState";
import type { SavedQuizState } from "@/lib/review/progressTypes";
import type { QItem } from "@/lib/practice/uiTypes";
import type { PracticeItemState } from "@/lib/practice/runtime";
import {
  coerceMaxAttempts,
  extractCodeLike,
  fetchResolvedPracticeItem,
  requestPracticeHelpItem,
  submitPracticeItem,
} from "@/lib/practice/runtime";
import { cloneVec } from "@/lib/practice/uiHelpers";
import { emitSfx } from "@/lib/sfx/bus";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import {
  DEFAULT_PRACTICE_HELP_POLICY,
  getNextPracticeHelpStepKey,
} from "@/lib/practice/help/steps";

export { isEmptyPracticeAnswer } from "@/lib/practice/runtime";
export type PracticeState = PracticeItemState;

const LOAD_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);

    promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
    );
  });
}
function sanitizeSavedPracticePatch(savedPatch: any, exerciseKind?: string) {
  if (!savedPatch) return null;

  const next = { ...savedPatch };

  if (exerciseKind === "drag_reorder" && !next.ui?.reorderTouched) {
    delete next.reorder;
    delete next.reorderIds;
  }

  return next;
}
export function useQuizPracticeBank(args: {
  questions: ReviewQuestion[];
  spec: ReviewQuizSpec;
  unlimitedAttempts: boolean;
  initialState: SavedQuizState | null;
  resetKey: string;
  isCompleted: boolean;
  locked: boolean;
}) {
  const {
    questions,
    spec,
    unlimitedAttempts,
    initialState,
    resetKey,
    isCompleted,
    locked,
  } = args;

  const specMaxAttempts = (spec as any).maxAttempts;

  const tt = useTaggedT();
  const rawKeyRef = useRef<(key: string) => string>((key) => key);
  const resolveTextRef = useRef<(value: string) => string>((value) => value);

  rawKeyRef.current = (key: string) => tt.raw(key, key);
  resolveTextRef.current = (value: string) => tt.resolve(value, value);

  const [practice, setPractice] = useState<Record<string, PracticeState>>({});
  const practiceRef = useRef(practice);

  // Token per question: latest request wins for that question.
  const loadTokenRef = useRef<Record<string, number>>({});

  // Cycle changes whenever the quiz is reset/remounted logically.
  // Prevents old requests from a previous cycle from writing into a new one.
  const loadCycleRef = useRef(0);

  useEffect(() => {
    practiceRef.current = practice;
  }, [practice]);

  const padRefs = useRef<Record<string, React.MutableRefObject<VectorPadState>>>(
      {},
  );

  function getPadRef(id: string) {
    if (!padRefs.current[id]) {
      padRefs.current[id] = { current: defaultVectorPadState() };
    }
    return padRefs.current[id];
  }

  useEffect(() => {
    loadCycleRef.current += 1;
    setPractice({});
    padRefs.current = {};
    loadTokenRef.current = {};
  }, [resetKey]);

  const loadPracticeQuestion = useCallback(
      async (
          q: Extract<ReviewQuestion, { kind: "practice" }>,
          opts?: { force?: boolean; cancelledRef?: { current: boolean } },
      ) => {
        const force = Boolean(opts?.force);
        const cancelledRef = opts?.cancelledRef;
        const cycle = loadCycleRef.current;

        const existing = practiceRef.current?.[q.id];
        const alreadyResolved = Boolean(existing?.exercise && existing?.item);

        // Long-term fix:
        // only skip when the question is fully resolved.
        // Do NOT skip just because existing.loading is true, because a stale/cancelled
        // load can otherwise strand the question forever in a loading state.
        if (!force && alreadyResolved) {
          return;
        }

        const token = (loadTokenRef.current[q.id] ?? 0) + 1;
        loadTokenRef.current[q.id] = token;

        const initMeta = initialState?.practiceMeta?.[q.id];
        const fallbackMax = unlimitedAttempts
            ? null
            : coerceMaxAttempts((q as any).maxAttempts ?? specMaxAttempts ?? null);

        setPractice((prev) => {
          const prevState = prev[q.id];
          return {
            ...prev,
            [q.id]: {
              loading: true,
              error: null,
              busy: false,
              // keep current content while refreshing if it already exists
              exercise: prevState?.exercise ?? null,
              item: prevState?.item ?? null,
              attempts: initMeta?.attempts ?? prevState?.attempts ?? 0,
              ok: initMeta?.ok ?? prevState?.ok ?? null,
              maxAttempts: prevState?.maxAttempts ?? fallbackMax,
              helpPolicy:
                  prevState?.helpPolicy ?? DEFAULT_PRACTICE_HELP_POLICY,
            },
          };
        });

        try {
          const loaded = await withTimeout(
              fetchResolvedPracticeItem({
                request: {
                  subject: (q as any).fetch.subject,
                  module: (q as any).fetch.module,
                  section: (q as any).fetch.section,
                  topic: (q as any).fetch.topic
                      ? String((q as any).fetch.topic)
                      : "",
                  difficulty: (q as any).fetch.difficulty,
                  allowReveal: (q as any).fetch.allowReveal ? true : undefined,
                  preferKind: (q as any).fetch.preferKind ?? undefined,
                  salt: (q as any).fetch.salt ?? undefined,
                  preferPurpose: "mixed",
                  purposePolicy: "fallback",
                  exerciseKey: (q as any).fetch.exerciseKey ?? undefined,
                  seedPolicy: (q as any).fetch.seedPolicy ?? undefined,
                },
                resolvers: {
                  raw: (k) => rawKeyRef.current(k),
                  resolveText: (value) => resolveTextRef.current(value),
                },
                savedPatch: sanitizeSavedPracticePatch(
                    initialState?.practiceItemPatch?.[q.id] ?? null,
                    "drag_reorder" // or derive from resolved exercise/fetch metadata
                ),                transformItem: (baseItem, resolvedEx) => {
                  const mode = (spec as any).mode ?? "quiz";
                  const carryFromPrev =
                      mode === "project" && Boolean((q as any).carryFromPrev);

                  if (!carryFromPrev || (resolvedEx as any).kind !== "code_input") {
                    return baseItem;
                  }

                  const idx = questions.findIndex((qq) => qq.id === q.id);
                  const prevQ = idx > 0 ? questions[idx - 1] : null;

                  const rawCurrentPatch = initialState?.practiceItemPatch?.[q.id];
                  const currentPatch = rawCurrentPatch
                      ? resolveDeepTagged(rawCurrentPatch, (k) => rawKeyRef.current(k))
                      : null;

                  const current = extractCodeLike(currentPatch);

                  let prevSource: any = null;
                  if (prevQ) {
                    const livePrevItem = practiceRef.current?.[prevQ.id]?.item;
                    const rawPrevSource =
                        livePrevItem ?? initialState?.practiceItemPatch?.[prevQ.id] ?? null;

                    prevSource = rawPrevSource
                        ? resolveDeepTagged(rawPrevSource, (k) => rawKeyRef.current(k))
                        : null;
                  }

                  const prev = extractCodeLike(prevSource);

                  if (!current.code && prev.code) {
                    return {
                      ...baseItem,
                      code: prev.code,
                      codeStdin: prev.stdin ?? (baseItem as any).codeStdin ?? "",
                      codeLang: (prev.language as any) ?? (baseItem as any).codeLang,
                      stdin: prev.stdin ?? (baseItem as any).stdin ?? "",
                    };
                  }

                  return baseItem;
                },
              }),
              LOAD_TIMEOUT_MS,
              "Exercise took too long to load. Please retry.",
          );

          if (cancelledRef?.current) return;
          if (loadCycleRef.current !== cycle) return;
          if (loadTokenRef.current[q.id] !== token) return;

          setPractice((prev) => {
            const base = prev[q.id];
            if (!base) return prev;

            return {
              ...prev,
              [q.id]: {
                ...base,
                loading: false,
                error: null,
                exercise: loaded.exercise,
                item: loaded.item,
                attempts:
                    initialState?.practiceMeta?.[q.id]?.attempts ??
                    base.attempts ??
                    0,
                ok: initialState?.practiceMeta?.[q.id]?.ok ?? base.ok ?? null,
                maxAttempts: loaded.maxAttempts ?? base.maxAttempts ?? null,
                helpPolicy:
                    loaded.helpPolicy ??
                    base.helpPolicy ??
                    DEFAULT_PRACTICE_HELP_POLICY,
              },
            };
          });
        } catch (e: any) {
          if (cancelledRef?.current) return;
          if (loadCycleRef.current !== cycle) return;
          if (loadTokenRef.current[q.id] !== token) return;

          setPractice((prev) => {
            const current = prev[q.id];
            if (!current) return prev;

            return {
              ...prev,
              [q.id]: {
                ...current,
                loading: false,
                busy: false,
                // keep old content if refresh fails
                error: e?.message ?? "Failed to load practice exercise.",
              },
            };
          });
        }
      },
      [initialState, questions, spec, specMaxAttempts, unlimitedAttempts],
  );

  useEffect(() => {
    if (!questions.length) return;

    const cancelledRef = { current: false };

    for (const q of questions) {
      if (q.kind !== "practice") continue;
      void loadPracticeQuestion(q, { cancelledRef });
    }

    return () => {
      cancelledRef.current = true;
    };
  }, [questions, loadPracticeQuestion, resetKey]);

  const retryPracticeQuestion = useCallback(
      async (qid: string) => {
        const q = questions.find(
            (qq): qq is Extract<ReviewQuestion, { kind: "practice" }> =>
                qq.kind === "practice" && qq.id === qid,
        );
        if (!q) return;
        await loadPracticeQuestion(q, { force: true });
      },
      [questions, loadPracticeQuestion],
  );

  const updatePracticeItem = useCallback((qid: string, patch: Partial<QItem>) => {
    const pr = padRefs.current[qid];
    if (pr?.current) {
      if ((patch as any).dragA) pr.current.a = cloneVec((patch as any).dragA) as any;
      if ((patch as any).dragB) pr.current.b = cloneVec((patch as any).dragB) as any;
    }

    setPractice((prev) => {
      const ps = prev[qid];
      if (!ps?.item) return prev;

      const nextItem = {
        ...ps.item,
        ...patch,
        help: patch.help
            ? {
              ...ps.item.help,
              ...patch.help,
              entries: {
                ...ps.item.help.entries,
                ...(patch.help.entries ?? {}),
              },
            }
            : ps.item.help,
      };

      const isReset =
          ("submitted" in patch && (patch as any).submitted === false) ||
          ("result" in patch && (patch as any).result == null);

      return {
        ...prev,
        [qid]: {
          ...ps,
          item: nextItem,
          ok: isReset ? null : ps.ok,
        },
      };
    });
  }, []);

  const submitPractice = useCallback(
      async (q: Extract<ReviewQuestion, { kind: "practice" }>) => {
        if (isCompleted || locked) return;

        const ps = practice[q.id];
        if (!ps || ps.loading || ps.busy || !ps.item || !ps.exercise) return;

        const attemptsCapped =
            !unlimitedAttempts &&
            ps.maxAttempts != null &&
            ps.attempts >= ps.maxAttempts;

        if (attemptsCapped) return;
        if (ps.ok === true) return;

        setPractice((prev) => ({
          ...prev,
          [q.id]: { ...prev[q.id], busy: true, error: null },
        }));

        try {
          const submitted = await submitPracticeItem({
            item: ps.item,
            exercise: ps.exercise,
            padRef: getPadRef(q.id),
            maxAttempts: ps.maxAttempts,
            isLockedRun: !unlimitedAttempts && ps.maxAttempts != null,
          });

          emitSfx(submitted.ok ? "answer:correct" : "answer:wrong");

          setPractice((prev) => {
            const nextAttempts = submitted.used;

            return {
              ...prev,
              [q.id]: {
                ...prev[q.id],
                busy: false,
                attempts: nextAttempts,
                ok: submitted.ok,
                maxAttempts:
                    submitted.serverMaxAttempts ?? prev[q.id].maxAttempts ?? null,
                item: {
                  ...prev[q.id].item!,
                  ...(submitted.statePatch ?? {}),
                  result: submitted.data as any,
                  submitted: true,
                  attempts: nextAttempts,
                } as any,
              },
            };
          });
        } catch (e: any) {
          setPractice((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              busy: false,
              error: e?.message ?? "Submit failed.",
            },
          }));
        }
      },
      [practice, unlimitedAttempts, isCompleted, locked],
  );

  const openPracticeHelp = useCallback(
      async (
          q: Extract<ReviewQuestion, { kind: "practice" }>,
          explicitStepKey?: string,
      ) => {
        if (isCompleted || locked) return;

        const ps = practice[q.id];
        if (!ps || ps.loading || ps.busy || !ps.item || !ps.exercise) return;
        if (ps.ok === true) return;

        const enabledStepKeys = ps.helpPolicy?.stepKeys?.length
            ? ps.helpPolicy.stepKeys
            : DEFAULT_PRACTICE_HELP_POLICY.stepKeys;

        const openedStepKeys = ps.item.help?.openedStepKeys ?? [];

        const stepKey =
            explicitStepKey ??
            getNextPracticeHelpStepKey(enabledStepKeys, openedStepKeys);

        if (!stepKey) return;

        const existing = ps.item.help?.entries?.[stepKey];
        if (existing) {
          setPractice((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              item: {
                ...prev[q.id].item!,
                help: {
                  ...prev[q.id].item!.help,
                  activeStepKey: stepKey,
                  error: null,
                },
              },
            },
          }));
          return;
        }

        setPractice((prev) => ({
          ...prev,
          [q.id]: {
            ...prev[q.id],
            busy: true,
            error: null,
            item: {
              ...prev[q.id].item!,
              help: {
                ...prev[q.id].item!.help,
                busyStepKey: stepKey,
                error: null,
              },
            },
          },
        }));

        try {
          const opened = await requestPracticeHelpItem({
            item: ps.item,
            exercise: ps.exercise,
            stepKey,
            padRef: getPadRef(q.id),
          });

          if (opened.dragA || opened.dragB) {
            const pr = getPadRef(q.id);
            if (pr.current) {
              if (opened.dragA) pr.current.a = cloneVec(opened.dragA) as any;
              if (opened.dragB) pr.current.b = cloneVec(opened.dragB) as any;
            }
          }

          setPractice((prev) => {
            const current = prev[q.id];
            if (!current?.item) return prev;

            const prevHelp = current.item.help;
            const openedKeys = prevHelp.openedStepKeys.includes(stepKey)
                ? prevHelp.openedStepKeys
                : [...prevHelp.openedStepKeys, stepKey];

            return {
              ...prev,
              [q.id]: {
                ...current,
                busy: false,
                item: {
                  ...current.item,
                  dragA: opened.dragA ?? current.item.dragA,
                  dragB: opened.dragB ?? current.item.dragB,
                  help: {
                    ...prevHelp,
                    openedStepKeys: openedKeys,
                    activeStepKey: stepKey,
                    busyStepKey: null,
                    error: null,
                    entries: {
                      ...prevHelp.entries,
                      [stepKey]: opened.entry,
                    },
                  },
                },
              },
            };
          });
        } catch (e: any) {
          setPractice((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              busy: false,
              error: e?.message ?? "Help failed.",
              item: prev[q.id]?.item
                  ? {
                    ...prev[q.id].item!,
                    help: {
                      ...prev[q.id].item!.help,
                      busyStepKey: null,
                      error: e?.message ?? "Help failed.",
                    },
                  }
                  : prev[q.id]?.item,
            },
          }));
        }
      },
      [practice, isCompleted, locked],
  );

  function isPracticeChecked(q: Extract<ReviewQuestion, { kind: "practice" }>) {
    const ps = practice[q.id];
    return Boolean(ps && ps.attempts > 0);
  }

  return {
    practice,
    setPractice,
    getPadRef,
    updatePracticeItem,
    submitPractice,
    openPracticeHelp,
    isPracticeChecked,
    retryPracticeQuestion,
  };
}