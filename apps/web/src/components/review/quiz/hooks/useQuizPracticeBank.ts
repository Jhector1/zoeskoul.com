"use client";

import React, {useEffect, useRef, useState, useCallback, useMemo} from "react";
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
import { emitGamificationUpdate } from "@/lib/gamification/browserEvents";
import { reviewDebug, summarizePracticePatch } from "@/components/review/module/runtime/reviewDebug";
import { exerciseDebug, summarizeExercisePatch } from "@/components/review/module/runtime/exerciseDebug";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";

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

export function getStablePracticeQuestionKey(q: ReviewQuestion) {
  if (q.kind !== "practice") return q.id;

  const anyQ = q as any;

  return (
      anyQ.fetch?.exerciseKey ??
      anyQ.fetch?.stepId ??
      anyQ.exerciseKey ??
      anyQ.stepId ??
      anyQ.sourceStepId ??
      anyQ.key ??
      q.id
  );
}

function getWorkspaceEntryCodeForPracticeBank(workspace: any) {
  if (
      !workspace ||
      typeof workspace !== "object" ||
      workspace.version !== 2 ||
      !Array.isArray(workspace.nodes)
  ) {
    return "";
  }

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const file =
      workspace.nodes.find((node: any) => node?.kind === "file" && node.id === entryId) ??
      workspace.nodes.find((node: any) => node?.kind === "file");

  return file?.kind === "file" ? String(file.content ?? "") : "";
}

function getRuntimePracticePatchForQuestion(q: Extract<ReviewQuestion, { kind: "practice" }>) {
  const stableKey = getStablePracticeQuestionKey(q);
  const exercises = useReviewRuntimeStore.getState().exercises ?? {};

  const found = Object.entries(exercises).find(([key, value]: any) => {
    if (!value) return false;

    return (
        key === stableKey ||
        key.endsWith(`:${stableKey}`) ||
        value.exerciseKey === stableKey ||
        value.exerciseId === stableKey
    );
  });

  if (!found) return null;

  const [, estate] = found as any;
  const workspace =
      estate.workspace ??
      estate.codeWorkspace ??
      estate.ideWorkspace ??
      null;

  const workspaceCode = getWorkspaceEntryCodeForPracticeBank(workspace);
  const code =
      workspaceCode ||
      (typeof estate.code === "string" ? estate.code : "");

  if (!code.trim()) return null;

  const stdin =
      typeof workspace?.stdin === "string"
          ? workspace.stdin
          : typeof estate.codeStdin === "string"
              ? estate.codeStdin
              : typeof estate.stdin === "string"
                  ? estate.stdin
                  : "";

  const lang =
      typeof workspace?.language === "string"
          ? workspace.language
          : typeof estate.codeLang === "string"
              ? estate.codeLang
              : typeof estate.lang === "string"
                  ? estate.lang
                  : typeof estate.language === "string"
                      ? estate.language
                      : "python";

  return {
    code,
    source: code,
    stdin,
    codeStdin: stdin,
    lang,
    language: lang,
    codeLang: lang,
    ...(workspace
        ? {
          workspace,
          codeWorkspace: workspace,
          ideWorkspace: workspace,
        }
        : {}),
  };
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

function getSavedPracticePatch(
    initialState: SavedQuizState | null,
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const stableKey = getStablePracticeQuestionKey(q);
  const byStableKey = initialState?.practiceItemPatch?.[stableKey] ?? null;
  const byQuestionId = initialState?.practiceItemPatch?.[q.id] ?? null;
  const selected = byStableKey ?? byQuestionId ?? null;

  exerciseDebug("B_useQuizPracticeBank_getSavedPracticePatch", {
    qid: q.id,
    stableKey,
    selectedFrom: byStableKey ? "stableKey" : byQuestionId ? "questionId" : "none",
    availablePatchKeys: Object.keys(initialState?.practiceItemPatch ?? {}),
    selected: summarizeExercisePatch(selected),
    byStableKey: summarizeExercisePatch(byStableKey),
    byQuestionId: summarizeExercisePatch(byQuestionId),
  });

  reviewDebug("6_RESTORE_READ useQuizPracticeBank.getSavedPracticePatch", {
    qid: q.id,
    stableKey,
    availablePatchKeys: Object.keys(initialState?.practiceItemPatch ?? {}),
    selectedFrom:
      byStableKey ? "stableKey" : byQuestionId ? "questionId" : "none",
    selectedSummary: summarizePracticePatch(selected),
    stableSummary: summarizePracticePatch(byStableKey),
    idSummary: summarizePracticePatch(byQuestionId),
  });

  return selected;
}

function getSavedPracticeMeta(
    initialState: SavedQuizState | null,
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const stableKey = getStablePracticeQuestionKey(q);

  return (
      initialState?.practiceMeta?.[stableKey] ??
      initialState?.practiceMeta?.[q.id] ??
      null
  );
}

function resolveQuestionByAnyId(
    questions: ReviewQuestion[],
    id: string,
): Extract<ReviewQuestion, { kind: "practice" }> | null {
  for (const q of questions) {
    if (q.kind !== "practice") continue;

    const stableKey = getStablePracticeQuestionKey(q);

    if (q.id === id || stableKey === id) {
      return q;
    }
  }

  return null;
}

function setPracticeForQuestion(
    prev: Record<string, PracticeState>,
    q: Extract<ReviewQuestion, { kind: "practice" }>,
    nextState: PracticeState,
) {
  const stableKey = getStablePracticeQuestionKey(q);

  if (q.id === stableKey) {
    return {
      ...prev,
      [stableKey]: nextState,
    };
  }

  return {
    ...prev,
    [stableKey]: nextState,
    [q.id]: nextState,
  };
}

function stablePracticeJson(value: any) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function mergeSavedPatchIntoPracticeItem(item: any, savedPatch: any) {
  if (!item || !savedPatch) return item;

  const workspace =
    savedPatch.workspace ??
    savedPatch.codeWorkspace ??
    savedPatch.ideWorkspace ??
    null;

  const next = {
    ...item,
    ...savedPatch,
    ...(workspace
      ? {
          workspace,
          codeWorkspace: workspace,
          ideWorkspace: workspace,
        }
      : {}),
  };

  return stablePracticeJson(next) === stablePracticeJson(item) ? item : next;
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

  const initialPracticePatchKey = useMemo(
      () => JSON.stringify(initialState?.practiceItemPatch ?? {}),
      [initialState?.practiceItemPatch],
  );

  const [practice, setPractice] = useState<Record<string, PracticeState>>({});
  const practiceRef = useRef(practice);

  const loadTokenRef = useRef<Record<string, number>>({});
  const loadCycleRef = useRef(0);

  const idToStableKeyRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const nextMap: Record<string, string> = {};

    for (const q of questions) {
      if (q.kind !== "practice") continue;

      const stableKey = getStablePracticeQuestionKey(q);
      nextMap[q.id] = stableKey;
      nextMap[stableKey] = stableKey;
    }

    idToStableKeyRef.current = nextMap;
  }, [questions]);

  useEffect(() => {
    practiceRef.current = practice;
  }, [practice]);

  const padRefs = useRef<Record<string, React.MutableRefObject<VectorPadState>>>(
      {},
  );

  function resolvePracticeKey(id: string) {
    return idToStableKeyRef.current[id] ?? id;
  }

  function getPadRef(id: string) {
    const key = resolvePracticeKey(id);

    if (!padRefs.current[key]) {
      padRefs.current[key] = { current: defaultVectorPadState() };
    }

    return padRefs.current[key];
  }

  useEffect(() => {
    loadCycleRef.current += 1;
    setPractice({});
    padRefs.current = {};
    loadTokenRef.current = {};
  }, [resetKey]);

  useEffect(() => {
    if (!initialState?.practiceItemPatch) return;

    setPractice((prev) => {
      let next = prev;
      let changed = false;

      for (const q of questions) {
        if (q.kind !== "practice") continue;

        const stableKey = getStablePracticeQuestionKey(q);
        const savedPatch =
          initialState.practiceItemPatch?.[stableKey] ??
          initialState.practiceItemPatch?.[q.id] ??
          null;

        if (!savedPatch) continue;

        const current = next[stableKey] ?? next[q.id];
        if (!current?.item) continue;

        const mergedItem = mergeSavedPatchIntoPracticeItem(
          current.item,
          savedPatch,
        );

        if (mergedItem === current.item) continue;

        const nextState: PracticeState = {
          ...current,
          item: mergedItem,
        };

        next = setPracticeForQuestion(next, q, nextState);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [initialPracticePatchKey, initialState, questions]);

  const loadPracticeQuestion = useCallback(
      async (
          q: Extract<ReviewQuestion, { kind: "practice" }>,
          opts?: { force?: boolean; cancelledRef?: { current: boolean } },
      ) => {
        const force = Boolean(opts?.force);
        const cancelledRef = opts?.cancelledRef;
        const cycle = loadCycleRef.current;
        const stableKey = getStablePracticeQuestionKey(q);

        const existing =
            practiceRef.current?.[stableKey] ?? practiceRef.current?.[q.id];

        const alreadyResolved = Boolean(existing?.exercise && existing?.item);



        if (!force && alreadyResolved) {
          const savedPatch = getSavedPracticePatch(initialState, q);

          if (savedPatch && existing?.item) {
            setPractice((prev) => {
              const current = prev[stableKey] ?? prev[q.id] ?? existing;
              const mergedItem = mergeSavedPatchIntoPracticeItem(
                current.item,
                savedPatch,
              );

              if (mergedItem === current.item) return prev;

              return setPracticeForQuestion(prev, q, {
                ...current,
                item: mergedItem,
              });
            });
          }

          return;
        }

        const token = (loadTokenRef.current[stableKey] ?? 0) + 1;
        loadTokenRef.current[stableKey] = token;

        const initMeta = getSavedPracticeMeta(initialState, q);
        const fallbackMax = unlimitedAttempts
            ? null
            : coerceMaxAttempts((q as any).maxAttempts ?? specMaxAttempts ?? null);

        setPractice((prev) => {
          const prevState = prev[stableKey] ?? prev[q.id];

          const nextState: PracticeState = {
            loading: true,
            error: null,
            busy: false,
            exercise: prevState?.exercise ?? null,
            item: prevState?.item ?? null,
            attempts: initMeta?.attempts ?? prevState?.attempts ?? 0,
            ok: initMeta?.ok ?? prevState?.ok ?? null,
            maxAttempts: prevState?.maxAttempts ?? fallbackMax,
            helpPolicy: prevState?.helpPolicy ?? DEFAULT_PRACTICE_HELP_POLICY,
          };

          return setPracticeForQuestion(prev, q, nextState);
        });

        try {
          exerciseDebug("C_useQuizPracticeBank_before_fetchResolvedPracticeItem", {
            qid: q.id,
            stableKey,
            force,
            alreadyResolved,
            fetch: (q as any).fetch,
            savedPatch: summarizeExercisePatch(getSavedPracticePatch(initialState, q)),
            existingItem: summarizeExercisePatch(existing?.item),
          });

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
                    getSavedPracticePatch(initialState, q),
                    "drag_reorder",
                ),
                transformItem: (baseItem, resolvedEx) => {
                  /**
                   * IMPORTANT:
                   * Do not carry editor code/workspace from the previous practice
                   * exercise into this one.
                   *
                   * Correct rule:
                   * - no saved edit for this exercise -> use this exercise starter
                   * - saved edit for this exercise -> use this exercise saved patch
                   *
                   * The previous carryFromPrev logic made Exercise B inherit
                   * Exercise A's edited workspace whenever B had no current patch,
                   * causing code leakage between exercises.
                   */
                  return baseItem;
                },
              }),
              LOAD_TIMEOUT_MS,
              "Exercise took too long to load. Please retry.",
          );

          reviewDebug("7_RESTORE_LOADED useQuizPracticeBank.loadPracticeQuestion", {
            qid: q.id,
            stableKey,
            loadedItem: summarizePracticePatch(loaded.item),
            savedPatch: summarizePracticePatch(getSavedPracticePatch(initialState, q)),
          });

          if (cancelledRef?.current) return;
          if (loadCycleRef.current !== cycle) return;
          if (loadTokenRef.current[stableKey] !== token) return;

          setPractice((prev) => {
            const base = prev[stableKey] ?? prev[q.id];
            if (!base) return prev;

            const meta = getSavedPracticeMeta(initialState, q);

            const savedPatch = getSavedPracticePatch(initialState, q);
            const nextItem = mergeSavedPatchIntoPracticeItem(
                loaded.item,
                savedPatch,
            );

            const nextState: PracticeState = {
              ...base,
              loading: false,
              error: null,
              exercise: loaded.exercise,
              item: nextItem,
              attempts: meta?.attempts ?? base.attempts ?? 0,
              ok: meta?.ok ?? base.ok ?? null,
              maxAttempts: loaded.maxAttempts ?? base.maxAttempts ?? null,
              helpPolicy:
                  loaded.helpPolicy ??
                  base.helpPolicy ??
                  DEFAULT_PRACTICE_HELP_POLICY,
            };

            exerciseDebug("D_useQuizPracticeBank_setPractice_loaded", {
              qid: q.id,
              stableKey,
              selectedKeyWillWrite: stableKey,
              alsoWritesQId: q.id !== stableKey,
              exerciseKind: loaded.exercise?.kind,
              loadedItem: summarizeExercisePatch(loaded.item),
              savedPatchAtSet: summarizeExercisePatch(savedPatch),
              previousItem: summarizeExercisePatch(base.item),
              nextItem: summarizeExercisePatch(nextState.item),
            });

            return setPracticeForQuestion(prev, q, nextState);
          });
        } catch (e: any) {
          if (cancelledRef?.current) return;
          if (loadCycleRef.current !== cycle) return;
          if (loadTokenRef.current[stableKey] !== token) return;

          setPractice((prev) => {
            const current = prev[stableKey] ?? prev[q.id];
            if (!current) return prev;

            const nextState: PracticeState = {
              ...current,
              loading: false,
              busy: false,
              error: e?.message ?? "Failed to load practice exercise.",
            };

            exerciseDebug("D_useQuizPracticeBank_setPractice_error", {
              qid: q.id,
              stableKey,
              error: e?.message ?? "Failed to load practice exercise.",
              currentItem: summarizeExercisePatch(current.item),
              nextItem: summarizeExercisePatch(nextState.item),
            });

            return setPracticeForQuestion(prev, q, nextState);
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
      async (id: string) => {
        const q = resolveQuestionByAnyId(questions, id);
        if (!q) return;

        await loadPracticeQuestion(q, { force: true });
      },
      [questions, loadPracticeQuestion],
  );

  const updatePracticeItem = useCallback(
      (id: string, patch: Partial<QItem>) => {
        const q = resolveQuestionByAnyId(questions, id);
        const key = q ? getStablePracticeQuestionKey(q) : resolvePracticeKey(id);

        const pr = padRefs.current[key];

        if (pr?.current) {
          if ((patch as any).dragA) {
            pr.current.a = cloneVec((patch as any).dragA) as any;
          }

          if ((patch as any).dragB) {
            pr.current.b = cloneVec((patch as any).dragB) as any;
          }
        }

        setPractice((prev) => {
          const ps = prev[key] ?? prev[id];
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

          const nextState: PracticeState = {
            ...ps,
            item: nextItem,
            ok: isReset ? null : ps.ok,
          };

          if (q) {
            return setPracticeForQuestion(prev, q, nextState);
          }

          return {
            ...prev,
            [key]: nextState,
          };
        });
      },
      [questions],
  );

  const submitPractice = useCallback(
      async (q: Extract<ReviewQuestion, { kind: "practice" }>) => {
        if (isCompleted || locked) return;

        const key = getStablePracticeQuestionKey(q);
        const ps = practice[key] ?? practice[q.id];

        if (!ps || ps.loading || ps.busy || !ps.item || !ps.exercise) return;

        const attemptsCapped =
            !unlimitedAttempts &&
            ps.maxAttempts != null &&
            ps.attempts >= ps.maxAttempts;

        if (attemptsCapped) return;
        if (ps.ok === true) return;

        setPractice((prev) => {
          const current = prev[key] ?? prev[q.id];
          if (!current) return prev;

          return setPracticeForQuestion(prev, q, {
            ...current,
            busy: true,
            error: null,
          });
        });

        try {
          const runtimePatch = getRuntimePracticePatchForQuestion(q);
          const itemForSubmit = runtimePatch
              ? {
                ...ps.item,
                ...runtimePatch,
              }
              : ps.item;

          const submitted = await submitPracticeItem({
            item: itemForSubmit,
            exercise: ps.exercise,
            padRef: getPadRef(key),
            maxAttempts: ps.maxAttempts,
            isLockedRun: !unlimitedAttempts && ps.maxAttempts != null,
          });

          emitSfx(submitted.ok ? "answer:correct" : "answer:wrong");

          const gamification = (submitted.data as any)?.gamification ?? null;

          if (gamification?.summary) {
            emitGamificationUpdate({
              source: "validate",
              xpGained: gamification.xpGained ?? 0,
              leveledUp: Boolean(gamification.leveledUp),
              streakExtended: Boolean(gamification.streakExtended),
              summary: gamification.summary,
            });
          }

          setPractice((prev) => {
            const current = prev[key] ?? prev[q.id];
            if (!current?.item) return prev;

            const nextAttempts = submitted.used;

            const nextState: PracticeState = {
              ...current,
              busy: false,
              attempts: nextAttempts,
              ok: submitted.ok,
              maxAttempts: submitted.serverMaxAttempts ?? current.maxAttempts ?? null,
              item: {
                ...current.item,
                ...(runtimePatch ?? {}),
                ...(submitted.statePatch ?? {}),
                result: submitted.data as any,
                submitted: true,
                attempts: nextAttempts,
              } as any,
            };

            return setPracticeForQuestion(prev, q, nextState);
          });
        } catch (e: any) {
          setPractice((prev) => {
            const current = prev[key] ?? prev[q.id];
            if (!current) return prev;

            const nextState: PracticeState = {
              ...current,
              busy: false,
              error: e?.message ?? "Submit failed.",
            };

            return setPracticeForQuestion(prev, q, nextState);
          });
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

        const key = getStablePracticeQuestionKey(q);
        const ps = practice[key] ?? practice[q.id];

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
          setPractice((prev) => {
            const current = prev[key] ?? prev[q.id];
            if (!current?.item) return prev;

            const nextState: PracticeState = {
              ...current,
              item: {
                ...current.item,
                help: {
                  ...current.item.help,
                  activeStepKey: stepKey,
                  error: null,
                },
              },
            };

            return setPracticeForQuestion(prev, q, nextState);
          });

          return;
        }

        setPractice((prev) => {
          const current = prev[key] ?? prev[q.id];
          if (!current?.item) return prev;

          const nextState: PracticeState = {
            ...current,
            busy: true,
            error: null,
            item: {
              ...current.item,
              help: {
                ...current.item.help,
                busyStepKey: stepKey,
                error: null,
              },
            },
          };

          return setPracticeForQuestion(prev, q, nextState);
        });

        try {
          const opened = await requestPracticeHelpItem({
            item: ps.item,
            exercise: ps.exercise,
            stepKey,
            padRef: getPadRef(key),
          });

          if (opened.dragA || opened.dragB) {
            const pr = getPadRef(key);

            if (pr.current) {
              if (opened.dragA) pr.current.a = cloneVec(opened.dragA) as any;
              if (opened.dragB) pr.current.b = cloneVec(opened.dragB) as any;
            }
          }

          setPractice((prev) => {
            const current = prev[key] ?? prev[q.id];
            if (!current?.item) return prev;

            const prevHelp = current.item.help;
            const openedKeys = prevHelp.openedStepKeys.includes(stepKey)
                ? prevHelp.openedStepKeys
                : [...prevHelp.openedStepKeys, stepKey];

            const nextState: PracticeState = {
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
            };

            return setPracticeForQuestion(prev, q, nextState);
          });
        } catch (e: any) {
          setPractice((prev) => {
            const current = prev[key] ?? prev[q.id];
            if (!current) return prev;

            const nextState: PracticeState = {
              ...current,
              busy: false,
              error: e?.message ?? "Help failed.",
              item: current.item
                  ? {
                    ...current.item,
                    help: {
                      ...current.item.help,
                      busyStepKey: null,
                      error: e?.message ?? "Help failed.",
                    },
                  }
                  : current.item,
            };

            return setPracticeForQuestion(prev, q, nextState);
          });
        }
      },
      [practice, isCompleted, locked],
  );

  function isPracticeChecked(q: Extract<ReviewQuestion, { kind: "practice" }>) {
    const key = getStablePracticeQuestionKey(q);
    const ps = practice[key] ?? practice[q.id];

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