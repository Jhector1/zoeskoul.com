"use client";

import React, {useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo} from "react";
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
import { buildReviewPracticeRevealCompletionPatch } from "@/components/review/quiz/reviewPracticeRevealCompletion";
import { getReviewSubmitBridgeHost } from "@/lib/review/submitBridge";

export { isEmptyPracticeAnswer } from "@/lib/practice/runtime";
export type PracticeState = PracticeItemState & {
  exerciseKey?: string;
  topicId?: string;
  subjectSlug?: string;
  moduleSlug?: string;
  sectionSlug?: string;
  runtimeGeneration?: number;
  finalized?: boolean;
};


const LOAD_TIMEOUT_MS = 60000;

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


function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
    onTimeout?: () => void,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, ms);

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

export function resolvedPracticeExerciseMatchesRequestedKey(
    exercise: unknown,
    requestedExerciseKey: unknown,
) {
  const requested = String(requestedExerciseKey ?? "").trim();
  if (!requested) return true;
  if (!exercise || typeof exercise !== "object") return false;

  const record = exercise as Record<string, unknown>;
  const candidates = [record.exerciseKey, record.id]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

  return candidates.some(
      (candidate) =>
          candidate === requested ||
          candidate.endsWith(`:${requested}`) ||
          requested.endsWith(`:${candidate}`),
  );
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

export function shouldTreatPatchAsRevealFill(patch: any) {
  return (
      patch?.updateOrigin === "reveal-fill" &&
      patch?.revealed === true &&
      patch?.submitted === true
  );
}

export function shouldTreatPatchAsExplicitFeedbackDismiss(
    currentItem: any,
    patch: any,
) {
  if (!currentItem || !patch) return false;

  const requestedDismiss =
      Boolean((patch as any).dismissFeedbackOnEdit) &&
      Boolean((patch as any).feedbackDismissed);

  if (!requestedDismiss) return false;

  /**
   * `feedbackDismissed` is transient UI state. Saved progress, starter
   * hydration, tool rebinds, and passive runtime sync can all carry answer
   * fields that differ from the current item, but they are not learner edits.
   * Only patches produced by an active input/change handler may dismiss the
   * visible wrong-answer feedback.
   */
  const learnerEditOrigin =
      (patch as any).updateOrigin === "user" ||
      (patch as any).workspaceOrigin === "user";

  if (!learnerEditOrigin) return false;

  return patchChangesLearnerAnswer(currentItem, patch);
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
  const win = getReviewSubmitBridgeHost();
  if (!win) return null;

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

type LiveWorkspaceSubmitSnapshot = {
  workspace: unknown;
  code: string;
  stdin: string;
  language: string;
  ownerKey?: string;
};

function normalizeLiveWorkspaceSubmitSnapshot(
    value: unknown,
): LiveWorkspaceSubmitSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const workspace = record.workspace ?? null;
  const code = String(record.code ?? record.source ?? "");
  const stdin = String(record.stdin ?? record.codeStdin ?? "");
  const language = String(
      record.language ?? record.lang ?? record.codeLang ?? "python",
  );

  if (!workspace && !code.trim()) return null;

  return {
    workspace,
    code,
    stdin,
    language,
    ...(typeof record.ownerKey === "string" && record.ownerKey.trim()
        ? { ownerKey: record.ownerKey.trim() }
        : {}),
  };
}

export function getLiveWorkspaceForPracticeSubmit(candidateKeys: string[]) {
  const win = getReviewSubmitBridgeHost();
  if (!win) return null;

  const seen = new Set<string>();
  for (const candidateKey of candidateKeys) {
    const key = String(candidateKey ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const snapshot = normalizeLiveWorkspaceSubmitSnapshot(
        win.__zoeGetWorkspaceBeforeSubmit?.[key]?.(),
    );
    if (snapshot) return snapshot;
  }

  return normalizeLiveWorkspaceSubmitSnapshot(
      win.__zoeGetAnyWorkspaceBeforeSubmit?.(),
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
  const liveWorkspaceSnapshot = getLiveWorkspaceForPracticeSubmit([
    boundExerciseKey,
    activeExerciseKey,
    stableKey,
    ...Array.from(wantedIds),
  ]);

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

    if (!liveTerminalEvidence && !liveWorkspaceSnapshot) return null;

    return {
      __runtimeStoreKey:
          liveWorkspaceSnapshot?.ownerKey ||
          boundExerciseKey ||
          activeExerciseKey ||
          stableKey,
      exerciseKey: qAny.fetch?.exerciseKey ?? qAny.exerciseKey ?? qAny.item?.exerciseKey,
      exerciseId: qAny.exercise?.id ?? qAny.item?.id,
      subjectSlug: qAny.fetch?.subject ?? qAny.subjectSlug,
      moduleSlug: qAny.fetch?.module ?? qAny.moduleSlug,
      sectionSlug: qAny.fetch?.section ?? qAny.sectionSlug,
      topicId: wantedTopic,
      code: liveWorkspaceSnapshot?.code ?? "",
      source: liveWorkspaceSnapshot?.code ?? "",
      stdin: liveWorkspaceSnapshot?.stdin ?? "",
      codeStdin: liveWorkspaceSnapshot?.stdin ?? "",
      lang: liveWorkspaceSnapshot?.language ?? "bash",
      language: liveWorkspaceSnapshot?.language ?? "bash",
      codeLang: liveWorkspaceSnapshot?.language ?? "bash",
      ...(liveWorkspaceSnapshot?.workspace
          ? {
              workspace: liveWorkspaceSnapshot.workspace,
              codeWorkspace: liveWorkspaceSnapshot.workspace,
              ideWorkspace: liveWorkspaceSnapshot.workspace,
            }
          : {}),
      ...(liveTerminalEvidence ? { terminalEvidence: liveTerminalEvidence } : {}),
      userEdited: true,
      workspaceOrigin: "user",
      updatedAt: Date.now(),
    };
  }

  const estate = found.value;

  const workspace =
      liveWorkspaceSnapshot?.workspace ??
      estate.workspace ??
      estate.codeWorkspace ??
      estate.ideWorkspace ??
      null;

  const workspaceCode = getWorkspaceEntryCodeForPracticeBank(workspace);

  const code =
      liveWorkspaceSnapshot?.code?.trim().length
          ? liveWorkspaceSnapshot.code
          : workspaceCode.trim().length > 0
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
      liveWorkspaceSnapshot
          ? liveWorkspaceSnapshot.stdin
          : typeof workspace?.stdin === "string"
          ? workspace.stdin
          : typeof estate.codeStdin === "string"
              ? estate.codeStdin
              : typeof estate.stdin === "string"
                  ? estate.stdin
                  : "";

  const lang =
      liveWorkspaceSnapshot?.language ||
      (typeof workspace?.language === "string"
          ? workspace.language
          : typeof estate.codeLang === "string"
              ? estate.codeLang
              : typeof estate.lang === "string"
                  ? estate.lang
                  : typeof estate.language === "string"
                      ? estate.language
                      : "python");

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
      liveWorkspaceOwnerKey: liveWorkspaceSnapshot?.ownerKey ?? null,
      usedLiveWorkspace: Boolean(liveWorkspaceSnapshot),
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

  /**
   * feedbackDismissed=true for a wrong checked result is transient UI state.
   * Do not let an old persisted dismissal keep the latest incorrect feedback
   * hidden after restore.
   */
  if (next.result?.ok === false && next.feedbackDismissed === true) {
    delete next.feedbackDismissed;
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

function buildPracticeLoadFailureKey(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
) {
  const anyQ = q as any;
  const fetch = anyQ.fetch ?? {};

  return stablePracticeJson({
    stableKey: getStablePracticeQuestionKey(q),
    questionId: q.id,
    subject: fetch.subject ?? fetch.subjectSlug ?? anyQ.subjectSlug ?? null,
    module: fetch.module ?? fetch.moduleSlug ?? anyQ.moduleSlug ?? null,
    section: fetch.section ?? fetch.sectionSlug ?? anyQ.sectionSlug ?? null,
    topic: fetch.topic ?? fetch.topicId ?? anyQ.topicId ?? anyQ.topic ?? null,
    exerciseKey:
        fetch.exerciseKey ??
        anyQ.exerciseKey ??
        anyQ.item?.exerciseKey ??
        anyQ.exercise?.exerciseKey ??
        anyQ.exercise?.id ??
        anyQ.item?.id ??
        null,
    preferKind: fetch.preferKind ?? anyQ.preferKind ?? null,
    preferPurpose: fetch.preferPurpose ?? anyQ.preferPurpose ?? null,
    seedPolicy: fetch.seedPolicy ?? null,
    salt: fetch.salt ?? null,
    resetSafeVersion: "practice-load-v1",
  });
}

function normalizePracticeValueForNoopCompare(
    value: unknown,
    seen: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePracticeValueForNoopCompare(entry, seen));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    /**
     * Runtime/editor timestamps are ordering metadata, not learner answer data.
     * Rehydrating the same saved patch with a newer timestamp must not create a
     * new practice item and restart the load effect forever.
     */
    if (key === "updatedAt") continue;

    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) continue;

    normalized[key] = normalizePracticeValueForNoopCompare(entry, seen);
  }

  seen.delete(value);
  return normalized;
}

export function stablePracticeItemJsonForNoopCompare(value: unknown) {
  return stablePracticeJson(
      normalizePracticeValueForNoopCompare(value, new WeakSet<object>()),
  );
}

function hasNonBlankSqlSignal(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function getPracticeExerciseLanguage(exercise: any) {
  if (!exercise || exercise.kind !== "code_input") return null;

  const isSql =
      exercise.language === "sql" ||
      hasNonBlankSqlSignal(exercise?.fixedSqlDialect) ||
      hasNonBlankSqlSignal(exercise?.runtime?.datasetId) ||
      hasNonBlankSqlSignal(exercise?.sqlDatasetId) ||
      hasNonBlankSqlSignal(exercise?.sqlSchemaSql) ||
      hasNonBlankSqlSignal(exercise?.sqlSeedSql) ||
      hasNonBlankSqlSignal(exercise?.sqlSetupSql);

  return isSql
      ? "sql"
      : normalizeWorkspaceLanguage(exercise.language ?? "python");
}


export function mergeSavedPatchIntoPracticeItem(item: any, savedPatch: any) {
  if (!item || !savedPatch) return item;

  const currentItem = normalizeCurrentPracticeItem(
      item,
      item?.exercise,
      item,
  );

  const sanitizedSavedPatch = sanitizeSavedPracticePatch(
      savedPatch,
      currentItem?.exercise?.kind,
  );

  if (!sanitizedSavedPatch) return item;

  const isCodeInput = currentItem?.exercise?.kind === "code_input";
  const starterCode = String(currentItem?.exercise?.starterCode ?? "").trim();
  const expectedLanguage = getPracticeExerciseLanguage(currentItem?.exercise);

  const userEdited =
      sanitizedSavedPatch.userEdited === true ||
      sanitizedSavedPatch.workspaceOrigin === "user" ||
      sanitizedSavedPatch.workspaceOrigin === "saved";

  const patch = { ...sanitizedSavedPatch };
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

  const currentItemKey = stablePracticeItemJsonForNoopCompare(currentItem);
  const normalizedNextKey = stablePracticeItemJsonForNoopCompare(normalizedNext);

  if (normalizedNextKey !== currentItemKey) {
    return normalizedNext;
  }

  /**
   * normalizeCurrentPracticeItem returns a fresh object even when the live item
   * was already normalized. Return the caller's original reference for a true
   * semantic no-op so setPractice(prev => prev) can break restore/load loops.
   */
  return stablePracticeItemJsonForNoopCompare(item) === currentItemKey
      ? item
      : currentItem;
}

export function useQuizPracticeBank(args: {
  questions: ReviewQuestion[];
  spec: ReviewQuizSpec;
  unlimitedAttempts: boolean;
  initialState: SavedQuizState | null;
  resetKey: string;
  isCompleted: boolean;
  locked: boolean;

  /**
   * Loading every practice question in a card at once creates a burst of
   * /api/practice requests, DB instance inserts, and signed-key work. The
   * visible editor/exercise only needs the active question now; nearby questions
   * can be warmed after idle time.
   *
   * Omit these props to preserve the old eager-all behavior for tests or
   * callers that render every question at once.
   */
  activeQuestionIds?: string[];
  prefetchQuestionIds?: string[];
}) {
  const {
    questions,
    spec,
    unlimitedAttempts,
    initialState,
    resetKey,
    isCompleted,
    locked,
    activeQuestionIds,
    prefetchQuestionIds,
  } = args;

  const specMaxAttempts = (spec as any).maxAttempts;

  const activeQuestionIdsKey = useMemo(
      () => stablePracticeJson(activeQuestionIds ?? null),
      [activeQuestionIds],
  );
  const prefetchQuestionIdsKey = useMemo(
      () => stablePracticeJson(prefetchQuestionIds ?? null),
      [prefetchQuestionIds],
  );

  const tt = useTaggedT();
  const rawKeyRef = useRef<(key: string) => string>((key) => key);
  const resolveTextRef = useRef<(value: string) => string>((value) => value);

  rawKeyRef.current = (key: string) => tt.raw(key, key);
  resolveTextRef.current = (value: string) => tt.resolve(value, value);

  const initialStateRef = useRef(initialState);
  const questionsRef = useRef(questions);

  initialStateRef.current = initialState;
  questionsRef.current = questions;

  const initialPracticePatchKey = useMemo(
      () => stablePracticeItemJsonForNoopCompare(
          initialState?.practiceItemPatch ?? {},
      ),
      [initialState?.practiceItemPatch],
  );
  const practiceQuestionsKey = useMemo(
      () => stablePracticeItemJsonForNoopCompare(
          questions.filter((question) => question.kind === "practice"),
      ),
      [questions],
  );

  const [practice, setPractice] = useState<Record<string, PracticeState>>({});
  const practiceRef = useRef(practice);
  const renderedResetKeyRef = useRef(resetKey);

  /**
   * A module/topic/card reset clears the canonical runtime store while this hook
   * can remain mounted. During the first render after reset, React has not run
   * effects yet, so returning the previous practice item would let
   * QuizPracticeCard immediately seed the old user workspace back into the
   * cleared runtime. Hide that stale state synchronously for the new reset key.
   */
  const visiblePractice: Record<string, PracticeState> =
      renderedResetKeyRef.current === resetKey ? practice : {};

  const loadTokenRef = useRef<Record<string, number>>({});
  const loadFailureKeyRef = useRef<Record<string, string>>({});
  const loadCycleRef = useRef(0);

  const idToStableKeyRef = useRef<Record<string, string>>({});

  useEffect(() => {
    loadFailureKeyRef.current = {};
  }, [resetKey]);

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

  useLayoutEffect(() => {
    renderedResetKeyRef.current = resetKey;
    loadCycleRef.current += 1;
    practiceRef.current = {};
    setPractice({});
    padRefs.current = {};
    loadTokenRef.current = {};
  }, [resetKey]);

  useEffect(() => {
    const savedState = initialStateRef.current;
    if (!savedState?.practiceItemPatch) return;

    setPractice((prev) => {
      let next = prev;
      let changed = false;

      for (const q of questionsRef.current) {
        if (q.kind !== "practice") continue;

        const stableKey = getStablePracticeQuestionKey(q);
        const savedPatch = getSavedPracticePatch(savedState, q);

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
  }, [initialPracticePatchKey, practiceQuestionsKey]);

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

        const loadFailureKey = buildPracticeLoadFailureKey(q);

        if (force) {
          delete loadFailureKeyRef.current[stableKey];
        } else if (loadFailureKeyRef.current[stableKey] === loadFailureKey) {
          return existing ?? null;
        }

        if (!force && alreadyResolved) {
          const savedPatch = getSavedPracticePatch(initialStateRef.current, q);

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

          return existing;
        }

        const token = (loadTokenRef.current[stableKey] ?? 0) + 1;
        loadTokenRef.current[stableKey] = token;

        const initMeta = getSavedPracticeMeta(initialStateRef.current, q);
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
            finalized:
                initMeta?.finalized ?? reusablePrevState?.finalized ?? false,
            // The experience policy is authoritative. A saved finite cap must
            // not survive when Daily Practice, Challenge, or subscriber
            // practice switches the current run to unlimited attempts.
            maxAttempts: unlimitedAttempts
              ? null
              : reusablePrevState?.maxAttempts ?? fallbackMax,
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
            savedPatch: summarizeExercisePatch(getSavedPracticePatch(initialStateRef.current, q)),
            existingItem: summarizeExercisePatch(existing?.item),
          });

          const fetchSpec = ((q as any).fetch ?? {}) as Record<string, any>;
          const startedGeneration = useReviewRuntimeStore.getState().resetRevision;

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

          const fetchCtrl = typeof AbortController !== "undefined" ? new AbortController() : null;

          const loaded = await withTimeout(
              fetchResolvedPracticeItem({
                signal: fetchCtrl?.signal,
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
                    getSavedPracticePatch(initialStateRef.current, q),
                    resolvedPreferKind,
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
              () => fetchCtrl?.abort(),
          );

          if (
              resolvedExerciseKey &&
              !resolvedPracticeExerciseMatchesRequestedKey(
                  loaded.exercise,
                  resolvedExerciseKey,
              )
          ) {
            throw new Error(
                `Practice exercise identity mismatch: requested "${resolvedExerciseKey}" but received "${String((loaded.exercise as any)?.exerciseKey ?? (loaded.exercise as any)?.id ?? "unknown")}".`,
            );
          }

          reviewDebug("7_RESTORE_LOADED useQuizPracticeBank.loadPracticeQuestion", {
            qid: q.id,
            stableKey,
            loadedItem: summarizePracticePatch(loaded.item),
            savedPatch: summarizePracticePatch(getSavedPracticePatch(initialStateRef.current, q)),
          });

          if (cancelledRef?.current) return;
          if (loadCycleRef.current !== cycle) return;
          if (loadTokenRef.current[stableKey] !== token) return;
          if (useReviewRuntimeStore.getState().resetRevision !== startedGeneration) return;

          const baseForLoaded =
              practiceRef.current[stableKey] ??
              practiceRef.current[q.id] ??
              ({
                loading: false,
                error: null,
                busy: false,
                exercise: null,
                item: null,
                attempts: 0,
                ok: null,
                finalized: false,
                maxAttempts: fallbackMax,
                helpPolicy: DEFAULT_PRACTICE_HELP_POLICY,
              } as PracticeState);

          const meta = getSavedPracticeMeta(initialStateRef.current, q);
          const savedPatch = getSavedPracticePatch(initialStateRef.current, q);
          const nextItem = mergeSavedPatchIntoPracticeItem(
              normalizeCurrentPracticeItem(
                  loaded.item,
                  loaded.exercise,
                  loaded.item,
              ),
              savedPatch,
          );

          const nextState: PracticeState = {
            ...baseForLoaded,
            loading: false,
            error: null,
            runtimeGeneration: startedGeneration,
            exerciseKey: questionIdentity.exerciseKey || stableKey,
            topicId: questionIdentity.topicId,
            subjectSlug: questionIdentity.subjectSlug,
            moduleSlug: questionIdentity.moduleSlug,
            sectionSlug: questionIdentity.sectionSlug,
            exercise: loaded.exercise,
            item: nextItem,
            attempts: meta?.attempts ?? baseForLoaded.attempts ?? 0,
            ok: meta?.ok ?? baseForLoaded.ok ?? null,
            finalized:
                meta?.finalized ??
                Boolean(
                    (nextItem.result as any)?.finalized === true ||
                    nextItem.revealed === true ||
                    (nextItem.result as any)?.revealUsed === true ||
                    (nextItem.result as any)?.revealAnswer != null ||
                    baseForLoaded.finalized,
                ),
            maxAttempts: unlimitedAttempts
              ? null
              : loaded.maxAttempts ?? baseForLoaded.maxAttempts ?? null,
            helpPolicy:
                loaded.helpPolicy ??
                baseForLoaded.helpPolicy ??
                DEFAULT_PRACTICE_HELP_POLICY,
          };

          // D_SQL_LOOP_GUARD_SUCCESS_CLEAR
          delete loadFailureKeyRef.current[stableKey];

          exerciseDebug("D_useQuizPracticeBank_setPractice_loaded", {
            qid: q.id,
            stableKey,
            selectedKeyWillWrite: stableKey,
            alsoWritesQId: q.id !== stableKey,
            exerciseKind: loaded.exercise?.kind,
            loadedItem: summarizeExercisePatch(loaded.item),
            savedPatchAtSet: summarizeExercisePatch(savedPatch),
            previousItem: summarizeExercisePatch(baseForLoaded.item),
            nextItem: summarizeExercisePatch(nextState.item),
          });

          setPractice((prev) => setPracticeForQuestion(prev, q, nextState));
          return nextState;
        } catch (e: any) {
          if (cancelledRef?.current) return;
          if (loadCycleRef.current !== cycle) return;
          if (loadTokenRef.current[stableKey] !== token) return;

          loadFailureKeyRef.current[stableKey] = loadFailureKey;

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
          return null;
        }
      },
      [specMaxAttempts, unlimitedAttempts],
  );

  useEffect(() => {
    const currentQuestions = questionsRef.current;
    if (!currentQuestions.length) return;

    const cancelledRef = { current: false };

    const practiceQuestions = currentQuestions.filter(
        (q): q is Extract<ReviewQuestion, { kind: "practice" }> => q.kind === "practice",
    );

    const byAnyId = new Map<string, Extract<ReviewQuestion, { kind: "practice" }>>();
    for (const q of practiceQuestions) {
      byAnyId.set(q.id, q);
      byAnyId.set(getStablePracticeQuestionKey(q), q);
    }

    const pickQuestions = (ids: string[] | undefined) => {
      if (!ids?.length) return [];
      const out: Extract<ReviewQuestion, { kind: "practice" }>[] = [];
      const seen = new Set<string>();

      for (const id of ids) {
        const q = byAnyId.get(String(id ?? "").trim());
        if (!q) continue;

        const key = getStablePracticeQuestionKey(q);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(q);
      }

      return out;
    };

    const immediate = activeQuestionIds?.length
        ? pickQuestions(activeQuestionIds)
        : practiceQuestions;

    for (const q of immediate) {
      void loadPracticeQuestion(q, { cancelledRef });
    }

    const prefetch = pickQuestions(prefetchQuestionIds).filter((q) => {
      const key = getStablePracticeQuestionKey(q);
      return !immediate.some((activeQ) => getStablePracticeQuestionKey(activeQ) === key);
    });

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (prefetch.length && activeQuestionIds?.length) {
      const runPrefetch = () => {
        if (cancelledRef.current) return;
        for (const q of prefetch) {
          void loadPracticeQuestion(q, { cancelledRef });
        }
      };

      const idleApi = typeof globalThis !== "undefined" ? (globalThis as any) : null;
      if (idleApi && typeof idleApi.requestIdleCallback === "function") {
        idleHandle = idleApi.requestIdleCallback(runPrefetch, { timeout: 1600 }) as number;
      } else if (typeof setTimeout === "function") {
        timeoutHandle = setTimeout(runPrefetch, 600);
      }
    }

    return () => {
      cancelledRef.current = true;
      const idleApi = typeof globalThis !== "undefined" ? (globalThis as any) : null;
      if (idleHandle != null && idleApi && typeof idleApi.cancelIdleCallback === "function") {
        idleApi.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null && typeof clearTimeout === "function") {
        clearTimeout(timeoutHandle);
      }
    };
  }, [
    practiceQuestionsKey,
    loadPracticeQuestion,
    resetKey,
    activeQuestionIdsKey,
    prefetchQuestionIdsKey,
  ]);

  const retryPracticeQuestion = useCallback(
      async (id: string) => {
        const q = resolveQuestionByAnyId(questionsRef.current, id);
        if (!q) return;

        await loadPracticeQuestion(q, { force: true });
      },
      [practiceQuestionsKey, loadPracticeQuestion],
  );

  const updatePracticeItem = useCallback(
      (id: string, patch: Partial<QItem>) => {
        const q = resolveQuestionByAnyId(questionsRef.current, id);
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
          const explicitUserDismiss = shouldTreatPatchAsExplicitFeedbackDismiss(
              ps.item,
              patch,
          );
          const explicitRevealFill = shouldTreatPatchAsRevealFill(patch);

          const patchForItem = { ...(patch as any) };
          delete patchForItem.dismissFeedbackOnEdit;

          if (!explicitUserDismiss && !explicitRevealFill) {
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
                  : explicitUserDismiss || explicitRevealFill
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
            finalized:
                Boolean(
                    ps.finalized ||
                    explicitRevealFill ||
                    (nextItem.result as any)?.finalized === true ||
                    nextItem.revealed === true ||
                    (nextItem.result as any)?.revealUsed === true ||
                    ((nextItem.result as any)?.revealAnswer != null),
                ),
          };

          if (
              nextState.ok === ps.ok &&
              stablePracticeItemJsonForNoopCompare(nextItem) ===
              stablePracticeItemJsonForNoopCompare(ps.item)
          ) {
            return prev;
          }

          if (q) {
            return setPracticeForQuestion(prev, q, nextState);
          }

          return {
            ...prev,
            [key]: nextState,
          };
        });
      },
      [],
  );

  const submitPractice = useCallback(
      async (q: Extract<ReviewQuestion, { kind: "practice" }>) => {
        if (isCompleted || locked) return;

        const key = getStablePracticeQuestionKey(q);
        let ps = practice[key] ?? practice[q.id];

        if (!ps || ps.busy) return;

        /**
         * The editor/exercise shell is allowed to be ready from the manifest
         * before /api/practice finishes issuing the signed validation key.
         * On the first Check click, resolve that key and continue with the same
         * submit instead of making the learner wait or click twice.
         */
        if (
            ps.loading ||
            !ps.item ||
            !ps.exercise ||
            !String((ps.item as any)?.key ?? "").trim()
        ) {
          const loadedState = await loadPracticeQuestion(q, { force: true });
          ps =
              loadedState ??
              practiceRef.current[key] ??
              practiceRef.current[q.id] ??
              ps;
        }

        if (
            !ps ||
            ps.busy ||
            !ps.item ||
            !ps.exercise ||
            !String((ps.item as any)?.key ?? "").trim()
        ) return;

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
          const startedGeneration = useReviewRuntimeStore.getState().resetRevision;
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
            if (useReviewRuntimeStore.getState().resetRevision !== startedGeneration) return;
            useReviewRuntimeStore.getState().patchExercise(runtimeStoreKey, {
              ...runtimePatchForSubmit,
              generation: startedGeneration,
              userEdited: true,
              workspaceOrigin: "user",
              updateOrigin: "quiz-practice-submit",
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
              finalized: submitted.finalized,
              maxAttempts: unlimitedAttempts
                ? null
                : submitted.serverMaxAttempts ?? current.maxAttempts ?? null,
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
        const ps = visiblePractice[key] ?? visiblePractice[q.id];

        if (!ps || ps.loading || ps.busy || !ps.item || !ps.exercise) return;
        if (ps.ok === true || (ps.item.result as any)?.ok === true) return;
        if (
          ps.item.revealed === true ||
          (ps.item.result as any)?.revealUsed === true ||
          (ps.item.result as any)?.revealAnswer != null
        ) return;

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

            /**
             * Backward-compatible repair for progress saved before reveal
             * finalization was copied onto the item. A persisted reveal entry
             * is sufficient evidence that the server finalized the question.
             */
            const revealCompletionPatch = existing.reveal
                ? buildReviewPracticeRevealCompletionPatch({
                  current: current.item,
                  response: {
                    reveal: existing.reveal,
                    finalized: true,
                  },
                })
                : null;

            const nextState: PracticeState = {
              ...current,
              finalized: revealCompletionPatch ? true : current.finalized,
              ok:
                  revealCompletionPatch &&
                  typeof (revealCompletionPatch.result as any)?.ok === "boolean"
                      ? Boolean((revealCompletionPatch.result as any).ok)
                      : current.ok,
              item: {
                ...current.item,
                ...(revealCompletionPatch ?? {}),
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

            const revealCompletionPatch =
                buildReviewPracticeRevealCompletionPatch({
                  current: current.item,
                  response: opened.data,
                });

            const nextState: PracticeState = {
              ...current,
              busy: false,
              finalized: revealCompletionPatch ? true : current.finalized,
              ok:
                  revealCompletionPatch &&
                  typeof (revealCompletionPatch.result as any)?.ok === "boolean"
                      ? Boolean((revealCompletionPatch.result as any).ok)
                      : current.ok,
              item: {
                ...current.item,
                ...(revealCompletionPatch ?? {}),
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
      [visiblePractice, isCompleted, locked, loadPracticeQuestion],  );

  function isPracticeChecked(q: Extract<ReviewQuestion, { kind: "practice" }>) {
    const key = getStablePracticeQuestionKey(q);
    const ps = visiblePractice[key] ?? visiblePractice[q.id];

    return Boolean(ps && ps.attempts > 0);
  }

  return {
    practice: visiblePractice,
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
