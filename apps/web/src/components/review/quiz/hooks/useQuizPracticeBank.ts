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
import {
  normalizeWorkspaceLanguage,
  stateLanguageMatches,
} from "@/components/review/module/runtime/workspaceCodeSource";

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

function isExpiredPracticeKeyError(error: unknown) {
    const message = String((error as any)?.message ?? "").toLowerCase();

    return (
        message.includes("invalid or expired key") ||
        message.includes("practice validate failed (401)") ||
        message.includes("practice help failed (401)")
    );
}

export function getStablePracticeQuestionKey(q: ReviewQuestion) {
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


function stablePracticeValue(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? "");
  }
}

function getPatchWorkspace(patch: any) {
  if (patch?.workspace?.version === 2) return patch.workspace;
  if (patch?.codeWorkspace?.version === 2) return patch.codeWorkspace;
  if (patch?.ideWorkspace?.version === 2) return patch.ideWorkspace;
  return null;
}

function getCurrentWorkspace(item: any) {
  if (item?.workspace?.version === 2) return item.workspace;
  if (item?.codeWorkspace?.version === 2) return item.codeWorkspace;
  if (item?.ideWorkspace?.version === 2) return item.ideWorkspace;
  return null;
}

function patchChangesLearnerAnswer(currentItem: any, patch: any) {
  if (!currentItem || !patch) return false;

  const answerKeys = [
    "num",
    "single",
    "multi",
    "text",
    "voiceTranscript",
    "mat",
    "matRows",
    "matCols",
    "reorder",
    "reorderIds",
    "dragA",
    "dragB",
    "code",
    "source",
    "stdin",
    "codeStdin",
    "language",
    "codeLang",
    "lang",
  ];

  for (const key of answerKeys) {
    if (!(key in patch)) continue;

    if (stablePracticeValue((currentItem as any)[key]) !== stablePracticeValue((patch as any)[key])) {
      return true;
    }
  }

  const patchWorkspace = getPatchWorkspace(patch);
  if (patchWorkspace) {
    const currentWorkspace = getCurrentWorkspace(currentItem);

    const patchCode = getWorkspaceEntryCodeForPracticeBank(patchWorkspace);
    const currentCode =
        getWorkspaceEntryCodeForPracticeBank(currentWorkspace) ||
        String(currentItem.code ?? currentItem.source ?? "");

    if (patchCode !== currentCode) return true;

    const patchStdin = String(patchWorkspace.stdin ?? "");
    const currentStdin = String(
        currentWorkspace?.stdin ?? currentItem.codeStdin ?? currentItem.stdin ?? "",
    );

    if (patchStdin !== currentStdin) return true;

    const patchLanguage = String(patchWorkspace.language ?? patch.language ?? patch.codeLang ?? "");
    const currentLanguage = String(
        currentWorkspace?.language ??
        currentItem.language ??
        currentItem.codeLang ??
        currentItem.lang ??
        "",
    );

    if (patchLanguage && patchLanguage !== currentLanguage) return true;
  }

  return false;
}

function removeResultResetFromPatch<T extends Record<string, any>>(patch: T): T {
  const next = { ...patch };
  delete next.submitted;
  delete next.result;
  return next;
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

function getRuntimePracticePatchForQuestion(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const stableKey = getStablePracticeQuestionKey(q);
  const runtime = useReviewRuntimeStore.getState();
  const exercises = runtime.exercises ?? {};

  const qAny = q as any;

  const wantedIds = new Set(
      [
        stableKey,
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

  const wantedTopic = String(
      qAny.fetch?.topic ??
      qAny.topicId ??
      qAny.topic ??
      "",
  ).trim();

  const wantedSubject = String(qAny.fetch?.subject ?? "").trim();
  const wantedModule = String(qAny.fetch?.module ?? "").trim();
  const wantedSection = String(qAny.fetch?.section ?? "").trim();

  const activeExerciseKey = String(runtime.activeExerciseKey ?? "").trim();
  const boundExerciseKey = String(runtime.tool?.boundExerciseKey ?? "").trim();

  const candidates = Object.entries(exercises)
      .map(([key, value]: any) => {
        if (!value) return null;

        const valueExerciseKey = String(value.exerciseKey ?? "").trim();
        const valueExerciseId = String(value.exerciseId ?? "").trim();
        const valueTopicId = String(value.topicId ?? "").trim();
        const valueSubjectSlug = String(value.subjectSlug ?? "").trim();
        const valueModuleSlug = String(value.moduleSlug ?? "").trim();
        const valueSectionSlug = String(value.sectionSlug ?? "").trim();

        let score = 0;

        /**
         * Strongest signal: this is the currently active/bound Tools exercise.
         */
        if (activeExerciseKey && key === activeExerciseKey) score += 700;
        if (boundExerciseKey && key === boundExerciseKey) score += 700;
        if (activeExerciseKey && valueExerciseKey === activeExerciseKey) score += 650;
        if (boundExerciseKey && valueExerciseKey === boundExerciseKey) score += 650;

        /**
         * Exact question/exercise identity.
         */
        for (const wantedId of wantedIds) {
          if (key === wantedId) score += 5000;
          if (valueExerciseKey === wantedId) score += 4800;
          if (valueExerciseId === wantedId) score += 4600;

          if (key.endsWith(`:${wantedId}`)) score += 4200;
          if (valueExerciseKey.endsWith(`:${wantedId}`)) score += 4000;
        }

        /**
         * Route/course context. This prevents another q5 from another topic from
         * winning just because it appears earlier in Object.entries().
         */
        if (wantedTopic && valueTopicId === wantedTopic) score += 300;
        if (wantedSubject && valueSubjectSlug === wantedSubject) score += 100;
        if (wantedModule && valueModuleSlug === wantedModule) score += 100;
        if (wantedSection && valueSectionSlug === wantedSection) score += 100;

        const hasIdentityMatch = Array.from(wantedIds).some((wantedId) => {
          return (
              key === wantedId ||
              key.endsWith(`:${wantedId}`) ||
              valueExerciseKey === wantedId ||
              valueExerciseKey.endsWith(`:${wantedId}`) ||
              valueExerciseId === wantedId
          );
        });

        const hasActiveMatch =
            Boolean(activeExerciseKey && key === activeExerciseKey) ||
            Boolean(boundExerciseKey && key === boundExerciseKey) ||
            Boolean(activeExerciseKey && valueExerciseKey === activeExerciseKey) ||
            Boolean(boundExerciseKey && valueExerciseKey === boundExerciseKey);

        /**
         * Topic-only matches are too broad. Require actual identity or active/bound match.
         */
        if (!hasIdentityMatch && !hasActiveMatch) return null;

        const updatedAt = Number(value.updatedAt ?? 0);

        return {
          key,
          value,
          score,
          hasIdentityMatch,
          hasActiveMatch,
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        };
      })
      .filter(Boolean);

  const identityCandidates = candidates.filter((candidate: any) => candidate.hasIdentityMatch);
  const rankedCandidates = (identityCandidates.length ? identityCandidates : candidates)
      .sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.updatedAt - a.updatedAt;
      });

  const found = rankedCandidates[0];

  if (!found) return null;

  const estate = found.value;

  const workspace =
      estate.workspace ??
      estate.codeWorkspace ??
      estate.ideWorkspace ??
      null;

  const workspaceCode = getWorkspaceEntryCodeForPracticeBank(workspace);

  const code =
      workspaceCode.trim().length > 0
          ? workspaceCode
          : typeof estate.code === "string" && estate.code.trim().length > 0
              ? estate.code
              : typeof estate.source === "string" && estate.source.trim().length > 0
                  ? estate.source
                  : "";

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

  if (process.env.NODE_ENV !== "production") {
    console.log("[practice-check-runtime-patch]", {
      qid: q.id,
      stableKey,
      wantedIds: Array.from(wantedIds),
      selectedRuntimeKey: found.key,
      selectedExerciseId: estate.exerciseId,
      selectedExerciseKey: estate.exerciseKey,
      activeExerciseKey,
      boundExerciseKey,
      score: found.score,
      submittedCode: code,
    });
  }

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
    stdin,
    codeStdin: stdin,
    lang,
    language: lang,
    codeLang: lang,
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
  };
}
function sanitizeSavedPracticePatch(savedPatch: any, exerciseKind?: string) {
    if (!savedPatch) return null;

    const next = { ...savedPatch };

    /**
     * Practice keys are short-lived signed transport tokens, not learner state.
     * A saved patch must never overwrite the fresh key returned by /api/practice.
     */
    delete next.key;
    delete next.sessionId;

    if (exerciseKind === "drag_reorder" && !next.ui?.reorderTouched) {
        delete next.reorder;
        delete next.reorderIds;
    }

    return next;
}
function mayRestoreQuestionIdPatch(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
    stableKey: string,
) {
    /**
     * q.id is often just the review-card slot id, while stableKey is the real
     * fetched/generated exercise identity. Falling back from stableKey to q.id
     * lets an old practice exercise patch override a new exercise starter.
     *
     * Only use q.id as a restore key when it is the stable identity.
     */
    return q.id === stableKey;
}
function getSavedPracticePatch(
    initialState: SavedQuizState | null,
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
    const stableKey = getStablePracticeQuestionKey(q);
    const allowQuestionIdPatch = mayRestoreQuestionIdPatch(q, stableKey);

    const byStableKey = initialState?.practiceItemPatch?.[stableKey] ?? null;
    const byQuestionId = allowQuestionIdPatch
        ? initialState?.practiceItemPatch?.[q.id] ?? null
        : null;

    const selected = byStableKey ?? byQuestionId ?? null;

    exerciseDebug("B_useQuizPracticeBank_getSavedPracticePatch", {
        qid: q.id,
        stableKey,
        allowQuestionIdPatch,
        selectedFrom: byStableKey ? "stableKey" : byQuestionId ? "questionId" : "none",
        availablePatchKeys: Object.keys(initialState?.practiceItemPatch ?? {}),
        selected: summarizeExercisePatch(selected),
    });

    reviewDebug("6_RESTORE_READ useQuizPracticeBank.getSavedPracticePatch", {
        qid: q.id,
        stableKey,
        allowQuestionIdPatch,
        availablePatchKeys: Object.keys(initialState?.practiceItemPatch ?? {}),
        selectedFrom:
            byStableKey ? "stableKey" : byQuestionId ? "questionId" : "none",
        selected: summarizeExercisePatch(selected),
    });

    return selected;
}

function getSavedPracticeMeta(
    initialState: SavedQuizState | null,
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
    const stableKey = getStablePracticeQuestionKey(q);
    const allowQuestionIdPatch = mayRestoreQuestionIdPatch(q, stableKey);

    return (
        initialState?.practiceMeta?.[stableKey] ??
        (allowQuestionIdPatch ? initialState?.practiceMeta?.[q.id] : null) ??
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

function getPracticeExerciseLanguage(exercise: any) {
  if (!exercise || exercise.kind !== "code_input") return null;

  const isSql =
      exercise.language === "sql" ||
      Boolean(exercise?.fixedSqlDialect) ||
      Boolean(exercise?.runtime?.datasetId) ||
      typeof exercise?.sqlSchemaSql === "string" ||
      typeof exercise?.sqlSeedSql === "string";

  return isSql
      ? "sql"
      : normalizeWorkspaceLanguage(exercise.language ?? "python");
}

function mergeSavedPatchIntoPracticeItem(item: any, savedPatch: any) {
  if (!item || !savedPatch) return item;

  const isCodeInput = item?.exercise?.kind === "code_input";
  const starterCode = String(item?.exercise?.starterCode ?? "").trim();
  const expectedLanguage = getPracticeExerciseLanguage(item?.exercise);

  const userEdited =
      savedPatch.userEdited === true ||
      savedPatch.workspaceOrigin === "user" ||
      savedPatch.workspaceOrigin === "saved";

  const patch = { ...savedPatch };
    /**
     * Do not merge ephemeral signed transport tokens from saved progress.
     * The live item.key from /api/practice is always the source of truth.
     */
    delete patch.key;
    delete patch.sessionId;
  if (isCodeInput && expectedLanguage && !stateLanguageMatches(patch, expectedLanguage, patch.workspace)) {
      delete patch.code;
      delete patch.source;
      delete patch.workspace;
      delete patch.codeWorkspace;
      delete patch.ideWorkspace;
      delete patch.codeStdin;
      delete patch.stdin;
      delete patch.language;
      delete patch.lang;
      delete patch.codeLang;
  }
  /**
   * Do not let a blank non-user saved/sync patch erase starterCode.
   * This preserves:
   *   - starterCode on first load
   *   - real user edits when userEdited/workspaceOrigin says it is user data
   */
    /**
     * Do not let a non-user saved/sync patch override authored starterCode.
     *
     * Important:
     * A passive runtime/tool sync can contain nonblank code, for example "1" or
     * an old query.sql snapshot. That is still not learner work unless it is
     * explicitly marked user/saved.
     *
     * For starter-backed code_input exercises:
     * - non-user patch may keep metadata/result/help/attempts
     * - non-user patch must not replace code/source/workspace
     * - real learner edits are preserved through userEdited/workspaceOrigin=user/saved
     */
    if (isCodeInput && starterCode && !userEdited) {
        delete patch.code;
        delete patch.source;
        delete patch.workspace;
        delete patch.codeWorkspace;
        delete patch.ideWorkspace;
        delete patch.codeStdin;
        delete patch.stdin;
        delete patch.language;
        delete patch.lang;
        delete patch.codeLang;
    }
  const workspace =
      patch.workspace ??
      patch.codeWorkspace ??
      patch.ideWorkspace ??
      null;

  const next = {
    ...item,
    ...patch,
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
              (mayRestoreQuestionIdPatch(q, stableKey)
                  ? initialState.practiceItemPatch?.[q.id] ?? null
                  : null);

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
                  preferPurpose: (q as any).fetch.preferPurpose ?? "mixed",
                  purposePolicy: "fallback",
                  exerciseKey:
                    (q as any).exercise?.id ??
                    (q as any).item?.id ??
                    (q as any).fetch.exerciseKey ??
                    undefined,
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

          /**
           * item.result stores the latest checked result.
           * item.feedbackDismissed controls whether wrong feedback is visible.
           *
           * Runtime/tool sync may update workspace/code fields, but it must never
           * clear result, submitted, or dismiss feedback.
           *
           * Only a real learner edit may dismiss feedback by sending:
           *   feedbackDismissed: true
           *   dismissFeedbackOnEdit: true
           */
          const explicitUserDismiss =
              Boolean((patch as any).dismissFeedbackOnEdit) &&
              Boolean((patch as any).feedbackDismissed);

          const patchForItem = { ...(patch as any) };
          delete patchForItem.dismissFeedbackOnEdit;

          if (!explicitUserDismiss) {
            if (patchForItem.feedbackDismissed === true) {
              delete patchForItem.feedbackDismissed;
            }

            if (patchForItem.submitted === false) {
              delete patchForItem.submitted;
            }

            if ("result" in patchForItem && patchForItem.result == null) {
              delete patchForItem.result;
            }
          }

          const nextFeedbackDismissed =
              patchForItem.feedbackDismissed === false
                  ? false
                  : explicitUserDismiss
                      ? true
                      : Boolean((ps.item as any).feedbackDismissed);

          const nextItem = {
            ...ps.item,
            ...patchForItem,

            feedbackDismissed: nextFeedbackDismissed,

            result:
                "result" in patchForItem && patchForItem.result != null
                    ? patchForItem.result
                    : (ps.item as any).result,

            help: patchForItem.help
                ? {
                  ...ps.item.help,
                  ...patchForItem.help,
                  entries: {
                    ...ps.item.help.entries,
                    ...(patchForItem.help.entries ?? {}),
                  },
                }
                : ps.item.help,
          };

          const nextState: PracticeState = {
            ...ps,
            item: nextItem,
            ok: explicitUserDismiss ? null : ps.ok,
          };

          if (q) {
            return setPracticeForQuestion(prev, q, nextState);
          }

          return {
            ...prev,
            [key]: nextState,
          };
        });        },
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
          useReviewRuntimeStore.getState().flushToolSnapshot();

          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });

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
                result: {
                  ...(submitted.data as any),
                  ok: submitted.ok,
                  finalized: submitted.finalized,
                },
                submitted: true,

                /**
                 * New check result should show feedback again.
                 * If wrong, feedback stays visible until the learner edits.
                 */
                feedbackDismissed: submitted.ok ? true : false,
                attempts: nextAttempts,
              } as any,            };

            return setPracticeForQuestion(prev, q, nextState);
          });
        } catch (e: any) {
            if (isExpiredPracticeKeyError(e)) {
                /**
                 * Keep the card disabled/loading while the replacement practice item is
                 * fetched. Do not briefly unlock the stale item, or the learner can submit
                 * the same expired key again before React installs the refreshed item.
                 */
                setPractice((prev) => {
                    const current = prev[key] ?? prev[q.id];
                    if (!current) return prev;

                    return setPracticeForQuestion(prev, q, {
                        ...current,
                        loading: true,
                        busy: false,
                        error: null,
                    });
                });

                await loadPracticeQuestion(q, { force: true });
                return;
            }

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
      [practice, unlimitedAttempts, isCompleted, locked, loadPracticeQuestion],  );

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
            if (isExpiredPracticeKeyError(e)) {
                /**
                 * Same stale-key protection as submitPractice:
                 * do not re-enable the old item while the refreshed key is still loading.
                 */
                setPractice((prev) => {
                    const current = prev[key] ?? prev[q.id];
                    if (!current) return prev;

                    return setPracticeForQuestion(prev, q, {
                        ...current,
                        loading: true,
                        busy: false,
                        error: null,
                        item: current.item
                            ? {
                                ...current.item,
                                help: {
                                    ...current.item.help,
                                    busyStepKey: null,
                                    error: null,
                                },
                            }
                            : current.item,
                    });
                });

                await loadPracticeQuestion(q, { force: true });
                return;
            }

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
      [practice, isCompleted, locked, loadPracticeQuestion],  );

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
