"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import type {ReviewProjectSpec, ReviewProjectStep, ReviewQuestion, ReviewQuizSpec} from "@/lib/subjects/types";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";
import type {
  ExerciseRuntimeState,
  UnknownRecord,
} from "@/components/review/module/runtime/reviewRuntimeTypes";
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
import {
  resolveQuizPracticeRuntimeDefaults,
} from "./quiz/runtimeDefaults";

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
type PracticeRuntimeQuestion = Extract<ReviewQuestion, { kind: "practice" }> &
  UnknownRecord & {
    fetch?: UnknownRecord & {
      exerciseKey?: string;
      stepId?: string;
    };
    exerciseKey?: string;
    stepId?: string;
    sourceStepId?: string;
    key?: string;
    item?: UnknownRecord & {
      id?: string;
      exerciseKey?: string;
      result?: { ok?: boolean };
    };
    exercise?: UnknownRecord & {
      id?: string;
      exerciseKey?: string;
    };
    explain?: string;
  };

type PracticeItemRecord = UnknownRecord & {
  key?: string;
  kind?: string;
  ui?: UnknownRecord & {
    reorderTouched?: boolean;
  };
  result?: {
    ok?: boolean;
  } | null;
};

type RuntimePracticePatch = UnknownRecord & {
  exerciseKey?: string;
  exerciseId?: string;
  subjectSlug?: string;
  moduleSlug?: string;
  sectionSlug?: string;
  topicId?: string;
  cardId?: string;
  code?: string;
  source?: string;
  codeLang?: string;
  lang?: string;
  language?: string;
  stdin?: string;
  codeStdin?: string;
  userEdited?: boolean;
  workspaceOrigin?: string;
  starterHash?: string;
  updatedAt?: number;
  workspace?: unknown;
  codeWorkspace?: unknown;
  ideWorkspace?: unknown;
};

type RuntimeExerciseCandidate = {
  key: string;
  value: ExerciseRuntimeState;
  score: number;
  hasIdentityMatch: boolean;
  updatedAt: number;
};















function asProjectSpec(spec: ReviewQuizSpec): ReviewProjectSpec | null {
    const value = spec as unknown as ReviewProjectSpec;

    if (
        value &&
        value.mode === "project" &&
        Array.isArray(value.steps)
    ) {
        return value;
    }

    return null;
}

function stringKey(value: unknown) {
    return String(value ?? "").trim();
}

function getProjectStepManifestForQuestion(
    spec: ReviewQuizSpec,
    q: ReviewQuestion,
    index: number,
): ReviewProjectStep | null {
    if (q.kind !== "practice") return null;

    const projectSpec = asProjectSpec(spec);
    if (!projectSpec) return null;

    const anyQ = q as any;
    const fetch = anyQ.fetch ?? {};

    const candidates = new Set(
        [
            fetch.exerciseKey,
            anyQ.exerciseKey,
            fetch.stepId,
            anyQ.stepId,
            anyQ.sourceStepId,
            anyQ.key,
            anyQ.item?.exerciseKey,
            anyQ.item?.id,
            anyQ.exercise?.exerciseKey,
            anyQ.exercise?.id,
            q.id,
        ]
            .map(stringKey)
            .filter(Boolean),
    );

    const matched =
        projectSpec.steps.find((step) => {
            const stepId = stringKey(step.id);
            const exerciseKey = stringKey(step.exerciseKey);

            return (
                Boolean(stepId && candidates.has(stepId)) ||
                Boolean(exerciseKey && candidates.has(exerciseKey)) ||
                Boolean(exerciseKey && String(q.id).includes(exerciseKey)) ||
                Boolean(stepId && String(q.id).includes(stepId))
            );
        }) ?? null;

    /**
     * Critical fallback:
     * Project questions are generated in the same order as project steps.
     * If an old/frozen question does not carry exerciseKey/stepId clearly,
     * still pass the matching step by index so Tools has the authored starter.
     */
    return matched ?? projectSpec.steps[index] ?? null;
}

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
    val: unknown,
) {
  if (q.kind === "mcq") return val === q.answerId;

  const v = Number(val);
  if (!Number.isFinite(v)) return false;
  const tol = q.tolerance ?? 0;
  return Math.abs(v - q.answer) <= tol;
}
function serializePracticeItemForSave(
  item: PracticeItemRecord | null | undefined,
  exercise: UnknownRecord | null | undefined,
) {
  if (!item) return {};

  const itemAny = item as UnknownRecord;
  const ui = itemAny.ui as UnknownRecord | undefined;

  const rest: UnknownRecord = {
    single: itemAny.single,
    multi: itemAny.multi,
    num: itemAny.num,
    dragA: itemAny.dragA,
    dragB: itemAny.dragB,
    matRows: itemAny.matRows,
    matCols: itemAny.matCols,
    mat: itemAny.mat,
    result: itemAny.result,
    submitted: itemAny.submitted,
    attempts: itemAny.attempts,
    code: itemAny.code,
    source: itemAny.source,
    codeLang: itemAny.codeLang,
    language: itemAny.language,
    lang: itemAny.lang,
    codeStdin: itemAny.codeStdin,
    stdin: itemAny.stdin,
    workspace: itemAny.workspace,
    codeWorkspace: itemAny.codeWorkspace,
    ideWorkspace: itemAny.ideWorkspace,
    text: itemAny.text,
    reorder: itemAny.reorder,
    reorderIds: itemAny.reorderIds,
    feedbackDismissed: itemAny.feedbackDismissed,
    voiceTranscript: itemAny.voiceTranscript,
    voiceAudioId: itemAny.voiceAudioId,
    revealed: itemAny.revealed,
    codeRunOutput: itemAny.codeRunOutput,
    userEdited: itemAny.userEdited,
    workspaceOrigin: itemAny.workspaceOrigin,
    starterHash: itemAny.starterHash,
    updatedAt: itemAny.updatedAt,
  };

  // Never persist immutable authored exercise content inside the learner patch.
  // A saved QItem from one exercise must not be able to replace prompt/title/
  // exercise on a freshly loaded exercise with the same short slot id.
  delete rest.exercise;
  delete rest.key;
  delete rest.title;
  delete rest.prompt;
  delete rest.hint;
  delete rest.options;
  delete rest.tokens;
  delete rest.expected;
  delete rest.starterCode;
  delete rest.starterFiles;
  delete rest.workspaceExpectations;
  delete rest.recipe;
  delete rest.help;

  if (exercise?.kind === "drag_reorder" && !ui?.reorderTouched) {
    delete rest.reorder;
    delete rest.reorderIds;
  }

  for (const key of Object.keys(rest)) {
    if (typeof rest[key] === "undefined") {
      delete rest[key];
    }
  }

  return rest;
}

function cleanPracticeKeyPart(value: unknown) {
  return String(value ?? "")
      .trim()
      .replace(/[:\s]+/g, "-");
}

function getStablePracticeQuestionKey(q: ReviewQuestion) {
  if (q.kind !== "practice") return q.id;

  const practiceQuestion = q as PracticeRuntimeQuestion;
  const fetch = practiceQuestion.fetch ?? {};

  const scopedKey = [
    cleanPracticeKeyPart((fetch as any).subjectSlug ?? fetch.subject ?? (practiceQuestion as any).subjectSlug),
    cleanPracticeKeyPart((fetch as any).moduleSlug ?? fetch.module ?? (practiceQuestion as any).moduleSlug),
    cleanPracticeKeyPart((fetch as any).sectionSlug ?? fetch.section ?? (practiceQuestion as any).sectionSlug),
    cleanPracticeKeyPart((fetch as any).topicId ?? fetch.topic ?? (practiceQuestion as any).topicId),
    cleanPracticeKeyPart(
      fetch.exerciseKey ??
      practiceQuestion.exerciseKey ??
      practiceQuestion.item?.exerciseKey ??
      practiceQuestion.exercise?.exerciseKey ??
      practiceQuestion.exercise?.id ??
      fetch.stepId ??
      practiceQuestion.stepId ??
      practiceQuestion.sourceStepId ??
      practiceQuestion.item?.id ??
      practiceQuestion.key ??
      q.id,
    ),
  ]
      .filter(Boolean)
      .join(":");

  return scopedKey || String(q.id ?? "");
}

function getPracticeRouteExerciseId(q: ReviewQuestion) {
  if (q.kind !== "practice") return q.id;

  const practiceQuestion = q as PracticeRuntimeQuestion;
  return (
    practiceQuestion.fetch?.exerciseKey ??
    practiceQuestion.fetch?.stepId ??
    practiceQuestion.exerciseKey ??
    practiceQuestion.stepId ??
    practiceQuestion.sourceStepId ??
    practiceQuestion.item?.exerciseKey ??
    practiceQuestion.exercise?.exerciseKey ??
    practiceQuestion.item?.id ??
    practiceQuestion.exercise?.id ??
    getStablePracticeQuestionKey(q)
  );
}

function normalizePracticeRouteToken(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^.*:/, "")
    .replace(/_/g, "-")
    .toLowerCase();
}

function questionMatchesRouteExerciseId(
  q: ReviewQuestion,
  routeExerciseId: string | null | undefined,
) {
  if (q.kind !== "practice") return false;

  const routeToken = normalizePracticeRouteToken(routeExerciseId);
  if (!routeToken) return false;

  const practiceQuestion = q as PracticeRuntimeQuestion;
  const candidates = [
    getStablePracticeQuestionKey(q),
    q.id,
    practiceQuestion.fetch?.exerciseKey,
    practiceQuestion.fetch?.stepId,
    practiceQuestion.exerciseKey,
    practiceQuestion.stepId,
    practiceQuestion.sourceStepId,
    practiceQuestion.item?.id,
    practiceQuestion.item?.exerciseKey,
    practiceQuestion.exercise?.id,
    practiceQuestion.exercise?.exerciseKey,
    practiceQuestion.key,
  ];

  return candidates.some((candidate) => {
    const candidateToken = normalizePracticeRouteToken(candidate);
    return Boolean(candidateToken) && candidateToken === routeToken;
  });
}


function getRuntimePracticePatchForQuestion(q: ReviewQuestion) {
  if (q.kind !== "practice") return null;

  const stablePracticeKey = getStablePracticeQuestionKey(q);
  const runtime = useReviewRuntimeStore.getState();
  const exercises = runtime.exercises ?? {};

  const qAny = q as PracticeRuntimeQuestion;

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

  const wantedTopic = String(qAny.fetch?.topic ?? qAny.topicId ?? "").trim();
  const wantedSubject = String(qAny.fetch?.subject ?? qAny.subjectSlug ?? "").trim();
  const wantedModule = String(qAny.fetch?.module ?? qAny.moduleSlug ?? "").trim();
  const wantedSection = String(qAny.fetch?.section ?? qAny.sectionSlug ?? "").trim();

  const activeExerciseKey = String(runtime.activeExerciseKey ?? "").trim();
  const boundExerciseKey = String(runtime.tool?.boundExerciseKey ?? "").trim();

  const candidates = Object.entries(exercises)
      .map(([key, value]): RuntimeExerciseCandidate | null => {
        if (!value) return null;

        const valueExerciseKey = String(value.exerciseKey ?? "").trim();
        const valueExerciseId = String(value.exerciseId ?? "").trim();
        const valueTopicId = String(value.topicId ?? "").trim();
        const valueSubjectSlug = String(value.subjectSlug ?? "").trim();
        const valueModuleSlug = String(value.moduleSlug ?? "").trim();
        const valueSectionSlug = String(value.sectionSlug ?? "").trim();

        const scopeMatches =
            (!wantedTopic || valueTopicId === wantedTopic) &&
            (!wantedSubject || valueSubjectSlug === wantedSubject) &&
            (!wantedModule || valueModuleSlug === wantedModule) &&
            (!wantedSection || valueSectionSlug === wantedSection);

        if (!scopeMatches) return null;

        let score = 0;

        if (activeExerciseKey && key === activeExerciseKey) score += 700;
        if (boundExerciseKey && key === boundExerciseKey) score += 700;
        if (activeExerciseKey && valueExerciseKey === activeExerciseKey) score += 650;
        if (boundExerciseKey && valueExerciseKey === boundExerciseKey) score += 650;

        for (const wantedId of wantedIds) {
          if (key === wantedId) score += 5000;
          if (valueExerciseKey === wantedId) score += 4800;
          if (valueExerciseId === wantedId) score += 4600;

          if (key.endsWith(`:${wantedId}`)) score += 4200;
          if (valueExerciseKey.endsWith(`:${wantedId}`)) score += 4000;
        }

        if (score <= 0) return null;

        const updatedAt = Number(value.updatedAt ?? 0);
        const hasIdentityMatch = Array.from(wantedIds).some((wantedId) => (
          key === wantedId ||
          valueExerciseKey === wantedId ||
          valueExerciseId === wantedId ||
          key.endsWith(`:${wantedId}`) ||
          valueExerciseKey.endsWith(`:${wantedId}`)
        ));

        return {
          key,
          value,
          score,
          hasIdentityMatch,
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        };
      })
      .filter((candidate): candidate is RuntimeExerciseCandidate => Boolean(candidate));

  const identityCandidates = candidates.filter((candidate) => candidate.hasIdentityMatch);
  const rankedCandidates = (identityCandidates.length ? identityCandidates : candidates)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.updatedAt - a.updatedAt;
      });

  const found = rankedCandidates[0];
  if (!found) return null;

  const estate = found.value as ExerciseRuntimeState;

  const workspace =
      isWorkspace(estate.workspace)
          ? estate.workspace
          : isWorkspace(estate.codeWorkspace)
              ? estate.codeWorkspace
              : isWorkspace(estate.ideWorkspace)
                  ? estate.ideWorkspace
                  : null;

  const workspaceCode = deriveEntryCode(workspace);

  const code =
      workspaceCode ||
      (typeof estate.code === "string"
          ? estate.code
          : typeof estate.source === "string"
              ? estate.source
              : "");

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
    exerciseKey: estate.exerciseKey,
    exerciseId: estate.exerciseId,
    subjectSlug: estate.subjectSlug,
    moduleSlug: estate.moduleSlug,
    sectionSlug: estate.sectionSlug,
    topicId: estate.topicId,
    cardId: estate.cardId,
    code,
    source: code,
    codeLang: lang,
    lang,
    language: lang,
    stdin,
    codeStdin: stdin,
    userEdited:
        estate.userEdited === true ||
        estate.workspaceOrigin === "user" ||
        estate.workspaceOrigin === "saved",
    workspaceOrigin:
        estate.workspaceOrigin ??
        (estate.userEdited === true ? "user" : "saved"),
    starterHash: estate.starterHash,
    updatedAt: estate.updatedAt ?? Date.now(),
    ...(workspace
        ? {
          workspace,
          codeWorkspace: workspace,
          ideWorkspace: workspace,
        }
        : {}),
  } satisfies RuntimePracticePatch;
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
                                    routeExerciseId = null,
                                    subjectRuntimeDefaults = null,
                                    courseRuntimeDefaults = null,
                                    moduleRuntimeDefaults = null,
                                    sectionRuntimeDefaults = null,
                                    topicRuntimeDefaults = null,
                                    onNavigateToExerciseRoute,
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
  routeExerciseId?: string | null;
  subjectRuntimeDefaults?: unknown;
  courseRuntimeDefaults?: unknown;
  moduleRuntimeDefaults?: unknown;
  sectionRuntimeDefaults?: unknown;
  topicRuntimeDefaults?: unknown;
  onNavigateToExerciseRoute?: (args: { cardId: string; exerciseId: string }) => Promise<void> | void;
}) {
  const initState = initialState ?? null;

  const stableKey = useMemo(
      () =>
          quizKey?.trim()
              ? quizKey.trim()
              : buildReviewQuizKey(spec, quizCardId ?? quizId, 0),
      [quizKey, spec, quizCardId, quizId],
  );

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
    if (!routeExerciseId) return -1;
    return questions.findIndex((q) => questionMatchesRouteExerciseId(q, routeExerciseId));
  }, [questions, routeExerciseId]);
  const routeExerciseQuestionId = useMemo(() => {
    if (routeExerciseIndex < 0) return null;
    return questions[routeExerciseIndex]?.id ?? null;
  }, [questions, routeExerciseIndex]);
  const routeExercisePendingResolution = Boolean(
    routeExerciseId &&
    !quizError &&
    quizLoading,
  );

  const routeExerciseMissingAfterLoad = Boolean(
    routeExerciseId &&
    !quizLoading &&
    !quizError &&
    questions.length > 0 &&
    routeExerciseIndex < 0,
  );

  useEffect(() => {
    if (!routeExerciseMissingAfterLoad) return;

    console.warn(
      "[review-quiz] route exercise was not found in loaded questions; showing the quiz instead of leaving the card in a skeleton state",
      {
        quizId,
        quizCardId,
        routeExerciseId,
        questionIds: questions.map((q) => q.id),
      },
    );
  }, [
    quizId,
    quizCardId,
    routeExerciseId,
    routeExerciseMissingAfterLoad,
    questions,
  ]);
  const isProjectQuestionFlow = useMemo(
    () => Array.isArray((spec as { steps?: unknown[] } | null | undefined)?.steps),
    [spec],
  );
  const routeOwnedProjectPracticeNavigation =
    navigationMode === "slideshow" &&
    isProjectQuestionFlow &&
    typeof onNavigateToExerciseRoute === "function";

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

            const itemResult = (ps?.item as PracticeItemRecord | undefined)?.result;
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

            const itemResult = (ps.item as PracticeItemRecord | undefined)?.result;

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

        const current = questions[index];
        if (current?.kind === "practice") return true;

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
    ]);  
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

    const practiceItemPatch: Record<string, UnknownRecord> = {
      ...(base?.practiceItemPatch ?? {}),
    };
    const practiceMeta: Record<string, { attempts: number; ok: boolean | null }> = {
      ...(base?.practiceMeta ?? {}),
    };

    for (const q of questions) {
      if (q.kind !== "practice") continue;

      const stablePracticeKey = getStablePracticeQuestionKey(q);
      const ps = practiceBank.practice[stablePracticeKey] ?? practiceBank.practice[q.id];

      if (ps) {
          const itemResultOk =
              typeof (ps.item as PracticeItemRecord | undefined)?.result?.ok === "boolean"
                  ? Boolean((ps.item as PracticeItemRecord).result?.ok)
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

        // Do not also write by q.id. Project q.id values are slot identifiers and
        // can remain stable after content changes, which causes cross-topic reuse.
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

        // Do not also write by q.id. Only the scoped practice key is safe.
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

          // Do not also write runtime patches by q.id. Only the scoped practice key is safe.
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
    else mq.addListener?.(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener?.(apply);
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
        lastActionQidRef.current = null;

        if (advanceTimerRef.current) {
            window.clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = null;
        }
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

        target?.focus({ preventScroll: true });
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

  const scrollToFooter = useCallback(() => {
    const el = footerElRef.current;
    if (!el) return;
    scrollIntoViewSmart(el, {
      reduceMotion,
      block: "start",
      force: true,
      offsetPx: 12,
    });
  }, [reduceMotion]);

  useEffect(() => {
    if (quizLoading) return;
    if (!questions.length) return;

    const restoreKey = `${resetKey}:restore:${routeExerciseQuestionId ?? "flow"}`;
    if (restoreQuestionKeyRef.current === restoreKey) return;

    if (navigationMode === "slideshow") {
      restoreQuestionKeyRef.current = restoreKey;
      setActiveIndex(routeExerciseIndex >= 0 ? routeExerciseIndex : findCurrentActivityQuestionIndex());
      return;
    }

    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 12;

    const tryRestore = () => {
      if (cancelled) return;

      const qid = routeExerciseQuestionId ?? findCurrentActivityQuestionId();
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
    routeExerciseIndex,
    routeExerciseQuestionId,
    findCurrentActivityQuestionId,
    findCurrentActivityQuestionIndex,
    reduceMotion,
    navigationMode,
    scrollToFooter,
  ]);

  useEffect(() => {
    if (routeExerciseIndex < 0) return;
    setActiveIndex((prev) => (prev === routeExerciseIndex ? prev : routeExerciseIndex));
  }, [routeExerciseIndex]);

  function findNextUnlockedIndex(fromIdx: number) {
    for (let i = fromIdx + 1; i < questions.length; i++) {
      if (isUnlocked(i)) return i;
    }
    return -1;
  }

  function navigateToQuestionIndex(index: number) {
    const nextQuestion = questions[index];
    if (!nextQuestion) return false;

    if (
      routeOwnedProjectPracticeNavigation &&
      nextQuestion.kind === "practice" &&
      onNavigateToExerciseRoute
    ) {
      const nextExerciseId = getPracticeRouteExerciseId(nextQuestion);
      if (nextExerciseId) {
        onNavigateToExerciseRoute({
          cardId: quizCardId ?? quizId,
          exerciseId: nextExerciseId,
        });
        return true;
      }
    }

    setActiveIndex(index);
    return false;
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
      const navigatedByRoute = navigateToQuestionIndex(nextIdx);
      if (!navigatedByRoute) {
        focusPrimaryActionForQuestion(nextQ.id);
      }
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
    const ex = "explain" in q ? q.explain : undefined;
    return typeof ex === "string" && ex.trim().length > 0;
  }

  useEffect(() => {
    if (!prereqsMet || locked || isCompleted) return;

    const qid = lastActionQidRef.current;
    if (!qid) return;

    const q = questions.find((x) => x.id === qid);
    if (!q) return;

    if (!isFlowDone(q)) return;

      if (!autoAdvance) {
          setAwaitNextQid(qid);
          lastActionQidRef.current = null;
          return;
      }

      setAwaitNextQid(null);

      const delay = 220;

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
  ]);  

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

  if (quizLoading || routeExercisePendingResolution) return <QuizBlockSkeleton />;

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

    const routeOwnedPracticeNextIndex =
        routeOwnedProjectPracticeNavigation &&
        hasNextQuestion &&
        activeQuestionDone &&
        activeQuestion?.kind === "practice" &&
        questions[activeIndex + 1]?.kind === "practice"
            ? activeIndex + 1
            : -1;

    const nextSlideIndex =
        routeOwnedPracticeNextIndex >= 0
            ? routeOwnedPracticeNextIndex
            : navigationMode === "slideshow" && hasNextQuestion && activeQuestionDone
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
    const practiceRuntimeDefaults = resolveQuizPracticeRuntimeDefaults({
      spec,
      subjectRuntimeDefaults,
      courseRuntimeDefaults,
      moduleRuntimeDefaults,
      sectionRuntimeDefaults,
      topicRuntimeDefaults,
    });
      const projectStepManifest =
          q.kind === "practice"
              ? getProjectStepManifestForQuestion(spec, q, idx)
              : null;
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
                  projectStepManifest={projectStepManifest}
                  ps={practiceBank.practice[stablePracticeKey] ?? practiceBank.practice[q.id]}
                  toolScopedId={stablePracticeKey}
                  toolsActive={canAutoBindToolsForExercise}
                  subjectRuntimeDefaults={practiceRuntimeDefaults.subjectRuntimeDefaults}
                  courseRuntimeDefaults={practiceRuntimeDefaults.courseRuntimeDefaults}
                  moduleRuntimeDefaults={practiceRuntimeDefaults.moduleRuntimeDefaults}
                  sectionRuntimeDefaults={practiceRuntimeDefaults.sectionRuntimeDefaults}
                  topicRuntimeDefaults={practiceRuntimeDefaults.topicRuntimeDefaults}
                  unlocked={unlocked}
                  isCompleted={isCompleted}
                  locked={locked}
                  unlimitedAttempts={unlimitedAttempts}
                  strictSequential={strictSequential}
                  seqOrder={orderBase + idx}
                  padRef={practiceBank.getPadRef(stablePracticeKey)}
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
              navigateToQuestionIndex(Math.max(0, activeIndex - 1));
            }}
            onNext={() => {
              if (nextSlideIndex < 0) return;
              setAwaitNextQid(null);
              const navigatedByRoute = navigateToQuestionIndex(nextSlideIndex);
              if (!navigatedByRoute) {
                const nextQ = questions[nextSlideIndex];
                if (nextQ) focusPrimaryActionForQuestion(nextQ.id);
              }
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
