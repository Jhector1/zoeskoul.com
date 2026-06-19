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
  normalizeCurrentPracticeItem,
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
export type PracticeState = PracticeItemState & {
  exerciseKey?: string;
  topicId?: string;
  subjectSlug?: string;
  moduleSlug?: string;
  sectionSlug?: string;
};

const LOAD_TIMEOUT_MS = 12000;

function normalizePracticeKeyPart(value: unknown) {
  return String(value ?? "")
      .trim()
      .replace(/[:\s]+/g, "-");
}

function buildScopedPracticeQuestionKey(q: Extract<ReviewQuestion, { kind: "practice" }>) {
  const anyQ = q as any;
  const fetch = anyQ.fetch ?? {};

  const subjectSlug = normalizePracticeKeyPart(
      fetch.subjectSlug ?? fetch.subject ?? anyQ.subjectSlug,
  );
  const moduleSlug = normalizePracticeKeyPart(
      fetch.moduleSlug ?? fetch.module ?? anyQ.moduleSlug,
  );
  const sectionSlug = normalizePracticeKeyPart(
      fetch.sectionSlug ?? fetch.section ?? anyQ.sectionSlug,
  );
  const topicId = normalizePracticeKeyPart(
      fetch.topicId ?? fetch.topic ?? anyQ.topicId ?? anyQ.topic,
  );
  const exerciseKey = normalizePracticeKeyPart(
      fetch.exerciseKey ??
      anyQ.exerciseKey ??
      anyQ.item?.exerciseKey ??
      anyQ.exercise?.exerciseKey ??
      anyQ.exercise?.id ??
      fetch.stepId ??
      anyQ.stepId ??
      anyQ.sourceStepId ??
      anyQ.item?.id ??
      anyQ.key ??
      q.id,
  );

  return [subjectSlug, moduleSlug, sectionSlug, topicId, exerciseKey]
      .filter(Boolean)
      .join(":");
}


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

  const scopedKey = buildScopedPracticeQuestionKey(q);
  return scopedKey || String(q.id ?? "");
}

type PracticeQuestionIdentity = {
  stableKey: string;
  exerciseKey: string;
  topicId: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
};

type PracticeStateIdentity = {
  exerciseKey: string;
  topicId: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
};

function normalizeIdentityValue(value: unknown) {
  return String(value ?? "").trim();
}

export function getPracticeQuestionIdentity(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
): PracticeQuestionIdentity {
  const anyQ = q as any;

  return {
    stableKey: getStablePracticeQuestionKey(q),
    exerciseKey: normalizeIdentityValue(
        anyQ.fetch?.exerciseKey ??
        anyQ.exerciseKey ??
        anyQ.item?.exerciseKey ??
        anyQ.exercise?.exerciseKey ??
        anyQ.exercise?.id ??
        anyQ.item?.id,
    ),
    topicId: normalizeIdentityValue(
        anyQ.fetch?.topic ??
        anyQ.topicId ??
        anyQ.topic,
    ),
    subjectSlug: normalizeIdentityValue(
        anyQ.fetch?.subjectSlug ??
        anyQ.fetch?.subject ??
        anyQ.subjectSlug,
    ),
    moduleSlug: normalizeIdentityValue(
        anyQ.fetch?.moduleSlug ??
        anyQ.fetch?.module ??
        anyQ.moduleSlug,
    ),
    sectionSlug: normalizeIdentityValue(
        anyQ.fetch?.sectionSlug ??
        anyQ.fetch?.section ??
        anyQ.sectionSlug,
    ),
  };
}

export function getPracticeStateIdentity(state: PracticeState | null | undefined): PracticeStateIdentity {
  const item = (state as any)?.item ?? null;
  const exercise = (state as any)?.exercise ?? null;

  return {
    exerciseKey: normalizeIdentityValue(
        (state as any)?.exerciseKey ??
        item?.exerciseKey ??
        exercise?.exerciseKey ??
        exercise?.id ??
        item?.id,
    ),
    topicId: normalizeIdentityValue(
        (state as any)?.topicId ??
        item?.topicId ??
        exercise?.topic ??
        exercise?.topicId,
    ),
    subjectSlug: normalizeIdentityValue(
        (state as any)?.subjectSlug ??
        item?.subjectSlug ??
        exercise?.subjectSlug,
    ),
    moduleSlug: normalizeIdentityValue(
        (state as any)?.moduleSlug ??
        item?.moduleSlug ??
        exercise?.moduleSlug,
    ),
    sectionSlug: normalizeIdentityValue(
        (state as any)?.sectionSlug ??
        item?.sectionSlug ??
        exercise?.sectionSlug,
    ),
  };
}

export function doesPracticeStateMatchQuestion(
    state: PracticeState | null | undefined,
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  if (!state?.exercise || !state?.item) return false;

  const current = getPracticeQuestionIdentity(q);
  const existing = getPracticeStateIdentity(state);

  const exerciseKeyMatches =
      Boolean(current.exerciseKey) &&
      Boolean(existing.exerciseKey) &&
      current.exerciseKey === existing.exerciseKey;

  if (!exerciseKeyMatches) return false;

  const scopedFields: Array<keyof Omit<PracticeQuestionIdentity, "stableKey" | "exerciseKey">> = [
    "topicId",
    "subjectSlug",
    "moduleSlug",
    "sectionSlug",
  ];

  return scopedFields.every((field) => {
    const currentValue = current[field];
    const existingValue = existing[field];

    if (!currentValue) return true;
    if (!existingValue) return false;
    return currentValue === existingValue;
  });
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

function isRuntimeRecordLike(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeTerminalEvidenceForPracticeSubmit(value: unknown) {
  if (!isRuntimeRecordLike(value)) return null;

  const commands = Array.isArray(value.commands)
      ? value.commands
          .map((command) => String(command ?? "").trim())
          .filter(Boolean)
      : [];

  const outputText =
      typeof value.outputText === "string"
          ? value.outputText
          : typeof value.output === "string"
              ? value.output
              : "";

  const cwd = typeof value.cwd === "string" ? value.cwd.trim() : "";

  if (!commands.length && !outputText.trim() && !cwd) {
    return null;
  }

  return {
    commands,
    outputText,
    ...(cwd ? { cwd } : {}),
  };
}

function getVisibleTerminalEvidenceForPracticeSubmit() {
  if (typeof document === "undefined") return null;

  const transcriptText = normalizeVisibleTerminalTranscriptText(
      Array.from(
      document.querySelectorAll<HTMLElement>(
          '[data-testid="interactive-terminal-transcript"], [data-testid="interactive-terminal"]',
      ),
  )
          .map((node) =>
              typeof node.innerText === "string" && node.innerText.trim()
                  ? node.innerText
                  : node.textContent,
          ),
  );

  if (!transcriptText) return null;

  return normalizeTerminalEvidenceForPracticeSubmit({ outputText: transcriptText });
}

function mergeTerminalEvidenceForPracticeSubmit(...values: unknown[]) {
  const commands: string[] = [];
  const seenCommands = new Set<string>();
  const outputParts: string[] = [];
  let cwd = "";

  for (const value of values) {
    const evidence = normalizeTerminalEvidenceForPracticeSubmit(value);
    if (!evidence) continue;

    for (const command of evidence.commands ?? []) {
      const normalized = String(command ?? "").trim();
      if (!normalized || seenCommands.has(normalized)) continue;
      seenCommands.add(normalized);
      commands.push(normalized);
    }

    if (String(evidence.outputText ?? "").trim()) {
      outputParts.push(String(evidence.outputText));
    }

    if (!cwd && typeof evidence.cwd === "string" && evidence.cwd.trim()) {
      cwd = evidence.cwd.trim();
    }
  }

  const outputText = outputParts.join("\n");

  if (!commands.length && !outputText.trim() && !cwd) return null;

  return {
    commands,
    outputText,
    ...(cwd ? { cwd } : {}),
  };
}

function getLiveTerminalEvidenceForPracticeSubmit(candidateKeys: string[]) {
  if (typeof window === "undefined") return null;

  const win = window as typeof window & {
    __zoeGetTerminalEvidenceBeforeSubmit?: Record<string, () => unknown>;
    __zoeGetAnyTerminalEvidenceBeforeSubmit?: () => unknown;
  };

  const seen = new Set<string>();
  let keyedEvidence: ReturnType<typeof normalizeTerminalEvidenceForPracticeSubmit> = null;

  for (const candidateKey of candidateKeys) {
    const key = String(candidateKey ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const getter = win.__zoeGetTerminalEvidenceBeforeSubmit?.[key];
    const evidence = normalizeTerminalEvidenceForPracticeSubmit(getter?.());
    if (evidence) {
      keyedEvidence = evidence;
      break;
    }
  }

  /**
   * Last-resort browser fallback.
   *
   * The visible xterm transcript is rendered from the terminalFeed. It is the
   * one source that definitely matches what the learner sees. If the runtime
   * store/global getter is one render tick behind, this still carries commands
   * such as `mkdir -p semester/notes ...` into validation.
   */
  return mergeTerminalEvidenceForPracticeSubmit(
      keyedEvidence,
      win.__zoeGetAnyTerminalEvidenceBeforeSubmit?.(),
      getVisibleTerminalEvidenceForPracticeSubmit(),
  );
}

function practiceQuestionNeedsTerminalEvidence(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const qAny = q as any;
  const expected =
      qAny.item?.expected ??
      qAny.expected ??
      qAny.exercise?.expected ??
      qAny.item?.exercise?.expected ??
      null;

  if (!isRuntimeRecordLike(expected)) return false;

  const terminalExpectations = expected.terminalExpectations;
  if (Array.isArray(terminalExpectations) && terminalExpectations.length > 0) {
    return true;
  }

  if (terminalExpectations && typeof terminalExpectations === "object") {
    const record = terminalExpectations as Record<string, unknown>;
    return (
        Array.isArray(record.requiredCommands) ||
        Array.isArray(record.forbiddenCommands) ||
        Array.isArray(record.outputContains) ||
        Array.isArray(record.outputRegex) ||
        typeof record.cwdContains === "string" ||
        typeof record.cwdEndsWith === "string"
    );
  }

  const workspaceExpectations = expected.workspaceExpectations;
  const hasWorkspaceExpectations =
      workspaceExpectations &&
      typeof workspaceExpectations === "object" &&
      (
          Array.isArray((workspaceExpectations as Record<string, unknown>).requiredFiles) ||
          Array.isArray((workspaceExpectations as Record<string, unknown>).requiredFolders) ||
          Array.isArray((workspaceExpectations as Record<string, unknown>).forbiddenFiles)
      );

  const recipe = (expected as any).recipe;
  const recipeType =
      typeof (expected as any).recipeType === "string"
          ? (expected as any).recipeType
          : typeof recipe?.type === "string"
              ? recipe.type
              : "";
  const shellTaskMode =
      typeof (expected as any).shellTaskMode === "string"
          ? (expected as any).shellTaskMode
          : typeof recipe?.mode === "string"
              ? recipe.mode
              : "";

  /**
   * Workspace-only shell tasks still need terminal evidence in the client.
   * The evidence lets candidate selection prefer the live PTY runtime patch and
   * gives validation a command-transcript fallback if the filesystem snapshot is
   * a render tick behind.
   */
  return Boolean(
      hasWorkspaceExpectations ||
      recipeType === "shell_task" ||
      shellTaskMode === "terminal_workspace" ||
      expected.terminalWorkspaceShellTask ||
      expected.mode === "terminal_workspace" ||
      expected.checkMode === "terminal_workspace",
  );
}

function getRuntimePracticePatchForQuestion(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const stableKey = getStablePracticeQuestionKey(q);
  const runtime = useReviewRuntimeStore.getState();
  const exercises = runtime.exercises ?? {};

  const qAny = q as any;
  const needsTerminalEvidence = practiceQuestionNeedsTerminalEvidence(q);

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

        const scopeMatches =
            (!wantedTopic || valueTopicId === wantedTopic) &&
            (!wantedSubject || valueSubjectSlug === wantedSubject) &&
            (!wantedModule || valueModuleSlug === wantedModule) &&
            (!wantedSection || valueSectionSlug === wantedSection);

        if (!scopeMatches) return null;

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
        const terminalEvidence = normalizeTerminalEvidenceForPracticeSubmit(
            value.terminalEvidence,
        );

        return {
          key,
          value,
          score,
          hasIdentityMatch,
          hasActiveMatch,
          hasTerminalEvidence: Boolean(terminalEvidence),
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        };
      })
      .filter(Boolean);

  const rankedCandidates = candidates
      .sort((a: any, b: any) => {
        if (
            needsTerminalEvidence &&
            a.hasTerminalEvidence !== b.hasTerminalEvidence
        ) {
          return a.hasTerminalEvidence ? -1 : 1;
        }

        if (b.score !== a.score) return b.score - a.score;
        return b.updatedAt - a.updatedAt;
      });

  const found = rankedCandidates[0];

  if (!found) {
    const liveTerminalEvidence = needsTerminalEvidence
        ? getLiveTerminalEvidenceForPracticeSubmit([
            boundExerciseKey,
            activeExerciseKey,
            stableKey,
            ...Array.from(wantedIds),
          ])
        : null;

    if (!liveTerminalEvidence) return null;

    return {
      __runtimeStoreKey: boundExerciseKey || activeExerciseKey || stableKey,
      exerciseKey: qAny.fetch?.exerciseKey ?? qAny.exerciseKey ?? qAny.item?.exerciseKey,
      exerciseId: qAny.exercise?.id ?? qAny.item?.id,
      subjectSlug: qAny.fetch?.subject ?? qAny.subjectSlug,
      moduleSlug: qAny.fetch?.module ?? qAny.moduleSlug,
      sectionSlug: qAny.fetch?.section ?? qAny.sectionSlug,
      topicId: wantedTopic,
      code: "",
      source: "",
      stdin: "",
      codeStdin: "",
      lang: "bash",
      language: "bash",
      codeLang: "bash",
      terminalEvidence: liveTerminalEvidence,
      userEdited: true,
      workspaceOrigin: "user",
      updatedAt: Date.now(),
    };
  }

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

  /**
   * Always prefer the live Tools terminal evidence for shell tasks.
   *
   * The runtime store can already contain terminalEvidence from a previous
   * submit/step. If we only fall back when runtime evidence is missing, a stale
   * transcript can win even while the visible terminal has the correct latest
   * command. This is the browser-only gap that goldens cannot catch.
   */
  const liveTerminalEvidence = needsTerminalEvidence
      ? getLiveTerminalEvidenceForPracticeSubmit([
        boundExerciseKey,
        activeExerciseKey,
        stableKey,
        ...Array.from(wantedIds),
      ])
      : null;

  let terminalEvidence =
      liveTerminalEvidence ??
      normalizeTerminalEvidenceForPracticeSubmit(estate.terminalEvidence);

  if (!code.trim() && !terminalEvidence && !workspace) return null;

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
      submittedTerminalCommandCount:
          terminalEvidence?.commands?.length ?? 0,
      liveTerminalCommandCount:
          liveTerminalEvidence?.commands?.length ?? 0,
      runtimeTerminalCommandCount:
          normalizeTerminalEvidenceForPracticeSubmit(estate.terminalEvidence)
              ?.commands?.length ?? 0,
    });
  }

  return {
    __runtimeStoreKey: found.key,
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
    ...(terminalEvidence ? { terminalEvidence } : {}),
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
export function sanitizeSavedPracticePatch(savedPatch: any, exerciseKind?: string) {
  if (!savedPatch) return null;

  const next = { ...savedPatch };

  /**
   * Practice keys are short-lived signed transport tokens, not learner state.
   * A saved patch must never overwrite the fresh key returned by /api/practice.
   */
  delete next.key;
  delete next.sessionId;

  // Never let saved progress replace the freshly resolved exercise contract.
  // Old saved patches may contain an entire QItem, including item.exercise from
  // another topic/project step. Merging that object is what caused a stale
  // calculate_tip prompt to render while the editor had the new imports starter.
  delete next.exercise;
  delete next.title;
  delete next.prompt;
  delete next.hint;
  delete next.options;
  delete next.tokens;
  delete next.expected;
  delete next.starterCode;
  delete next.starterFiles;
  delete next.workspaceExpectations;
  delete next.recipe;
  delete next.help;
  delete next.tests;
  delete next.solutionCode;
  delete next.solutionFiles;
  delete next.messageBase;

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
  const practiceMeta = initialState?.practiceMeta ?? {};
  const qAny = q as any;

  const restoreKeys = Array.from(
      new Set(
          [
            stableKey,
            mayRestoreQuestionIdPatch(q, stableKey) ? q.id : null,
            qAny.fetch?.exerciseKey,
            qAny.fetch?.stepId,
            qAny.exerciseKey,
            qAny.stepId,
            qAny.sourceStepId,
            qAny.item?.exerciseKey,
            qAny.item?.id,
            qAny.exercise?.exerciseKey,
            qAny.exercise?.id,
          ]
              .map((value) => String(value ?? "").trim())
              .filter(Boolean),
      ),
  );

  for (const key of restoreKeys) {
    const found = practiceMeta[key];
    if (found) return found;
  }

  return null;
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

  return {
    ...prev,
    [stableKey]: nextState,
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

  const currentItem = normalizeCurrentPracticeItem(
      item,
      item?.exercise,
      item,
  );

  const isCodeInput = currentItem?.exercise?.kind === "code_input";
  const starterCode = String(currentItem?.exercise?.starterCode ?? "").trim();
  const expectedLanguage = getPracticeExerciseLanguage(currentItem?.exercise);

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
  delete patch.help;
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
    ...currentItem,
    ...patch,
    ...(workspace
        ? {
          workspace,
          codeWorkspace: workspace,
          ideWorkspace: workspace,
        }
        : {}),
  };

  const normalizedNext = normalizeCurrentPracticeItem(
      next,
      currentItem?.exercise,
      currentItem,
  );

  return stablePracticeJson(normalizedNext) === stablePracticeJson(currentItem)
      ? currentItem
      : normalizedNext;
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
        const questionIdentity = getPracticeQuestionIdentity(q);

        const existing =
            practiceRef.current?.[stableKey] ?? practiceRef.current?.[q.id];

        const alreadyResolved = doesPracticeStateMatchQuestion(existing, q);



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
          const reusablePrevState = doesPracticeStateMatchQuestion(prevState, q)
              ? prevState
              : null;

          const nextState: PracticeState = {
            loading: true,
            error: null,
            busy: false,
            exercise: reusablePrevState?.exercise ?? null,
            item: reusablePrevState?.item ?? null,
            attempts: initMeta?.attempts ?? reusablePrevState?.attempts ?? 0,
            ok: initMeta?.ok ?? reusablePrevState?.ok ?? null,
            maxAttempts: reusablePrevState?.maxAttempts ?? fallbackMax,
            helpPolicy: reusablePrevState?.helpPolicy ?? DEFAULT_PRACTICE_HELP_POLICY,
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

          const fetchSpec = ((q as any).fetch ?? {}) as Record<string, any>;

          const resolvedExerciseKey =
              fetchSpec.exerciseKey ??
              (q as any).exerciseKey ??
              (q as any).item?.exerciseKey ??
              (q as any).exercise?.exerciseKey ??
              (q as any).exercise?.id ??
              (q as any).item?.id ??
              undefined;

          const resolvedPreferKind = fetchSpec.preferKind ?? undefined;

          const resolvedPreferPurpose =
              fetchSpec.preferPurpose ??
              (resolvedExerciseKey && resolvedPreferKind === "code_input"
                  ? "project"
                  : "mixed");

          const loaded = await withTimeout(
              fetchResolvedPracticeItem({
                request: {
                  subject: fetchSpec.subject,
                  module: fetchSpec.module,
                  section: fetchSpec.section,
                  topic: fetchSpec.topic ? String(fetchSpec.topic) : "",
                  difficulty: fetchSpec.difficulty,
                  allowReveal: fetchSpec.allowReveal ? true : undefined,
                  preferKind: resolvedPreferKind,
                  salt: fetchSpec.salt ?? undefined,
                  preferPurpose: resolvedPreferPurpose,
                  purposePolicy: "fallback",

                  // Exact authored Try-it/code_input exercises must resolve from the
                  // topic bundle instead of falling through to random/generated practice.
                  exerciseKey: resolvedExerciseKey,
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
                normalizeCurrentPracticeItem(
                    loaded.item,
                    loaded.exercise,
                    loaded.item,
                ),
                savedPatch,
            );

            const nextState: PracticeState = {
              ...base,
              loading: false,
              error: null,
              exerciseKey: questionIdentity.exerciseKey || stableKey,
              topicId: questionIdentity.topicId,
              subjectSlug: questionIdentity.subjectSlug,
              moduleSlug: questionIdentity.moduleSlug,
              sectionSlug: questionIdentity.sectionSlug,
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
            const raf =
                typeof window !== "undefined"
                    ? window.requestAnimationFrame
                    : undefined;

            if (typeof raf === "function") {
              raf(() => resolve());
              return;
            }

            setTimeout(() => resolve(), 0);
          });

          const runtimePatch = getRuntimePracticePatchForQuestion(q) as (Record<string, any> | null);
          const runtimeStoreKey = String(runtimePatch?.__runtimeStoreKey ?? "").trim();
          const runtimePatchForSubmit = runtimePatch
              ? Object.fromEntries(
                  Object.entries(runtimePatch).filter(([patchKey]) => patchKey !== "__runtimeStoreKey"),
              )
              : null;

          if (runtimeStoreKey && runtimePatchForSubmit) {
            useReviewRuntimeStore.getState().patchExercise(runtimeStoreKey, {
              ...runtimePatchForSubmit,
              userEdited: true,
              workspaceOrigin: "user",
              updatedAt: Date.now(),
            } as any);
          }

          const itemForSubmit = runtimePatchForSubmit
              ? {
                ...ps.item,
                ...runtimePatchForSubmit,
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
                ...(runtimePatchForSubmit ?? {}),
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

            const prevHelp = current.item.help ?? {};
            const prevOpenedStepKeys = Array.isArray(prevHelp.openedStepKeys)
                ? prevHelp.openedStepKeys
                : [];

            const openedKeys = prevOpenedStepKeys.includes(stepKey)
                ? prevOpenedStepKeys
                : [...prevOpenedStepKeys, stepKey];

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
import { normalizeVisibleTerminalTranscriptText } from "@/lib/practice/visibleTerminalTranscript";
