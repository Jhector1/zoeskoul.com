"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import type { ReviewQuestion, ReviewQuizSpec } from "@/lib/subjects/types";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";
import { buildReviewQuizKey } from "@/lib/subjects/quizClient";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

import { useQuizLocalAnswers } from "./quiz/hooks/useQuizLocalAnswers";
import { useQuizPracticeBank } from "./quiz/hooks/useQuizPracticeBank";
import { useDebouncedEmit } from "./quiz/hooks/useDebouncedEmit";
import { useReviewQuizQuestions } from "./quiz/hooks/useReviewQuizQuestions";

import QuizPracticeCard from "./quiz/components/QuizPracticeCard";
import QuizLocalCard from "./quiz/components/QuizLocalCard";
import QuizFooter from "./quiz/components/QuizFooter";
import { emitSfx } from "@/lib/sfx/bus";
import { QuizBlockSkeleton } from "@/components/review/quiz/components/QuizBlockSkeleton";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { reviewDebug, summarizePracticePatch } from "@/components/review/module/runtime/reviewDebug";
import { exerciseDebug, summarizeExercisePatch } from "@/components/review/module/runtime/exerciseDebug";
import { deriveEntryCode, isWorkspace } from "@/components/review/module/runtime/exerciseWorkspaceResolver";

import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";
import { useTaggedT } from "@/i18n/tagged";
import FlowNavigator, {
  type FlowNavMode,
} from "@/components/review/navigation/FlowNavigator";
import {
    computeReviewQuizCompletionSummary,
    shouldAutoCompleteReviewCard
} from "@/components/review/quiz/reviewQuizCompletion";

const LS_AUTO_ADV = "learnoir.quiz.autoAdvance";

function readAutoAdvance(defaultVal = true) {
  try {
    const v = window.localStorage.getItem(LS_AUTO_ADV);
    if (v == null) return defaultVal;
    return v === "1" || v === "true";
  } catch {
    return defaultVal;
  }
}

function computeLocalOkNow(
    q: Exclude<ReviewQuestion, { kind: "practice" }>,
    val: any,
) {
  if (q.kind === "mcq") return val === q.answerId;

  const v = Number(val);
  if (!Number.isFinite(v)) return false;
  const tol = q.tolerance ?? 0;
  return Math.abs(v - q.answer) <= tol;
}
function serializePracticeItemForSave(item: any, exercise: any) {
  const { key, kind, ui, ...rest } = item ?? {};

  if (exercise?.kind === "drag_reorder" && !ui?.reorderTouched) {
    delete rest.reorder;
    delete rest.reorderIds;
  }

  return rest;
}

function getStablePracticeQuestionKey(q: ReviewQuestion) {
  if (q.kind !== "practice") return q.id;

  const anyQ = q as any;
  return (
      anyQ.fetch?.exerciseKey ??
      anyQ.exerciseKey ??
      anyQ.item?.exerciseKey ??
      anyQ.exercise?.exerciseKey ??
      anyQ.exercise?.id ??
      anyQ.fetch?.stepId ??
      anyQ.item?.id ??
      anyQ.stepId ??
      anyQ.sourceStepId ??
      anyQ.key ??
      q.id
  );
}


function getRuntimePracticePatchForQuestion(q: ReviewQuestion) {
  if (q.kind !== "practice") return null;

  const stablePracticeKey = getStablePracticeQuestionKey(q);
  const runtime = useReviewRuntimeStore.getState();
  const exercises = runtime.exercises ?? {};

  const qAny = q as any;

  const wantedIds = new Set(
      [
        stablePracticeKey,
        q.id,
        qAny.fetch?.exerciseKey,
        qAny.fetch?.stepId,
        qAny.exerciseKey,
        qAny.stepId,
        qAny.item?.id,
        qAny.item?.exerciseKey,
        qAny.exercise?.id,
        qAny.exercise?.exerciseKey,
      ]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean),
  );

  const activeExerciseKey = String(runtime.activeExerciseKey ?? "").trim();
  const boundExerciseKey = String(runtime.tool?.boundExerciseKey ?? "").trim();

  const candidates = Object.entries(exercises)
      .map(([key, value]: any) => {
        if (!value) return null;

        const valueExerciseKey = String(value.exerciseKey ?? "").trim();
        const valueExerciseId = String(value.exerciseId ?? "").trim();

        let score = 0;

        if (activeExerciseKey && key === activeExerciseKey) score += 3000;
        if (boundExerciseKey && key === boundExerciseKey) score += 3000;
        if (activeExerciseKey && valueExerciseKey === activeExerciseKey) score += 2500;
        if (boundExerciseKey && valueExerciseKey === boundExerciseKey) score += 2500;

        for (const wantedId of wantedIds) {
          if (key === wantedId) score += 1200;
          if (valueExerciseKey === wantedId) score += 1100;
          if (valueExerciseId === wantedId) score += 1000;

          if (key.endsWith(`:${wantedId}`)) score += 800;
          if (valueExerciseKey.endsWith(`:${wantedId}`)) score += 750;
        }

        if (score <= 0) return null;

        const updatedAt = Number(value.updatedAt ?? 0);

        return {
          key,
          value,
          score,
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.updatedAt - a.updatedAt;
      });

  const found = candidates[0];
  if (!found) return null;

  const estate = found.value;

  const workspace =
      isWorkspace((estate as any).workspace)
          ? (estate as any).workspace
          : isWorkspace((estate as any).codeWorkspace)
              ? (estate as any).codeWorkspace
              : isWorkspace((estate as any).ideWorkspace)
                  ? (estate as any).ideWorkspace
                  : null;

  const workspaceCode = deriveEntryCode(workspace);

  const code =
      workspaceCode ||
      (typeof (estate as any).code === "string"
          ? (estate as any).code
          : typeof (estate as any).source === "string"
              ? (estate as any).source
              : "");

  const stdin =
      typeof workspace?.stdin === "string"
          ? workspace.stdin
          : typeof (estate as any).codeStdin === "string"
              ? (estate as any).codeStdin
              : typeof (estate as any).stdin === "string"
                  ? (estate as any).stdin
                  : "";

  const lang =
      typeof workspace?.language === "string"
          ? workspace.language
          : typeof (estate as any).codeLang === "string"
              ? (estate as any).codeLang
              : typeof (estate as any).lang === "string"
                  ? (estate as any).lang
                  : typeof (estate as any).language === "string"
                      ? (estate as any).language
                      : "python";

  return {
    exerciseKey: (estate as any).exerciseKey,
    exerciseId: (estate as any).exerciseId,
    subjectSlug: (estate as any).subjectSlug,
    moduleSlug: (estate as any).moduleSlug,
    sectionSlug: (estate as any).sectionSlug,
    topicId: (estate as any).topicId,
    cardId: (estate as any).cardId,
    code,
    source: code,
    codeLang: lang,
    lang,
    language: lang,
    stdin,
    codeStdin: stdin,
    userEdited:
        (estate as any).userEdited === true ||
        (estate as any).workspaceOrigin === "user" ||
        (estate as any).workspaceOrigin === "saved",
    workspaceOrigin:
        (estate as any).workspaceOrigin ??
        ((estate as any).userEdited === true ? "user" : "saved"),
    starterHash: (estate as any).starterHash,
    updatedAt: (estate as any).updatedAt ?? Date.now(),
    ...(workspace
        ? {
          workspace,
          codeWorkspace: workspace,
          ideWorkspace: workspace,
        }
        : {}),
  };
}




export default function QuizBlock({
                                    prereqsMet = true,
                                    quizId,
                                    spec,
                                    quizKey,
                                    navigationMode = "scroll",
                                    passScore,
                                    onPass,
                                    sequential = true,
                                    unlimitedAttempts = true,
                                    initialState,
                                    onStateChange,
                                    isCompleted = false,
                                    quizCardId,
                                    locked = false,
                                    strictSequential = false,
                                    onReset,
                                    orderBase = 0,
                                    toolsActive = true,
                                  }: {
  prereqsMet?: boolean;
  quizId: string;
  spec: ReviewQuizSpec;
  quizKey?: string;
  navigationMode?: FlowNavMode;
  passScore: number;
  onPass: () => void;
  sequential?: boolean;
  unlimitedAttempts?: boolean;

  initialState?: SavedQuizState | null;
  onStateChange?: (s: SavedQuizState) => void;

  isCompleted?: boolean;
  quizCardId?: string;
  locked?: boolean;
  strictSequential?: boolean;

  onReset?: () => void;
  orderBase?: number;
  toolsActive?: boolean;
}) {
  const initState = initialState ?? null;

  const stableQuizKeyRef = useRef<string>("");
  if (!stableQuizKeyRef.current) {
    stableQuizKeyRef.current = quizKey?.trim()
        ? quizKey.trim()
        : buildReviewQuizKey(spec, quizCardId ?? quizId, 0);
  }
  const stableKey = stableQuizKeyRef.current;

  const [reloadNonce, setReloadNonce] = useState(0);
  const resetKey = `${stableKey}:${reloadNonce}`;

  const { quizLoading, quizError, questions, serverQuizKey } =
      useReviewQuizQuestions({
        quizId,
        spec,
        stableQuizKey: stableKey,
        reloadNonce,
      });

  const [excusedById, setExcusedById] = useState<Record<string, boolean>>({});
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmResetQuiz, setConfirmResetQuiz] = useState(false);
  const [awaitNextQid, setAwaitNextQid] = useState<string | null>(null);
  const [pendingScrollQid, setPendingScrollQid] = useState<string | null>(null);
  const [pendingScrollMode, setPendingScrollMode] = useState<"explain" | "end">(
      "end",
  );
  const activeRuntimeExerciseKey = useReviewRuntimeStore((s) => s.activeExerciseKey);

  const onPassRef = useRef(onPass);
  const autoKeyRef = useRef<string>("");
  const restoreQuestionKeyRef = useRef<string>("");
  const lastActionQidRef = useRef<string | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const qElRef = useRef(new Map<string, HTMLDivElement | null>());
  const footerElRef = useRef<HTMLDivElement | null>(null);
  const endAnchorRef = useRef(new Map<string, HTMLDivElement | null>());
  const explainRef = useRef(new Map<string, HTMLDivElement | null>());

  const routeExerciseIndex = useMemo(() => {
    if (!activeRuntimeExerciseKey) return -1;

    return questions.findIndex((q) => {
      if (q.kind !== "practice") return false;
      const stablePracticeKey = getStablePracticeQuestionKey(q);
      return (
          activeRuntimeExerciseKey === stablePracticeKey ||
          activeRuntimeExerciseKey.endsWith(`:${stablePracticeKey}`)
      );
    });
  }, [activeRuntimeExerciseKey, questions]);

  useEffect(() => {
    onPassRef.current = onPass;
  }, [onPass]);

  useEffect(() => {
    setExcusedById(initState?.excusedById ?? {});
  }, [resetKey, initState?.excusedById]);

  const isExcused = useCallback(
      (qid: string) => Boolean(excusedById[qid]),
      [excusedById],
  );

  const local = useQuizLocalAnswers();

  const practiceBank = useQuizPracticeBank({
    questions,
    spec,
    unlimitedAttempts,
    initialState: initState,
    resetKey,
    isCompleted,
    locked,
  });

  useEffect(() => {
    local.hydrate(initState);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function getPracticeStateForQuestion(q: ReviewQuestion) {
    if (q.kind !== "practice") return null;

    const stablePracticeKey = getStablePracticeQuestionKey(q);
    return practiceBank.practice[stablePracticeKey] ?? practiceBank.practice[q.id] ?? null;
  }
    function isFlowDone(q: ReviewQuestion): boolean {
        if (isExcused(q.id)) return true;

        if (q.kind === "practice") {
            const ps = getPracticeStateForQuestion(q);

            const itemResult = (ps?.item as any)?.result;
            const resultOk = itemResult?.ok === true;

            /**
             * Keep this in sync with QuizPracticeCard.
             * The card may show "Correct" from ps.item.result.ok before ps.ok
             * has been promoted into the saved practice state.
             */
            const isCorrect = ps?.ok === true || resultOk;

            if (isCorrect) return true;

            const maxA = ps?.maxAttempts;
            const outOfAttempts =
                !!ps &&
                !unlimitedAttempts &&
                typeof maxA === "number" &&
                Number.isFinite(maxA) &&
                ps.attempts >= maxA;

            if (!strictSequential && outOfAttempts) return true;
            return false;
        }

        return getQuestionOk(q) === true;
    }
    function getQuestionOk(q: ReviewQuestion): boolean | null {
        if (q.kind === "mcq") {
            if (!local.checkedById[q.id]) return null;
            return local.answers[q.id] === q.answerId;
        }

        if (q.kind === "numeric") {
            if (!local.checkedById[q.id]) return null;

            const v = Number(local.answers[q.id]);
            if (!Number.isFinite(v)) return false;

            const tol = q.tolerance ?? 0;
            return Math.abs(v - q.answer) <= tol;
        }

        if (q.kind === "practice") {
            const ps = getPracticeStateForQuestion(q);
            if (!ps) return null;

            const itemResult = (ps.item as any)?.result;

            if (typeof itemResult?.ok === "boolean") {
                return itemResult.ok;
            }

            if (typeof ps.ok === "boolean") {
                return ps.ok;
            }

            return null;
        }

        return null;
    }
  function isQuestionChecked(q: ReviewQuestion): boolean {
    if (isExcused(q.id)) return true;
    if (q.kind === "practice") return practiceBank.isPracticeChecked(q);
    return Boolean(local.checkedById[q.id]);
  }
    function isUnlocked(index: number): boolean {
        if (!prereqsMet) return false;

        /**
         * Once the quiz/exercise set is completed, unlock navigation.
         * This prevents users from getting trapped when they go back to
         * a previously checked but incorrect exercise.
         */
        if (isCompleted) return true;

        if (!sequential) return true;
        if (index === 0) return true;

        for (let i = 0; i < index; i++) {
            const prev = questions[i];
            if (!prev) return false;
            if (!isFlowDone(prev)) return false;
        }

        return true;
    }
  // function isUnlocked(index: number): boolean {
  //   if (!prereqsMet) return false;
  //
  //   const current = questions[index];
  //
  //   /**
  //    * Practice/code exercises should behave like sketch cards:
  //    * each visible exercise can be opened, edited, checked, and navigated
  //    * independently.
  //    *
  //    * Sequential gating is still kept for non-practice quiz questions.
  //    */
  //   if (current?.kind === "practice") return true;
  //
  //   if (!sequential) return true;
  //   if (index === 0) return true;
  //
  //   const prev = questions[index - 1];
  //   if (isExcused(prev.id)) return true;
  //
  //   const ok = getQuestionOk(prev) === true;
  //
  //   if (!ok) {
  //     if (strictSequential) return false;
  //
  //     if (prev.kind === "practice") {
  //       const ps = getPracticeStateForQuestion(prev);
  //       const maxA = ps?.maxAttempts;
  //       const attemptsCapped =
  //           !!ps &&
  //           !unlimitedAttempts &&
  //           typeof maxA === "number" &&
  //           Number.isFinite(maxA) &&
  //           ps.attempts >= maxA;
  //       if (attemptsCapped) return true;
  //     }
  //   }
  //   return ok;
  // }

    const summary = useMemo(() => {
        return computeReviewQuizCompletionSummary({
            passScore,
            requireAllCorrect: true,
            questions: questions.map((q) => ({
                id: q.id,
                checked: isQuestionChecked(q),
                ok: getQuestionOk(q),
                excused: isExcused(q.id),
            })),
        });
    }, [
        questions,
        local.checkedById,
        local.answers,
        practiceBank.practice,
        passScore,
        excusedById,
    ]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (
            !shouldAutoCompleteReviewCard({
                prereqsMet,
                locked,
                isCompleted,
                summary,
            })
        ) {
            return;
        }

        if (autoKeyRef.current === resetKey) return;
        autoKeyRef.current = resetKey;

        onPassRef.current();
    }, [prereqsMet, locked, isCompleted, summary.passed, resetKey]);

  const nextState = useMemo<SavedQuizState>(() => {
    const base = initState;

    const practiceItemPatch: Record<string, any> = {
      ...(base?.practiceItemPatch ?? {}),
    };
    const practiceMeta: Record<string, any> = { ...(base?.practiceMeta ?? {}) };

    for (const q of questions) {
      if (q.kind !== "practice") continue;

      const stablePracticeKey = getStablePracticeQuestionKey(q);
      const ps = practiceBank.practice[stablePracticeKey] ?? practiceBank.practice[q.id];

      if (ps) {
          const itemResultOk =
              typeof (ps.item as any)?.result?.ok === "boolean"
                  ? Boolean((ps.item as any).result.ok)
                  : null;

          const nextMeta = {
              attempts:
                  ps.attempts ??
                  practiceMeta[stablePracticeKey]?.attempts ??
                  practiceMeta[q.id]?.attempts ??
                  0,
              ok:
                  itemResultOk ??
                  ps.ok ??
                  practiceMeta[stablePracticeKey]?.ok ??
                  practiceMeta[q.id]?.ok ??
                  null,
          };

        practiceMeta[stablePracticeKey] = nextMeta;

        // Backward compatibility for older saved states that still read by q.id.
        if (stablePracticeKey !== q.id) {
          practiceMeta[q.id] = nextMeta;
        }
      }

      if (ps?.item) {
        const serialized = serializePracticeItemForSave(ps.item, ps.exercise);
        const runtimePatch = getRuntimePracticePatchForQuestion(q);
        const mergedSerialized = runtimePatch
            ? {
              ...serialized,
              ...runtimePatch,
              workspace:
                  runtimePatch.workspace ??
                  serialized.workspace ??
                  serialized.codeWorkspace ??
                  serialized.ideWorkspace,
              codeWorkspace:
                  runtimePatch.codeWorkspace ??
                  runtimePatch.workspace ??
                  serialized.codeWorkspace ??
                  serialized.workspace,
              ideWorkspace:
                  runtimePatch.ideWorkspace ??
                  runtimePatch.workspace ??
                  serialized.ideWorkspace ??
                  serialized.workspace,
              code:
                  typeof runtimePatch.code === "string"
                      ? runtimePatch.code
                      : serialized.code,
              codeStdin:
                  typeof runtimePatch.codeStdin === "string"
                      ? runtimePatch.codeStdin
                      : serialized.codeStdin,
              stdin:
                  typeof runtimePatch.stdin === "string"
                      ? runtimePatch.stdin
                      : serialized.stdin,
              lang:
                  runtimePatch.lang ??
                  runtimePatch.codeLang ??
                  serialized.lang,
              codeLang:
                  runtimePatch.codeLang ??
                  runtimePatch.lang ??
                  serialized.codeLang,
            }
            : serialized;

        exerciseDebug("I_QuizBlock_emit_practiceItemPatch", {
          qid: q.id,
          stablePracticeKey,
          serialized: summarizeExercisePatch(serialized),
          runtimePatch: summarizeExercisePatch(runtimePatch),
          merged: summarizeExercisePatch(mergedSerialized),
        });

        reviewDebug("8_QUIZBLOCK_EMIT QuizBlock.nextState.practiceItemPatch", {
          qid: q.id,
          stablePracticeKey,
          serializedSummary: summarizePracticePatch(serialized),
          runtimePatchSummary: summarizePracticePatch(runtimePatch),
          mergedSummary: summarizePracticePatch(mergedSerialized),
        });

        practiceItemPatch[stablePracticeKey] = mergedSerialized;

        // Backward compatibility for older saved states that still read by q.id.
        if (stablePracticeKey !== q.id) {
          practiceItemPatch[q.id] = mergedSerialized;
        }
      } else {
        /**
         * Important:
         * During fast card/sketch navigation, React may unmount before
         * practiceBank.practice has the newest ps.item, but Zustand already
         * has the editor workspace. Persist it anyway.
         */
        const runtimePatch = getRuntimePracticePatchForQuestion(q);

        if (runtimePatch) {
          practiceItemPatch[stablePracticeKey] = {
            ...(practiceItemPatch[stablePracticeKey] ?? {}),
            ...runtimePatch,
          };

          if (stablePracticeKey !== q.id) {
            practiceItemPatch[q.id] = {
              ...(practiceItemPatch[q.id] ?? {}),
              ...runtimePatch,
            };
          }
        }
      }
    }

    return {
      answers: local.answers,
      checkedById: local.checkedById,
      practiceItemPatch,
      practiceMeta,
      excusedById,
    };
  }, [
    questions,
    local.answers,
    local.checkedById,
    practiceBank.practice,
    initState,
    excusedById,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAutoAdvance(readAutoAdvance(true));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_AUTO_ADV, autoAdvance ? "1" : "0");
    } catch {}
  }, [autoAdvance]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(Boolean(mq.matches));
    apply();

    if (mq.addEventListener) mq.addEventListener("change", apply);
    else (mq as any).addListener?.(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else (mq as any).removeListener?.(apply);
    };
  }, []);

  function setQuestionEl(qid: string) {
    return (el: HTMLDivElement | null) => {
      qElRef.current.set(qid, el);
    };
  }

  const setEndAnchor = useCallback(
      (qid: string) => (el: HTMLDivElement | null) => {
        endAnchorRef.current.set(qid, el);
      },
      [],
  );

  const setExplainEl = useCallback(
      (qid: string) => (el: HTMLDivElement | null) => {
        explainRef.current.set(qid, el);
      },
      [],
  );

  const findCurrentActivityQuestionId = useCallback(() => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!isUnlocked(i)) break;
      if (!isFlowDone(q)) return q.id;
    }

    return questions[questions.length - 1]?.id ?? null;
  }, [
    questions,
    local.checkedById,
    local.answers,
    practiceBank.practice,
    excusedById,
    strictSequential,
    unlimitedAttempts,
    prereqsMet,
    locked,
    isCompleted,
  ]);

  const findCurrentActivityQuestionIndex = useCallback(() => {
    const qid = findCurrentActivityQuestionId();
    if (!qid) return 0;
    const idx = questions.findIndex((q) => q.id === qid);
    return idx < 0 ? 0 : idx;
  }, [findCurrentActivityQuestionId, questions]);

  useEffect(() => {
    setAwaitNextQid(null);
  }, [resetKey]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  function scheduleScroll(qid: string, mode: "explain" | "end") {
    setPendingScrollMode(mode);
    setPendingScrollQid(qid);
  }

  function focusPrimaryActionForQuestion(qid: string) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = qElRef.current.get(qid);
        if (!root) return;

        const target =
            root.querySelector<HTMLElement>(
                "[data-flow-focus]:not([disabled])",
            ) ??
            root.querySelector<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
            );

        target?.focus({ preventScroll: true } as any);
      });
    });
  }

  useEffect(() => {
    if (!pendingScrollQid) return;

    requestAnimationFrame(() => {
      const qid = pendingScrollQid;

      const explainEl =
          pendingScrollMode === "explain" ? explainRef.current.get(qid) : null;
      const endEl = endAnchorRef.current.get(qid);
      const root = qElRef.current.get(qid);

      const target = explainEl ?? endEl ?? root;
      if (!target) {
        setPendingScrollQid(null);
        return;
      }

      scrollIntoViewSmart(target, {
        reduceMotion,
        block: explainEl ? "start" : "end",
        force: true,
        offsetPx: 12,
        focus: false,
      });

      setPendingScrollQid(null);
    });
  }, [pendingScrollQid, pendingScrollMode, reduceMotion]);

  useEffect(() => {
    if (quizLoading) return;
    if (!questions.length) return;

    const restoreKey = `${resetKey}:restore`;
    if (restoreQuestionKeyRef.current === restoreKey) return;

    if (navigationMode === "slideshow") {
      restoreQuestionKeyRef.current = restoreKey;
      setActiveIndex(findCurrentActivityQuestionIndex());
      return;
    }

    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 12;

    const tryRestore = () => {
      if (cancelled) return;

      const qid = findCurrentActivityQuestionId();
      if (!qid) {
        restoreQuestionKeyRef.current = restoreKey;
        scrollToFooter();
        return;
      }

      const el = qElRef.current.get(qid);

      if (!el) {
        if (tries < MAX_TRIES) {
          tries += 1;
          requestAnimationFrame(() => {
            requestAnimationFrame(tryRestore);
          });
        }
        return;
      }

      restoreQuestionKeyRef.current = restoreKey;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;

          scrollIntoViewSmart(el, {
            reduceMotion,
            block: "start",
            force: true,
            offsetPx: 12,
            focus: false,
          });
        });
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryRestore);
    });

    return () => {
      cancelled = true;
    };
  }, [
    quizLoading,
    questions,
    resetKey,
    findCurrentActivityQuestionId,
    findCurrentActivityQuestionIndex,
    reduceMotion,
    navigationMode,
  ]);

  useEffect(() => {
    if (routeExerciseIndex < 0) return;
    setActiveIndex((prev) => (prev === routeExerciseIndex ? prev : routeExerciseIndex));
  }, [routeExerciseIndex]);

  function scrollToFooter() {
    const el = footerElRef.current;
    if (!el) return;
    scrollIntoViewSmart(el, {
      reduceMotion,
      block: "start",
      force: true,
      offsetPx: 12,
    });
  }

  function findNextUnlockedIndex(fromIdx: number) {
    for (let i = fromIdx + 1; i < questions.length; i++) {
      if (isUnlocked(i)) return i;
    }
    return -1;
  }

  function advanceFrom(qid: string) {
    const idx = questions.findIndex((qq) => qq.id === qid);
    if (idx < 0) return;

    const nextIdx = findNextUnlockedIndex(idx);
    if (nextIdx < 0) {
      scrollToFooter();
      return;
    }

    const nextQ = questions[nextIdx];

    if (navigationMode === "slideshow") {
      setActiveIndex(nextIdx);
      focusPrimaryActionForQuestion(nextQ.id);
      return;
    }

    const el = qElRef.current.get(nextQ.id);
    if (el) {
      scrollIntoViewSmart(el, {
        reduceMotion,
        block: "start",
        force: true,
        offsetPx: 12,
        focus: true,
      });
    }
  }



  function hasExplain(q: ReviewQuestion) {
    const ex = (q as any).explain;
    return typeof ex === "string" && ex.trim().length > 0;
  }

  useEffect(() => {
    if (!prereqsMet || locked || isCompleted) return;

    const qid = lastActionQidRef.current;
    if (!qid) return;

    const q = questions.find((x) => x.id === qid);
    if (!q) return;

    if (!isFlowDone(q)) return;

    if (hasExplain(q) || !autoAdvance) {
      setAwaitNextQid(qid);
      lastActionQidRef.current = null;
      return;
    }

    const delay = 150;

    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceFrom(qid);
      lastActionQidRef.current = null;
      advanceTimerRef.current = null;
    }, delay);
  }, [
    prereqsMet,
    locked,
    isCompleted,
    questions,
    local.checkedById,
    local.answers,
    practiceBank.practice,
    excusedById,
    strictSequential,
    unlimitedAttempts,
    autoAdvance,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const emitState = useCallback(
      (s: SavedQuizState) => onStateChange?.(s),
      [onStateChange],
  );
  const ui = useTaggedT("reviewQuizUi");
  const emitter = useDebouncedEmit(nextState, emitState, {
    delayMs: 400,
    enabled: Boolean(onStateChange && questions.length),
  });

  const emitterFlushRef = useRef<() => void>(() => {});

  useEffect(() => {
    emitterFlushRef.current = () => emitter.flush();
  }, [emitter.flush]);

  useLayoutEffect(() => {
    emitter.prime({
      answers: initState?.answers ?? {},
      checkedById: initState?.checkedById ?? {},
      practiceItemPatch: initState?.practiceItemPatch ?? {},
      practiceMeta: initState?.practiceMeta ?? {},
      excusedById: initState?.excusedById ?? {},
    } as SavedQuizState);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onStateChange || !questions.length) return;

    const flush = () => emitterFlushRef.current();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onStateChange, questions.length]);

  async function resetThisQuiz() {
    const key = (serverQuizKey || stableKey).trim();
    if (!key) return;

    await fetch(`/api/review/quiz?quizKey=${encodeURIComponent(key)}`, {
      method: "DELETE",
      cache: "no-store",
    });

    onReset?.();
    local.reset();
    practiceBank.setPractice({});
    setExcusedById({});
    setReloadNonce((n) => n + 1);
    setActiveIndex(0);
  }

  if (quizLoading) return <QuizBlockSkeleton />;

  if (quizError) {
    return <div className="ui-quiz-note-danger">{quizError}</div>;
  }

  if (!questions.length) {
    return (
        <div className="mt-2 ui-quiz-status-soft">
          {ui.t("noQuestions", {}, "No questions.")}
        </div>
    );
  }


    const activeQuestion = questions[activeIndex] ?? null;

    const activeQuestionDone =
        isCompleted || (activeQuestion ? isFlowDone(activeQuestion) : false);

    const hasNextQuestion = activeIndex < Math.max(0, questions.length - 1);

    const nextSlideIndex =
        navigationMode === "slideshow" && hasNextQuestion && activeQuestionDone
            ? activeIndex + 1
            : -1;
  function renderQuestionItem(q: ReviewQuestion, idx: number) {
    const unlocked = isUnlocked(idx);
    const stablePracticeKey = getStablePracticeQuestionKey(q);

    /**
     * Important:
     * This is the exercise-level navigation inside the Exercises card.
     * Do not rely on the main review card navigation for exercise binding.
     *
     * Only the currently active exercise should auto-bind the tools editor.
     * Otherwise exercise1, exercise2, exercise3 can all register and the
     * right-side editor can keep/carry the wrong exercise workspace.
     */
    const canAutoBindToolsForExercise =
        toolsActive &&
        unlocked &&
        (navigationMode !== "slideshow" || idx === activeIndex);

    const showNext =
        awaitNextQid === q.id &&
        prereqsMet &&
        !locked &&
        !isCompleted &&
        isFlowDone(q);

    const nextIdx = findNextUnlockedIndex(idx);
    const isLast = nextIdx < 0;

    return (
        <div
            className="ui-page-surface"
            key={q.id}
            ref={setQuestionEl(q.id)}
            data-qid={q.id}
        >
          {q.kind === "practice" ? (
              <QuizPracticeCard
                  q={q}
                  ownerCardId={quizCardId ?? quizId}
                  ps={practiceBank.practice[stablePracticeKey] ?? practiceBank.practice[q.id]}
                  toolScopedId={stablePracticeKey}
                  toolsActive={canAutoBindToolsForExercise}
                  unlocked={unlocked}
                  isCompleted={isCompleted}
                  locked={locked}
                  unlimitedAttempts={unlimitedAttempts}
                  strictSequential={strictSequential}
                  seqOrder={orderBase + idx}
                  padRef={practiceBank.getPadRef(stablePracticeKey) as any}
                  excused={isExcused(q.id)}
                  onRetryExercise={() => practiceBank.retryPracticeQuestion(stablePracticeKey)}
                  onExcused={() => {
                    if (!unlocked) return;
                    const ps0 = practiceBank.practice[stablePracticeKey] ?? practiceBank.practice[q.id];
                    if (!ps0?.error) return;

                    setExcusedById((prev) => ({ ...prev, [q.id]: true }));
                    lastActionQidRef.current = q.id;
                    scheduleScroll(q.id, "end");
                  }}
                  onUpdateItem={(patch) =>
                      practiceBank.updatePracticeItem(stablePracticeKey, patch)
                  }
                  onSubmit={() => {
                    lastActionQidRef.current = q.id;
                    scheduleScroll(q.id, "end");
                    void practiceBank.submitPractice(q);
                  }}
                  onHelp={(stepKey) => {
                    scheduleScroll(q.id, "end");
                    void practiceBank.openPracticeHelp(q, stepKey);
                  }}
              />
          ) : (
              <QuizLocalCard
                  prereqsMet={prereqsMet}
                  q={q}
                  unlocked={unlocked}
                  isCompleted={isCompleted}
                  locked={locked}
                  value={local.answers[q.id]}
                  checked={Boolean(local.checkedById[q.id])}
                  ok={getQuestionOk(q)}
                  onPick={(val) => local.setAnswer(q.id, val)}
                  explainRef={setExplainEl(q.id)}
                  onCheck={() => {
                    if (isCompleted || locked) return;
                    if (local.checkedById[q.id]) return;

                    lastActionQidRef.current = q.id;

                    const okNow = computeLocalOkNow(q, local.answers[q.id]);

                    local.check(q.id);
                    emitSfx(okNow ? "answer:correct" : "answer:wrong");
                    scheduleScroll(q.id, "explain");
                  }}
              />
          )}

          {showNext ? (
              <div className="mt-2 flex justify-end">
                <button
                    type="button"
                    className="ui-quiz-action ui-quiz-action--primary"
                    data-flow-focus="1"
                    onClick={() => {
                      setAwaitNextQid(null);
                      if (isLast) scrollToFooter();
                      else advanceFrom(q.id);
                    }}
                >
                  {isLast
                      ? ui.t("buttons.finish", {}, "Finish →")
                      : ui.t("buttons.next", {}, "Next →")}
                </button>
              </div>
          ) : null}

          <div ref={setEndAnchor(q.id)} className="h-0" aria-hidden />
        </div>
    );
  }

  return (
      <div className="mt-3 grid gap-3">
        <FlowNavigator
            items={questions}
            mode={navigationMode}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            reduceMotion={reduceMotion}
            getKey={(q) => q.id}
            getProgressLabel={(index, total) =>
                ui.t(
                    "progress.question",
                    { current: index + 1, total },
                    `Question ${index + 1} of ${total}`,
                )
            }
            canGoPrev={activeIndex > 0}
            canGoNext={nextSlideIndex >= 0}
            onPrev={() => {
              setAwaitNextQid(null);
              setActiveIndex((i) => Math.max(0, i - 1));
            }}
            onNext={() => {
              if (nextSlideIndex < 0) return;
              setAwaitNextQid(null);
              setActiveIndex(nextSlideIndex);
              const nextQ = questions[nextSlideIndex];
              if (nextQ) focusPrimaryActionForQuestion(nextQ.id);
            }}
            renderItem={renderQuestionItem}
        />

        <div ref={footerElRef}>
          <div className="ui-quiz-toggle-row">
            <label className="ui-quiz-toggle-label">
              <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => {
                    setAwaitNextQid(null);
                    setAutoAdvance(e.target.checked);
                  }}
              />
              {ui.t("autoAdvance", {}, "Auto-advance")}
            </label>
          </div>

          <QuizFooter
              checkedCount={summary.checkedCount}
              correctCount={summary.correctCount}
              total={summary.total}
              scorePct={Math.round(summary.score * 100)}
              isCompleted={isCompleted}
              passed={summary.passed}
              sequential={sequential}
              onResetClick={() => setConfirmResetQuiz(true)}
          />
        </div>

        <ConfirmDialog
            open={confirmResetQuiz}
            onOpenChange={setConfirmResetQuiz}
            danger
            title={ui.t("resetDialog.title", {}, "Reset this quiz?")}
            confirmLabel={ui.t("resetDialog.confirm", {}, "Reset quiz")}
            description={
              <div className="grid gap-2">
                <div>{ui.t("resetDialog.intro", {}, "This will:")}</div>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    {ui.t(
                        "resetDialog.b1",
                        {},
                        "Clear your selected answers and checked status.",
                    )}
                  </li>
                  <li>
                    {ui.t(
                        "resetDialog.b2",
                        {},
                        "Clear practice attempts and local state for this quiz.",
                    )}
                  </li>
                  <li>
                    {ui.t(
                        "resetDialog.b3",
                        {},
                        "Reload the same question set (it does not generate a new set).",
                    )}
                  </li>
                </ul>
                <div className="ui-quiz-dialog-note">
                  {ui.t("resetDialog.cannotUndo", {}, "This can’t be undone.")}
                </div>
              </div>
            }
            onConfirm={resetThisQuiz}
        />
      </div>
  );
}
