"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReviewQuestion } from "@/lib/subjects/types";
import type { PracticeState } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import { isEmptyPracticeAnswer } from "@/components/review/quiz/hooks/useQuizPracticeBank";
import type { VectorPadState } from "@/components/vectorpad/types";

import ExerciseRenderer from "@/components/practice/ExerciseRenderer";
import { resolveCodeSurface } from "@/components/practice/workspaceExercise";
import {
  shouldSkipEmbeddedEnsureExercise,
} from "@/components/practice/ExerciseRenderer";
import { exerciseDebug, summarizeExercisePatch } from "@/components/review/module/runtime/exerciseDebug";
import PracticeHelpPanel from "@/components/practice/PracticeHelpPanel";
import { useOptionalReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import { getExerciseStateKey } from "@/components/review/module/runtime/exerciseKeys";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import {
  normalizeWorkspaceLanguage,
  stateLanguageMatches,
} from "@/components/review/module/runtime/workspaceCodeSource";
import { resolveExerciseWorkspace } from "@/components/review/module/runtime/exerciseWorkspaceResolver";
import { normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";

import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import type { Exercise } from "@/lib/practice/types";
import {
  DEFAULT_PRACTICE_HELP_POLICY,
  getNextPracticeHelpStepKey,
  PRACTICE_HELP_STEP_DEF_MAP,
} from "@/lib/practice/help/steps";
import { normalizeCurrentPracticeItem } from "@/lib/practice/runtime";
import { deriveEntryCode } from "@/components/review/module/runtime/exerciseWorkspaceResolver";
import { createManifestWorkspaceDefinition } from "@/components/review/module/runtime/resolveWorkspaceForTarget";
import { mergeLearningIdeConfigs } from "@/lib/ide/learningIdeConfig";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import {
  cleanStarterCode,
  firstUsableStarterFilesValue,
  pickEntryFileFromStarterFilesValue,
  starterFileContentForPath,
} from "@/components/review/module/runtime/starterContent";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";

function uniqueTruthyStrings(values: Array<unknown>) {
  return Array.from(
      new Set(
          values
              .map((value) => String(value ?? "").trim())
              .filter(Boolean),
      ),
  );
}


function buildCheckFeedbackFromResult(
  result: any,
  labels: { checkAnswerTryAgain: string; notCorrectYet: string },
): CodeFeedback | null {
  if (!result || typeof result !== "object") return null;

  const authored = result.feedback;
  if (authored && typeof authored === "object") {
    return {
      ...(authored as CodeFeedback),
      source: "check",
    };
  }

  const explanation =
      typeof result.explanation === "string" && result.explanation.trim().length > 0
          ? result.explanation.trim()
          : typeof result.message === "string" && result.message.trim().length > 0
              ? result.message.trim()
              : labels.checkAnswerTryAgain;

  return {
    area: "code",
    source: "check",
    kind: "logic",
    tone: "warning",
    title: labels.notCorrectYet,
    message: explanation,
  };
}

function patchTerminalEvidenceForSubmit(args: {
  boundId?: string | null;
  terminalEvidence: unknown;
}) {
  if (!args.terminalEvidence || typeof window === "undefined") return;

  const store = useReviewRuntimeStore.getState();
  const candidateKeys = uniqueTruthyStrings([
    args.boundId,
    store.tool?.boundExerciseKey,
    store.activeExerciseKey,
  ]);

  for (const key of candidateKeys) {
    store.patchExercise(key, {
      terminalEvidence: args.terminalEvidence,
      userEdited: true,
      updateOrigin: "user",
      workspaceOrigin: "user",
      submitted: false,
      feedbackDismissed: true,
      dismissFeedbackOnEdit: true,
      updatedAt: Date.now(),
    } as any);
  }
}

export async function flushReviewToolsBeforeSubmit(
    tools:
        | {
      flushLatest?: () => void | Promise<void>;
      boundId?: string | null;
    }
        | null
        | undefined,
) {
  const boundId = tools?.boundId ?? null;

  if (typeof window !== "undefined") {
    const win = window as typeof window & {
      __zoeFlushTerminalBeforeSubmit?: Record<
          string,
          () => Promise<boolean | void>
      >;
      __zoeFlushAnyTerminalBeforeSubmit?: () => Promise<boolean | void>;
      __zoeGetTerminalEvidenceBeforeSubmit?: Record<string, () => unknown>;
      __zoeGetAnyTerminalEvidenceBeforeSubmit?: () => unknown;
    };

    const boundFlush =
        boundId && win.__zoeFlushTerminalBeforeSubmit
            ? win.__zoeFlushTerminalBeforeSubmit[boundId]
            : null;

    if (boundFlush) {
      await boundFlush();
    } else {
      await win.__zoeFlushAnyTerminalBeforeSubmit?.();
    }

    const liveTerminalEvidence =
        (boundId ? win.__zoeGetTerminalEvidenceBeforeSubmit?.[boundId]?.() : null) ??
        win.__zoeGetAnyTerminalEvidenceBeforeSubmit?.() ??
        null;
    patchTerminalEvidenceForSubmit({
      boundId,
      terminalEvidence: liveTerminalEvidence,
    });
  }

  await tools?.flushLatest?.();

  // Give React/store state one tick to receive the merged terminal snapshot
  // before the validate request is built. Vitest does not always provide
  // requestAnimationFrame, so fall back to setTimeout for tests/server-like envs.
  await new Promise<void>((resolve) => {
    const raf =
        typeof window !== "undefined" ? window.requestAnimationFrame : undefined;

    if (typeof raf === "function") {
      raf(() => resolve());
      return;
    }

    setTimeout(() => resolve(), 0);
  });

  // One more flush after the terminal snapshot tick catches mkdir/touch changes
  // emitted by FullIDE just after the first terminal sync promise resolves.
  await tools?.flushLatest?.();

  if (typeof window !== "undefined" && boundId) {
    const win = window as typeof window & {
      __zoeGetTerminalEvidenceBeforeSubmit?: Record<string, () => unknown>;
      __zoeGetAnyTerminalEvidenceBeforeSubmit?: () => unknown;
    };

    const liveTerminalEvidence =
        win.__zoeGetTerminalEvidenceBeforeSubmit?.[boundId]?.() ??
        win.__zoeGetAnyTerminalEvidenceBeforeSubmit?.() ??
        null;
    patchTerminalEvidenceForSubmit({
      boundId,
      terminalEvidence: liveTerminalEvidence,
    });
  }
}

const LOADING_TIMEOUT_MS = 30000;

function cleanPracticeSlotPart(value: unknown) {
  return String(value ?? "")
      .trim()
      .replace(/[:\s]+/g, "-");
}
function getStableExerciseSlotId(
    q: Extract<ReviewQuestion, { kind: "practice" }>,
    projectStepManifest?: unknown,
) {
  const anyQ = q as any;
  const fetch = anyQ.fetch ?? {};
  const step = isRecord(projectStepManifest) ? projectStepManifest : null;

  const stepExerciseKey =
      typeof step?.exerciseKey === "string" && step.exerciseKey.trim()
          ? step.exerciseKey.trim()
          : "";

  const stepId =
      typeof step?.id === "string" && step.id.trim()
          ? step.id.trim()
          : "";

  /**
   * Return the raw exercise id only.
   *
   * Do NOT return subject:module:section:topic:exercise here because callers
   * already wrap this value with getExerciseStateKey(...). Returning a scoped
   * value here causes double-scoped exercise keys and breaks registry/route
   * matching, which makes Tools fall back to blank/card starter state.
   */
  return String(
      stepExerciseKey ||
      fetch.exerciseKey ||
      anyQ.exerciseKey ||
      anyQ.item?.exerciseKey ||
      anyQ.exercise?.exerciseKey ||
      anyQ.exercise?.id ||
      fetch.stepId ||
      anyQ.stepId ||
      anyQ.sourceStepId ||
      stepId ||
      anyQ.item?.id ||
      anyQ.key ||
      q.id ||
      "",
  ).trim();
}
function getWorkspaceEntryCodeForPracticeCard(workspace: any) {
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

function getWorkspaceFromAnyState(value: any): WorkspaceStateV2 | null {
  if (value?.workspace?.version === 2) return value.workspace as WorkspaceStateV2;
  if (value?.codeWorkspace?.version === 2) return value.codeWorkspace as WorkspaceStateV2;
  if (value?.ideWorkspace?.version === 2) return value.ideWorkspace as WorkspaceStateV2;
  return null;
}

function workspaceHasNonBlankFileForPracticeCard(workspace: any) {
  if (
      !workspace ||
      typeof workspace !== "object" ||
      workspace.version !== 2 ||
      !Array.isArray(workspace.nodes)
  ) {
    return false;
  }

  return workspace.nodes.some((node: any) => {
    return node?.kind === "file" && String(node.content ?? "").trim().length > 0;
  });
}

function isLearnerOwnedPracticeSnapshot(value: any) {
  if (!value || typeof value !== "object") return false;

  const origin = String(value.workspaceOrigin ?? "").trim().toLowerCase();
  const workspace = getWorkspaceFromAnyState(value);
  const hasContent =
      workspaceHasNonBlankFileForPracticeCard(workspace) ||
      firstNonBlankString(value.code, value.source).trim().length > 0;

  if ((value.result as any)?.ok === true || value.correct === true || value.status === "completed") {
    return true;
  }

  if (value.userEdited === true) return true;
  if (origin === "user" || origin === "restored" || origin === "reveal-fill") return true;

  // Treat saved blank shells as passive. Older starter bugs could persist
  // workspaceOrigin="saved" without real learner work, and letting those
  // snapshots fight ensureExercise causes starter/runtime oscillation.
  if (origin === "saved") return hasContent;

  return false;
}

export function workspaceStableKey(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return "null";
  }

  const folderPathById = new Map<string, string>();
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of workspace.nodes as any[]) {
      if (!node || node.kind !== "folder") continue;

      const id = String(node.id ?? "");
      if (!id || folderPathById.has(id)) continue;

      const name = String(node.name ?? "");
      const parentId = node.parentId == null ? null : String(node.parentId);
      if (parentId && !folderPathById.has(parentId)) continue;

      const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
      folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
      changed = true;
    }
  }

  const nodePath = (node: any) => {
    const name = String(node?.name ?? "");
    const parentId = node?.parentId == null ? null : String(node.parentId);
    const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
    return parentPath ? `${parentPath}/${name}` : name;
  };

  const files = (workspace.nodes as any[])
      .filter((node) => node?.kind === "file")
      .map((node) => ({
        path: nodePath(node),
        content: String(node.content ?? ""),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

  const activeNode = (workspace.nodes as any[]).find(
      (node) => node?.kind === "file" && node.id === workspace.activeFileId,
  );
  const entryNode = (workspace.nodes as any[]).find(
      (node) => node?.kind === "file" && node.id === workspace.entryFileId,
  );

  return JSON.stringify({
    version: 2,
    language: workspace.language ?? null,
    stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
    activePath: activeNode ? nodePath(activeNode) : null,
    entryPath: entryNode ? nodePath(entryNode) : null,
    files,
  });
}

function hasNonBlankSqlSignal(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function getManifestExerciseLanguage(exercise: Exercise | null | undefined) {
  const exAny = exercise as any;
  const isSqlExercise =
      exercise?.kind === "code_input" &&
      (
          exAny?.language === "sql" ||
          hasNonBlankSqlSignal(exAny?.fixedSqlDialect) ||
          hasNonBlankSqlSignal(exAny?.runtime?.datasetId) ||
          hasNonBlankSqlSignal(exAny?.sqlDatasetId) ||
          hasNonBlankSqlSignal(exAny?.sqlSchemaSql) ||
          hasNonBlankSqlSignal(exAny?.sqlSeedSql) ||
          hasNonBlankSqlSignal(exAny?.sqlSetupSql)
      );

  if (isSqlExercise) return "sql";

  return normalizeWorkspaceLanguage(exAny?.language ?? "python");
}function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstNonBlankString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }

  return null;
}

function pickEntryFileFromFiles(files: unknown, fallback: string) {
  return pickEntryFileFromStarterFilesValue(files, fallback);
}

function fileContentFromFiles(files: unknown, path: string) {
  return starterFileContentForPath(files, path);
}

function firstUsableStarterFiles(...values: unknown[]) {
  return firstUsableStarterFilesValue(...values);
}

function firstUsableStarterString(...values: unknown[]) {
  for (const value of values) {
    const cleaned = cleanStarterCode(value);
    if (cleaned) return cleaned;
  }

  return "";
}

function canonicalizeCodeInputExerciseStarterContract(
    exercise: Exercise | null | undefined,
): Exercise | null {
  if (!exercise || exercise.kind !== "code_input") return exercise ?? null;

  const exAny = exercise as any;
  const workspaceRecord = isRecord(exAny.workspace) ? exAny.workspace : {};
  const language = normalizeWorkspaceLanguage(
      firstNonBlankString(
          exAny.language,
          workspaceRecord.language,
          workspaceRecord.lang,
          "python",
      ),
  );

  const manifest = createManifestWorkspaceDefinition({
    language,
    manifest: exercise,
    workspaceRequested: true,
  });
  const starterCode =
      deriveEntryCode(manifest.manifestWorkspace) ||
      manifest.starterCode ||
      "";

  return {
    ...exAny,
    language,
    starterCode,
    starterFiles: manifest.starterFiles,
    workspace: {
      ...workspaceRecord,
      language,
      entryFilePath: manifest.entryFile,
      entryFile: manifest.entryFile,
      starterCode,
      starterFiles: manifest.starterFiles,
    },
  } as Exercise;
}

function buildWorkspaceFallbackFromProjectStep(step: unknown) {
  if (!isRecord(step)) return null;

  const rawWorkspace = isRecord(step.workspace) ? step.workspace : null;

  const starterFiles =
      step.starterFiles ??
      rawWorkspace?.starterFiles ??
      rawWorkspace?.files ??
      step.files ??
      step.initialFiles ??
      step.workspaceFiles ??
      null;

  const language = normalizeWorkspaceLanguage(
      firstNonBlankString(
          step.language,
          rawWorkspace?.language,
          rawWorkspace?.lang,
      ) || "python",
  );
  const defaultEntryFile = defaultMainFile(language);

  const entryFile =
      firstNonBlankString(
          rawWorkspace?.entryFilePath,
          rawWorkspace?.entryFile,
          rawWorkspace?.mainFile,
          rawWorkspace?.mainFilePath,
      ) || pickEntryFileFromFiles(starterFiles, defaultEntryFile);

  const starterCode =
      firstUsableStarterString(
          step.starterCode,
          rawWorkspace?.starterCode,
          fileContentFromFiles(starterFiles, entryFile),
      );

  if (!starterCode && !starterFiles && !rawWorkspace) {
    return null;
  }

  return {
    language,
    entryFile,
    entryFilePath: entryFile,
    starterCode,
    starterFiles,
    files: step.files ?? rawWorkspace?.files,
    fixtureFiles: step.fixtureFiles ?? rawWorkspace?.fixtureFiles,
    initialFiles: step.initialFiles ?? rawWorkspace?.initialFiles,
    workspaceFiles: step.workspaceFiles ?? rawWorkspace?.workspaceFiles,
    fixtures: step.fixtures ?? rawWorkspace?.fixtures,
    fileFixtures: step.fileFixtures ?? rawWorkspace?.fileFixtures,
    runtime: firstRecord(step.runtime, rawWorkspace?.runtime),
    recipe: firstRecord(step.recipe, rawWorkspace?.recipe),
    datasetId: firstNonBlankString(
        step.datasetId,
        step.sqlDatasetId,
        rawWorkspace?.datasetId,
        rawWorkspace?.sqlDatasetId,
    ),
    sqlDatasetId: firstNonBlankString(
        step.sqlDatasetId,
        step.datasetId,
        rawWorkspace?.sqlDatasetId,
        rawWorkspace?.datasetId,
    ),
    fixedSqlDialect: firstNonBlankString(
        step.fixedSqlDialect,
        rawWorkspace?.fixedSqlDialect,
    ),
    sqlDialect: firstNonBlankString(
        step.sqlDialect,
        rawWorkspace?.sqlDialect,
    ),
    sqlSchemaSql: firstNonBlankString(
        step.sqlSchemaSql,
        rawWorkspace?.sqlSchemaSql,
    ),
    sqlSeedSql: firstNonBlankString(
        step.sqlSeedSql,
        rawWorkspace?.sqlSeedSql,
    ),
    sqlInitialTableSnapshots:
        step.sqlInitialTableSnapshots ?? rawWorkspace?.sqlInitialTableSnapshots,
  };
}

function mergeProjectStepFallbackExercise(
    exercise: Exercise | null | undefined,
    projectStepManifest: unknown,
): Exercise | null {
  if (!isRecord(projectStepManifest)) {
    return exercise ?? null;
  }

  const fallbackWorkspace = buildWorkspaceFallbackFromProjectStep(projectStepManifest);
  if (!fallbackWorkspace) {
    return exercise ?? null;
  }

  const stepExerciseKey = firstNonBlankString(
      projectStepManifest.exerciseKey,
      projectStepManifest.id,
  );

  const fallbackExercise = {
    id: stepExerciseKey,
    exerciseKey: stepExerciseKey,
    kind: "code_input",
    purpose: "project",
    title: firstNonBlankString(projectStepManifest.title) || "Project step",
    prompt: firstNonBlankString(projectStepManifest.prompt),
    language: fallbackWorkspace.language,
    starterCode: fallbackWorkspace.starterCode,
    starterFiles: fallbackWorkspace.starterFiles,
    workspace: fallbackWorkspace,
    runtime: fallbackWorkspace.runtime,
    recipe: fallbackWorkspace.recipe,
    datasetId: fallbackWorkspace.datasetId,
    sqlDatasetId: fallbackWorkspace.sqlDatasetId,
    fixedSqlDialect: fallbackWorkspace.fixedSqlDialect,
    sqlDialect: fallbackWorkspace.sqlDialect,
    sqlSchemaSql: fallbackWorkspace.sqlSchemaSql,
    sqlSeedSql: fallbackWorkspace.sqlSeedSql,
    sqlInitialTableSnapshots: fallbackWorkspace.sqlInitialTableSnapshots,
    ideConfig: firstRecord(
        projectStepManifest.ideConfig,
        isRecord(projectStepManifest.workspace) ? projectStepManifest.workspace.ideConfig : null,
    ),
    solutionCode: firstNonBlankString(projectStepManifest.solutionCode),
    solutionFiles:
        projectStepManifest.solutionFiles ??
        (isRecord(projectStepManifest.workspace)
            ? projectStepManifest.workspace.solutionFiles
            : undefined),
  };

  if (!exercise) {
    return canonicalizeCodeInputExerciseStarterContract(
        fallbackExercise as unknown as Exercise,
    );
  }

  const exAny = exercise as any;
  const exWorkspace = isRecord(exAny.workspace) ? exAny.workspace : null;

  const mergedStarterCode = firstUsableStarterString(
      exAny.starterCode,
      exWorkspace?.starterCode,
      fallbackExercise.starterCode,
  );

  const mergedStarterFiles = firstUsableStarterFiles(
      exAny.starterFiles,
      exWorkspace?.starterFiles,
      fallbackExercise.starterFiles,
  );

  const mergedWorkspaceStarterFiles = firstUsableStarterFiles(
      exWorkspace?.starterFiles,
      exAny.starterFiles,
      fallbackWorkspace.starterFiles,
  );

  const mergedWorkspace = {
    ...(fallbackWorkspace ?? {}),
    ...(exWorkspace ?? {}),

    language: firstNonBlankString(
        exWorkspace?.language,
        exAny.language,
        fallbackWorkspace.language,
    ),

    entryFilePath: firstNonBlankString(
        exWorkspace?.entryFilePath,
        exWorkspace?.entryFile,
        fallbackWorkspace.entryFilePath,
    ),

    entryFile: firstNonBlankString(
        exWorkspace?.entryFile,
        exWorkspace?.entryFilePath,
        fallbackWorkspace.entryFile,
    ),

    starterCode: firstUsableStarterString(
        exWorkspace?.starterCode,
        exAny.starterCode,
        fallbackWorkspace.starterCode,
    ),

    starterFiles: mergedWorkspaceStarterFiles,
  };

  return canonicalizeCodeInputExerciseStarterContract({
    ...fallbackExercise,
    ...exAny,

    id: firstNonBlankString(exAny.id, fallbackExercise.id),
    exerciseKey: firstNonBlankString(exAny.exerciseKey, fallbackExercise.exerciseKey),
    kind: exAny.kind ?? fallbackExercise.kind,
    purpose: exAny.purpose ?? fallbackExercise.purpose,
    title: firstNonBlankString(exAny.title, fallbackExercise.title),
    prompt: firstNonBlankString(exAny.prompt, fallbackExercise.prompt),
    language: firstNonBlankString(exAny.language, fallbackExercise.language),

    starterCode: mergedStarterCode,
    starterFiles: mergedStarterFiles,
    workspace: mergedWorkspace,
    ideConfig: mergeLearningIdeConfigs(
        firstRecord(exAny.ideConfig),
        fallbackExercise.ideConfig,
    ),
    runtime: firstRecord(exAny.runtime, fallbackExercise.runtime),
    recipe: firstRecord(exAny.recipe, fallbackExercise.recipe),
    datasetId: firstNonBlankString(
        exAny.datasetId,
        exAny.sqlDatasetId,
        fallbackExercise.datasetId,
        fallbackExercise.sqlDatasetId,
    ),
    sqlDatasetId: firstNonBlankString(
        exAny.sqlDatasetId,
        exAny.datasetId,
        fallbackExercise.sqlDatasetId,
        fallbackExercise.datasetId,
    ),
    fixedSqlDialect: firstNonBlankString(
        exAny.fixedSqlDialect,
        fallbackExercise.fixedSqlDialect,
    ),
    sqlDialect: firstNonBlankString(
        exAny.sqlDialect,
        fallbackExercise.sqlDialect,
    ),
    sqlSchemaSql: firstNonBlankString(
        exAny.sqlSchemaSql,
        fallbackExercise.sqlSchemaSql,
    ),
    sqlSeedSql: firstNonBlankString(
        exAny.sqlSeedSql,
        fallbackExercise.sqlSeedSql,
    ),
    sqlInitialTableSnapshots:
        exAny.sqlInitialTableSnapshots ?? fallbackExercise.sqlInitialTableSnapshots,

    solutionCode: firstNonBlankString(exAny.solutionCode, fallbackExercise.solutionCode),
    solutionFiles: exAny.solutionFiles ?? fallbackExercise.solutionFiles,
  } as Exercise);
}





function buildProjectStepFallbackPracticeItem(args: {
  q: Extract<ReviewQuestion, { kind: "practice" }>;
  exercise: Exercise | null;
  projectStepManifest: unknown;
}) {
  const { q, exercise, projectStepManifest } = args;

  if (!exercise || !isRecord(projectStepManifest)) {
    return null;
  }

  const exAny = exercise as any;
  const workspaceRecord = isRecord(exAny.workspace) ? exAny.workspace : {};
  const language = normalizeWorkspaceLanguage(
      firstNonBlankString(
          exAny.language,
          workspaceRecord.language,
          "python",
      ),
  );
  const defaultEntryFile = defaultMainFile(language);
  const entryFile = firstNonBlankString(
      workspaceRecord.entryFilePath,
      workspaceRecord.entryFile,
      workspaceRecord.mainFile,
      workspaceRecord.mainFilePath,
      pickEntryFileFromFiles(exAny.starterFiles ?? workspaceRecord.starterFiles, defaultEntryFile),
  );

  const starterCode = firstUsableStarterString(
      exAny.starterCode,
      workspaceRecord.starterCode,
      fileContentFromFiles(exAny.starterFiles ?? workspaceRecord.starterFiles, entryFile),
  );

  const starterWorkspace =
      exercise.kind === "code_input"
          ? resolveExerciseWorkspace({
            language,
            manifest: exercise,
            entry: null,
          })
          : null;

  const entryCode =
      deriveEntryCode(starterWorkspace) ||
      starterCode ||
      "";

  const id = firstNonBlankString(
      exAny.id,
      exAny.exerciseKey,
      (projectStepManifest as any).exerciseKey,
      (projectStepManifest as any).id,
      q.id,
  );

  return {
    id,
    exerciseId: id,
    exerciseKey: firstNonBlankString(
        exAny.exerciseKey,
        (projectStepManifest as any).exerciseKey,
        id,
    ),
    kind: exercise.kind,
    purpose: exAny.purpose ?? "project",
    title: firstNonBlankString(
        exAny.title,
        (projectStepManifest as any).title,
        "Project step",
    ),
    prompt: firstNonBlankString(exAny.prompt, (projectStepManifest as any).prompt),
    exercise,
    answer: null,

    code: entryCode,
    source: entryCode,
    codeLang: language,
    language,
    lang: language,
    codeStdin: "",
    stdin: "",

    workspace: starterWorkspace ?? undefined,
    codeWorkspace: starterWorkspace ?? undefined,
    ideWorkspace: starterWorkspace ?? undefined,

    workspaceOrigin: "starter",
    userEdited: false,
    updateOrigin: "project-step-fallback",
  } as any;
}
export default function QuizPracticeCard(props: {
  q: Extract<ReviewQuestion, { kind: "practice" }>;
  ownerCardId?: string;
  projectStepManifest?: unknown;
  ps?: PracticeState;
  toolScopedId?: string;
  toolsActive?: boolean;
  subjectRuntimeDefaults?: unknown;
  courseRuntimeDefaults?: unknown;
  moduleRuntimeDefaults?: unknown;
  sectionRuntimeDefaults?: unknown;
  topicRuntimeDefaults?: unknown;

  unlocked: boolean;
  isCompleted: boolean;
  locked: boolean;
  unlimitedAttempts: boolean;
  strictSequential: boolean;

  seqOrder: number;

  padRef: React.MutableRefObject<VectorPadState>;
  onUpdateItem: (patch: any) => void;
  onSubmit: () => void;
  onHelp: (stepKey?: string) => void;
  onRetryExercise?: () => void;
  excused?: boolean;
  onExcused?: () => void;
}) {
  const {
    q,
    ownerCardId,
    projectStepManifest,
    ps,
    toolScopedId,
    toolsActive = true,
    subjectRuntimeDefaults,
    courseRuntimeDefaults,
    moduleRuntimeDefaults,
    sectionRuntimeDefaults,
    topicRuntimeDefaults,
    unlocked,
    isCompleted,
    locked,
    unlimitedAttempts,
    strictSequential,
    seqOrder,
    padRef,
    onUpdateItem,
    onSubmit,
    onHelp,
  } = props;

  const tools = useOptionalReviewTools();
  const toolsAny = tools as any;
  const excused = Boolean(props.excused);

  const ui = useTaggedT("reviewQuizUi");
  const t = useTranslations("review.quiz");
  const practiceT = useTranslations("practice.exerciseRenderer");
  const { raw } = useTaggedT();
  const resolvedProjectStepManifest = useMemo(
      () =>
          projectStepManifest
              ? resolveDeepTagged(projectStepManifest, (key) => raw(key, ""))
              : null,
      [projectStepManifest, raw],
  );

  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [submitAfterToolsFlushToken, setSubmitAfterToolsFlushToken] = useState(0);
  const submitAfterToolsFlushInFlightRef = useRef(false);
  const latestOnSubmitRef = useRef(onSubmit);
  const lastSubmittedAfterToolsFlushTokenRef = useRef(0);
  const autoRetriedRef = useRef<string | null>(null);
  const lastToolsBindKeyRef = useRef<string | null>(null);
  const lastEnsureRuntimeExerciseKeyRef = useRef<string | null>(null);

  useEffect(() => {
    latestOnSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    if (submitAfterToolsFlushToken <= 0) return;
    if (
        lastSubmittedAfterToolsFlushTokenRef.current ===
        submitAfterToolsFlushToken
    ) {
      return;
    }

    lastSubmittedAfterToolsFlushTokenRef.current =
        submitAfterToolsFlushToken;

    void Promise.resolve()
        .then(() => latestOnSubmitRef.current())
        .catch((error) => {
          console.error("[QuizPracticeCard] post-flush submit failed", error);
        })
        .finally(() => {
          if (
              lastSubmittedAfterToolsFlushTokenRef.current ===
              submitAfterToolsFlushToken
          ) {
            submitAfterToolsFlushInFlightRef.current = false;
          }
        });
  }, [submitAfterToolsFlushToken]);

  const ex: Exercise | null = useMemo(() => {
    if (!ps?.exercise) {
      return mergeProjectStepFallbackExercise(null, resolvedProjectStepManifest);
    }

    const resolved = resolveDeepTagged(ps.exercise, (key) => raw(key, "")) as Exercise;
    return mergeProjectStepFallbackExercise(resolved, resolvedProjectStepManifest);
  }, [ps?.exercise, raw, resolvedProjectStepManifest]);

  const projectStepFallbackItem = useMemo(
      () =>
          buildProjectStepFallbackPracticeItem({
            q,
            exercise: ex,
            projectStepManifest: resolvedProjectStepManifest,
          }),
      [q, ex, resolvedProjectStepManifest],
  );

  const rawPracticeItem = ps?.item ?? projectStepFallbackItem;

  const livePracticeItem = useMemo(() => {
    if (!ex || !rawPracticeItem) return rawPracticeItem ?? null;

    const normalized = normalizeCurrentPracticeItem(
        rawPracticeItem,
        ex,
        rawPracticeItem,
    );

    if (!normalized || !isRecord(normalized)) {
      return normalized;
    }

    const mergedExercise =
        mergeProjectStepFallbackExercise(
            (normalized as any).exercise as Exercise | undefined,
            resolvedProjectStepManifest,
        ) ?? (normalized as any).exercise;

    const mergedWorkspace =
        getWorkspaceFromAnyState(normalized) ??
        getWorkspaceFromAnyState(projectStepFallbackItem);

    const mergedCode =
        firstNonBlankString(
            (normalized as any).code,
            (normalized as any).source,
            deriveEntryCode(mergedWorkspace),
            (projectStepFallbackItem as any)?.code,
            (projectStepFallbackItem as any)?.source,
        );

    return {
      ...normalized,
      exercise: mergedExercise,
      code: mergedCode,
      source: mergedCode,
      codeWorkspace:
          (normalized as any).codeWorkspace ??
          (projectStepFallbackItem as any)?.codeWorkspace,
      ideWorkspace:
          (normalized as any).ideWorkspace ??
          (projectStepFallbackItem as any)?.ideWorkspace,
      workspace:
          (normalized as any).workspace ??
          (projectStepFallbackItem as any)?.workspace,
      workspaceOrigin: (normalized as any).workspaceOrigin ?? "starter",
      userEdited: (normalized as any).userEdited ?? false,
    };
  }, [ex, rawPracticeItem, resolvedProjectStepManifest, projectStepFallbackItem]);

  const livePracticeManifest = useMemo(
      () =>
          mergeProjectStepFallbackExercise(
              (livePracticeItem?.exercise as Exercise | undefined) ?? ex,
              resolvedProjectStepManifest,
          ),
      [ex, livePracticeItem, resolvedProjectStepManifest],
  );

  const toolsEnabled = Boolean(toolsAny?.enabled);
  const isCodeInput = ex?.kind === "code_input";
  const resolvedCodeSurface = resolveCodeSurface({
    exercise: livePracticeManifest ?? ex,
    projectStepManifest: resolvedProjectStepManifest,
  });
  const useToolsCodeSurface = toolsEnabled && isCodeInput && resolvedCodeSurface === "tools";
  const codeRunnerMode: "embedded" | "tools" = useToolsCodeSurface ? "tools" : "embedded";

  const codeTools = useToolsCodeSurface ? toolsAny : null;

  const stableExerciseSlotId = useMemo(() => {
    const manifestSlotId = firstNonBlankString(
        (livePracticeManifest as any)?.exerciseKey,
        (livePracticeManifest as any)?.id,
    );

    /**
     * The live/resolved exercise is the learner-facing contract.
     *
     * After route/card navigation, the outer practice question can briefly keep
     * an older fetch.exerciseKey while livePracticeManifest already points at
     * the visible exercise. If Tools uses the stale question key, the right rail
     * can bind to the previous exercise workspace. In Linux terminal lessons this
     * showed a card asking for trail/checkpoint while Tools still had only the
     * library/desk starter files.
     */
    return manifestSlotId || getStableExerciseSlotId(q, resolvedProjectStepManifest);
  }, [q, resolvedProjectStepManifest, livePracticeManifest]);
  const exerciseKeyForTools = useMemo(() => {
    const fetch = (q as any).fetch ?? {};

    return getExerciseStateKey(
        {
          subjectSlug: fetch.subjectSlug ?? fetch.subject ?? "",
          moduleSlug: fetch.moduleSlug ?? fetch.module ?? "",
          sectionSlug: fetch.sectionSlug ?? fetch.section,
          topicId: normalizeTopicProgressKey(fetch.topicId ?? fetch.topic ?? ""),
          cardId: ownerCardId ?? "",
        },
        stableExerciseSlotId,
    );
  }, [q, ownerCardId, stableExerciseSlotId]);

  const effectiveToolId = toolScopedId ?? stableExerciseSlotId;
  const codeInputId =
      toolsEnabled && isCodeInput ? exerciseKeyForTools : undefined;

  const runtimeExercise = useReviewRuntimeStore(
      (s) => s.exercises[exerciseKeyForTools] ?? null,
  );
  const ensureRuntimeExercise = useReviewRuntimeStore((s) => s.ensureExercise);
  const patchRuntimeExercise = useReviewRuntimeStore((s) => s.patchExercise);
  const patchEditorWorkspace = useReviewRuntimeStore((s) => s.patchEditorWorkspace);
  const fetchSubjectSlug = (q as any).fetch?.subject ?? "";
  const fetchModuleSlug = (q as any).fetch?.module ?? "";
  const fetchSectionSlug = (q as any).fetch?.section;
  const fetchTopicId = normalizeTopicProgressKey((q as any).fetch?.topic ?? "");
  const fetchOwnerCardId = ownerCardId ?? "";
  const practiceExerciseKind = livePracticeManifest?.kind ?? "";
  const practiceExerciseId = String((livePracticeManifest as any)?.id ?? "");
  const practiceExerciseKey = String((livePracticeManifest as any)?.exerciseKey ?? "");
  const practiceExerciseLanguage = String((livePracticeManifest as any)?.language ?? "");
  const practiceExerciseRuntimeDatasetId = String(
      (livePracticeManifest as any)?.runtime?.datasetId ?? "",
  );
  const practiceExerciseSqlDatasetId = firstNonBlankString(
      (livePracticeManifest as any)?.sqlDatasetId,
  );
  const practiceExerciseHasSqlSchema =
      hasNonBlankSqlSignal((livePracticeManifest as any)?.sqlSchemaSql);
  const practiceExerciseHasSqlSeed =
      hasNonBlankSqlSignal((livePracticeManifest as any)?.sqlSeedSql);
  const practiceResolvedForToolBinding = Boolean(
      ps?.exercise &&
      ps?.item &&
      !ps.loading &&
      !ps.error,
  );
  const practiceItemReady = Boolean(livePracticeItem);
  const practiceStarterCode = String(
      (livePracticeManifest as any)?.starterCode ??
      (livePracticeItem as any)?.starterCode ??
      "",
  );
  const practiceStarterFilesKey = JSON.stringify(
      (livePracticeManifest as any)?.starterFiles ??
      (livePracticeItem as any)?.starterFiles ??
      null,
  );
  const practiceWorkspaceKey = workspaceStableKey(
      getWorkspaceFromAnyState(livePracticeManifest) ??
      getWorkspaceFromAnyState(livePracticeItem) ??
      null,
  );
  const practiceIdeConfigKey = JSON.stringify(
      (livePracticeManifest as any)?.ideConfig ??
      (livePracticeItem as any)?.ideConfig ??
      null,
  );

  const runtimeExerciseCode = useMemo(() => {
    return (
        getWorkspaceEntryCodeForPracticeCard(runtimeExercise?.workspace) ||
        (typeof runtimeExercise?.code === "string" ? runtimeExercise.code : "")
    );
  }, [runtimeExercise]);

  useEffect(() => {
    if (!practiceResolvedForToolBinding) return;
    if (!livePracticeManifest) return;
    if (livePracticeManifest.kind !== "code_input") return;
    if (!livePracticeItem && !resolvedProjectStepManifest) return;

    const manifestLanguage = getManifestExerciseLanguage(livePracticeManifest);
    const ensureKey = [
      exerciseKeyForTools,
      fetchSubjectSlug,
      fetchModuleSlug,
      fetchSectionSlug || "",
      fetchTopicId,
      fetchOwnerCardId,
      practiceExerciseKind,
      practiceExerciseId,
      practiceExerciseKey,
      practiceExerciseLanguage,
      practiceExerciseRuntimeDatasetId,
      practiceExerciseSqlDatasetId,
      practiceExerciseHasSqlSchema ? "sql-schema" : "",
      practiceExerciseHasSqlSeed ? "sql-seed" : "",
      practiceStarterCode,
      practiceStarterFilesKey,
      practiceWorkspaceKey,
      practiceIdeConfigKey,
    ].join("|");

    const existing = useReviewRuntimeStore.getState().exercises[exerciseKeyForTools];
    const existingMatchesManifestLanguage =
        existing &&
        stateLanguageMatches(
            existing,
            manifestLanguage,
            getWorkspaceFromAnyState(existing),
        );

    if (
        lastEnsureRuntimeExerciseKeyRef.current === ensureKey &&
        existingMatchesManifestLanguage
    ) {
      return;
    }
    const manifestStarterWorkspace = resolveExerciseWorkspace({
      language: manifestLanguage,
      manifest: livePracticeManifest,
    });

    if (
        shouldSkipEmbeddedEnsureExercise({
          existing:
            existing &&
            stateLanguageMatches(
              existing,
              manifestLanguage,
              getWorkspaceFromAnyState(existing),
            )
              ? existing
              : null,
          manifestLanguage,
          manifestStarterWorkspace,
          manifestStarterCode: practiceStarterCode,
          manifestIdeConfig:
            ((livePracticeManifest as any)?.ideConfig ??
              (livePracticeItem as any)?.ideConfig ??
              null) as any,
        })
    ) {
      lastEnsureRuntimeExerciseKeyRef.current = ensureKey;
      return;
    }

    lastEnsureRuntimeExerciseKeyRef.current = ensureKey;

    ensureRuntimeExercise({
      exerciseKey: exerciseKeyForTools,
      subjectSlug: fetchSubjectSlug,
      moduleSlug: fetchModuleSlug,
      sectionSlug: fetchSectionSlug,
      topicId: fetchTopicId,
      cardId: fetchOwnerCardId,
      manifest: livePracticeManifest,
      saved: livePracticeItem ?? livePracticeManifest,
    });

    // Register the live dynamic practice contract before child tool-binding
    // effects run so the Tools pane does not momentarily seed itself from the
    // generic default workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ensureRuntimeExercise,
    exerciseKeyForTools,
    fetchSubjectSlug,
    fetchModuleSlug,
    fetchSectionSlug,
    fetchTopicId,
    fetchOwnerCardId,
    practiceExerciseKind,
    practiceExerciseId,
    practiceExerciseKey,
    practiceExerciseLanguage,
    practiceExerciseRuntimeDatasetId,
    practiceExerciseSqlDatasetId,
    practiceExerciseHasSqlSchema,
    practiceExerciseHasSqlSeed,
    practiceResolvedForToolBinding,
    practiceItemReady,
    practiceStarterCode,
    practiceStarterFilesKey,
    practiceWorkspaceKey,
    practiceIdeConfigKey,
    resolvedProjectStepManifest,
  ]);

  useEffect(() => {
    if (!livePracticeManifest) return;
    if (livePracticeManifest.kind !== "code_input") return;

    const itemWorkspace =
        getWorkspaceFromAnyState(livePracticeItem) ??
        getWorkspaceFromAnyState(livePracticeManifest);

    if (!itemWorkspace) return;

    const existingWorkspace = getWorkspaceFromAnyState(runtimeExercise);
    const existingEntryCode = getWorkspaceEntryCodeForPracticeCard(existingWorkspace);
    const starterEntryCode = getWorkspaceEntryCodeForPracticeCard(itemWorkspace);
    const itemWorkspaceIsLearnerOwned = isLearnerOwnedPracticeSnapshot(livePracticeItem);
    const existingIsProtected =
        runtimeExercise?.userEdited === true ||
        runtimeExercise?.workspaceOrigin === "user" ||
        runtimeExercise?.workspaceOrigin === "saved";
    const protectedButBlank = existingIsProtected && !existingEntryCode.trim() && starterEntryCode.trim().length > 0;

    if (existingIsProtected && !protectedButBlank) return;

    /**
     * Passive practice items are often synthetic starter snapshots.
     * ensureExercise is the single owner of starter seeding; this hydration
     * effect should only restore real learner/saved work or replace an old
     * blank protected shell. Without this guard, a passive item workspace and
     * the manifest-resolved workspace can alternate forever during embedded
     * try-it/project rendering.
     */
    if (!itemWorkspaceIsLearnerOwned && existingWorkspace && !protectedButBlank) return;

    const existingWorkspaceKey = workspaceStableKey(existingWorkspace);
    const liveWorkspaceKey = workspaceStableKey(itemWorkspace);
    if (existingWorkspaceKey === liveWorkspaceKey) return;

    const code = deriveEntryCode(itemWorkspace) || "";
    const stdin = typeof itemWorkspace.stdin === "string" ? itemWorkspace.stdin : "";
    const language = getManifestExerciseLanguage(livePracticeManifest);

    const hydratedWorkspaceOrigin = itemWorkspaceIsLearnerOwned
        ? String((livePracticeItem as any)?.workspaceOrigin ?? "").trim().toLowerCase() === "user"
            ? "user"
            : "saved"
        : "starter";

    patchRuntimeExercise(exerciseKeyForTools, {
      workspace: itemWorkspace,
      codeWorkspace: itemWorkspace,
      ideWorkspace: itemWorkspace,
      code,
      source: code,
      stdin,
      codeStdin: stdin,
      language,
      lang: language,
      codeLang: language,
      userEdited: itemWorkspaceIsLearnerOwned,
      workspaceOrigin: hydratedWorkspaceOrigin,
      updatedAt: Date.now(),
    });
    patchEditorWorkspace(exerciseKeyForTools, itemWorkspace);
  }, [
    exerciseKeyForTools,
    livePracticeItem,
    livePracticeManifest,
    patchEditorWorkspace,
    patchRuntimeExercise,
    runtimeExercise,
  ]);

  useEffect(() => {
    if (toolsActive) return;

    /**
     * Practice quiz cards can stay mounted while their code editor child
     * unregisters during card/topic navigation. When we return to the same card,
     * we must allow both runtime ensure and Tools rebind to happen again.
     */
    lastToolsBindKeyRef.current = null;
    lastEnsureRuntimeExerciseKeyRef.current = null;
  }, [toolsActive]);

  const attemptsCapped = useMemo(() => {
    if (!ps) return false;
    if (unlimitedAttempts) return false;

    const max = ps.maxAttempts;
    if (max == null) return false;

    return ps.attempts >= max;
  }, [ps, unlimitedAttempts]);

  /**
   * The visible exercise/editor can be ready from the authored project-step
   * starter before /api/practice has finished minting the signed validation
   * item. Readiness must follow the same live item that ExerciseRenderer uses,
   * not only ps.item from the async practice bank.
   */
  const answerItemForReadiness = livePracticeItem ?? ps?.item ?? null;

  const hasInput = useMemo(() => {
    if (!ex || !answerItemForReadiness) return false;

    if (ex.kind === "code_input" && runtimeExerciseCode.trim().length > 0) {
      return true;
    }

    return !isEmptyPracticeAnswer(ex, answerItemForReadiness, padRef?.current);
  }, [ex, answerItemForReadiness, padRef, runtimeExerciseCode]);

  const isCodeExerciseWithInput = ex?.kind === "code_input" && hasInput;
  const compactLearnerUi = learnerUiFlags.compactLearnerUi;

  const feedbackDismissed = Boolean((ps?.item as any)?.feedbackDismissed);
  const checkedResult = (ps?.item as any)?.result ?? null;

  const resultOk =
      typeof checkedResult?.ok === "boolean"
          ? Boolean(checkedResult.ok)
          : null;

  const isCorrect =
      (Boolean(checkedResult?.finalized) && resultOk === true) ||
      ps?.ok === true ||
      resultOk === true;

  useEffect(() => {
    if (!toolsEnabled) return;
    if (!isCodeInput) return;
    if (!codeInputId) return;

    if (resultOk === true) {
      toolsAny?.clearRunFeedback?.(codeInputId);
      return;
    }

    if (resultOk !== false) return;
    if (feedbackDismissed) return;

    const feedback = buildCheckFeedbackFromResult(checkedResult, {
      checkAnswerTryAgain: practiceT("checkAnswerTryAgain"),
      notCorrectYet: practiceT("notCorrectYet"),
    });
    if (!feedback) return;

    /**
     * Check Answer and Run must surface the same feedback channel for the
     * currently bound full-workspace editor. The card still owns grading, but
     * the Tools pane should not stay blank when the check result contains the
     * runtime/classified feedback.
     */
    toolsAny?.setRunFeedback?.(codeInputId, feedback);
  }, [
    toolsEnabled,
    isCodeInput,
    codeInputId,
    resultOk,
    feedbackDismissed,
    checkedResult,
    toolsAny,
  ]);

  const isFinalized =
      Boolean(checkedResult?.finalized) ||
      isCorrect ||
      attemptsCapped ||
      isCompleted ||
      locked;

  const updateItemSafe = useCallback(
      (patch: any) => {
        const isDismissFeedbackEdit =
            Boolean(patch?.dismissFeedbackOnEdit) &&
            Boolean(patch?.feedbackDismissed);

        // Always allow real typing/edit patches to dismiss stale feedback.
        // Even if the item is finalized/completed, the old red feedback should not remain visible.
        if (isDismissFeedbackEdit) {
          onUpdateItem({
            ...patch,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: true,
            submitted: false,
            userEdited: true,
            updateOrigin: "user",
            workspaceOrigin: "user",
          });
          return;
        }

        if (!unlocked || isCompleted || locked || excused || isFinalized) return;

        onUpdateItem(patch);
      },
      [unlocked, isCompleted, locked, excused, isFinalized, onUpdateItem],
  );

  useEffect(() => {
    if (!toolsEnabled) return;
    if (!toolsAny) return;
    if (!ex) return;
    if (ex.kind !== "code_input") return;
    if (!ps) return;

    const doneForFlow =
        isCorrect || isFinalized || excused || (!strictSequential && attemptsCapped);

    const eligible =
        toolsActive && unlocked && !locked && !isCompleted && !excused && !isFinalized;

    toolsAny.setCodeInputMeta?.(codeInputId ?? effectiveToolId, {
      order: seqOrder,
      eligible,
      done: doneForFlow,
    });
  }, [
    toolsEnabled,
    toolsAny,
    ex,
    ps,codeInputId,
    effectiveToolId,
    toolsActive,
    unlocked,
    locked,
    isCompleted,
    excused,
    strictSequential,
    attemptsCapped,
    isCorrect,
    isFinalized,
    seqOrder,
  ]);

  useEffect(() => {
    if (!toolsActive) {
      lastToolsBindKeyRef.current = null;
      return;
    }
    if (!practiceResolvedForToolBinding) return;
    if (!toolsEnabled) return;
    if (!toolsAny) return;
    if (!isCodeInput) return;
    if (!codeInputId) return;
    if (!ex) return;
    if (!livePracticeItem) return;

    const bindKey = `${codeInputId}:${exerciseKeyForTools}`;
    const alreadyBoundToThisExercise =
        toolsAny.boundId === codeInputId ||
        toolsAny.boundId === exerciseKeyForTools;

    if (lastToolsBindKeyRef.current === bindKey && alreadyBoundToThisExercise) return;
    lastToolsBindKeyRef.current = bindKey;

    const timer = window.setTimeout(() => {
      toolsAny.requestBind?.(codeInputId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    toolsActive,
    practiceResolvedForToolBinding,
    toolsEnabled,
    toolsAny,
    isCodeInput,
    codeInputId,
    ex,
    Boolean(livePracticeItem),
    exerciseKeyForTools,
    toolsAny.boundId,
  ]);


  const disableCheck =
      (!isCodeExerciseWithInput && !unlocked) ||
      isCompleted ||
      (locked && !isCodeExerciseWithInput) ||
      excused ||
      (ps?.busy ?? false) ||
      isFinalized ||
      !hasInput;

  const enabledHelpSteps = ps?.helpPolicy?.stepKeys?.length
      ? ps.helpPolicy.stepKeys
      : DEFAULT_PRACTICE_HELP_POLICY.stepKeys;

  const openedHelpSteps = ps?.item?.help?.openedStepKeys ?? [];

  const nextHelpStepKey = getNextPracticeHelpStepKey(
      enabledHelpSteps,
      openedHelpSteps,
  );

  const nextHelpLabel = nextHelpStepKey
      ? PRACTICE_HELP_STEP_DEF_MAP.get(nextHelpStepKey)?.label ?? nextHelpStepKey
      : null;

  const disableHelp =
      (!isCodeExerciseWithInput && !unlocked) ||
      isCompleted ||
      (locked && !isCodeExerciseWithInput) ||
      excused ||
      (ps?.busy ?? false) ||
      isFinalized ||
      !nextHelpStepKey;

  const disableSkip =
      !unlocked || isCompleted || locked || excused || isFinalized;

  const hasOpenedHelp = Boolean(ps?.item?.help?.openedStepKeys?.length);

  const btnLabel = ps?.busy ? (
      <span className="inline-flex items-center gap-2">
      <span className="ui-quiz-spinner" />
        {ui.t("practice.checking")}
    </span>
  ) : (
      ui.t("buttons.checkAnswer")
  );

  const maxForRenderer = ps?.maxAttempts ?? Number.POSITIVE_INFINITY;

  const hasExercise = Boolean(ex && livePracticeItem && practiceResolvedForToolBinding);
  const hasProjectStepFallback = Boolean(
      resolvedProjectStepManifest && projectStepFallbackItem && practiceResolvedForToolBinding,
  );
  const isInitialLoading = Boolean(
      (!ps || ps.loading) && !hasExercise && !hasProjectStepFallback && !ps?.error,
  );
  const isRefreshing = Boolean(ps?.loading && hasExercise && !hasProjectStepFallback);
  const hasBlockingError = Boolean(ps?.error && !hasExercise && !hasProjectStepFallback);
  const hasInlineError = Boolean(ps?.error && hasExercise && !hasProjectStepFallback);

  useEffect(() => {
    setLoadTimedOut(false);
    autoRetriedRef.current = null;
  }, [q.id]);

  useEffect(() => {
    if (!isInitialLoading) {
      setLoadTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [isInitialLoading, q.id]);

  /**
   * A slow /api/practice response is not a failed exercise. Do not auto-retry
   * while the original request is still in flight; that creates duplicate GETs
   * and can cause the successful first response to be discarded by a newer load.
   * Manual Retry below still force-loads if the learner wants to retry.
   */

  const showStuckLoading = isInitialLoading && loadTimedOut;
  const practiceLoadErrorForTools = hasBlockingError
      ? String(ps?.error ?? "Failed to load practice exercise.")
      : "";

  useLayoutEffect(() => {
    if (!exerciseKeyForTools) return;

    const store = useReviewRuntimeStore.getState();
    let existing = store.exercises[exerciseKeyForTools];

    if (!existing && livePracticeManifest?.kind === "code_input") {
      ensureRuntimeExercise({
        exerciseKey: exerciseKeyForTools,
        subjectSlug: fetchSubjectSlug,
        moduleSlug: fetchModuleSlug,
        sectionSlug: fetchSectionSlug,
        topicId: fetchTopicId,
        cardId: fetchOwnerCardId,
        manifest: livePracticeManifest,
        saved: livePracticeItem ?? livePracticeManifest,
      });

      existing = useReviewRuntimeStore.getState().exercises[exerciseKeyForTools];
    }

    if (!existing) return;

    const nextWorkspaceStatus = hasBlockingError
        ? "error"
        : isInitialLoading || showStuckLoading
            ? "pending"
            : practiceResolvedForToolBinding
                ? "ready"
                : null;

    if (!nextWorkspaceStatus) return;

    const nextWorkspaceError =
        nextWorkspaceStatus === "error" ? practiceLoadErrorForTools : null;

    if (
        existing.workspaceStatus === nextWorkspaceStatus &&
        String((existing as any).workspaceError ?? "") === String(nextWorkspaceError ?? "")
    ) {
      return;
    }

    patchRuntimeExercise(exerciseKeyForTools, {
      workspaceStatus: nextWorkspaceStatus,
      workspaceError: nextWorkspaceError,
      workspace: existing.workspace,
      codeWorkspace: existing.workspace,
      ideWorkspace: existing.workspace,
      code: existing.code,
      source: existing.source,
      stdin: existing.stdin,
      codeStdin: existing.codeStdin,
    } as any);
  }, [
    ensureRuntimeExercise,
    exerciseKeyForTools,
    fetchOwnerCardId,
    fetchModuleSlug,
    fetchSectionSlug,
    fetchSubjectSlug,
    fetchTopicId,
    hasBlockingError,
    isInitialLoading,
    livePracticeItem,
    livePracticeManifest,
    patchRuntimeExercise,
    practiceLoadErrorForTools,
    practiceResolvedForToolBinding,
    showStuckLoading,
  ]);

  return (
      <div className={["p-2", !unlocked ? "opacity-70" : ""].join(" ")}>
        {!unlocked ? (
            <div className="ui-quiz-hint">
              {t("unlockHint")}
            </div>
        ) : null}

        {showStuckLoading ? (
            <div className="ui-quiz-status-soft">
              <div>
                {t("loadingSlow")}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {props.onRetryExercise ? (
                    <button
                        type="button"
                        onClick={props.onRetryExercise}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                      {t("retry")}
                    </button>
                ) : null}

                <button
                    type="button"
                    onClick={props.onExcused}
                    disabled={disableSkip}
                    className={[
                      "ui-quiz-action",
                      disableSkip ? "ui-quiz-action--disabled" : "ui-quiz-action--ghost",
                    ].join(" ")}
                >
                  {props.excused
                      ? t("excused")
                      : t("continue")}
                </button>
              </div>
            </div>
        ) : isInitialLoading ? (
            <div className="mt-2 ui-quiz-status-soft flex items-center gap-2">
              <span>{t("loadingExercise")}</span>
            </div>
        ) : hasBlockingError ? (
            <div className="ui-quiz-note-danger">
              <div>{ps?.error}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                {props.onRetryExercise ? (
                    <button
                        type="button"
                        onClick={props.onRetryExercise}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                      {t("retry")}
                    </button>
                ) : null}

                <button
                    type="button"
                    onClick={props.onExcused}
                    disabled={disableSkip}
                    className={[
                      "ui-quiz-action",
                      disableSkip ? "ui-quiz-action--disabled" : "ui-quiz-action--ghost",
                    ].join(" ")}
                >
                  {props.excused
                      ? t("excused")
                      : t("continue")}
                </button>
              </div>
            </div>
        ) : ex && livePracticeItem && practiceResolvedForToolBinding ? (
            <div className="mt-1">
              {isRefreshing ? (
                  <div className="mb-2 ui-quiz-status-soft flex items-center gap-2">
                    <span>{ui.t("practice.refreshing")}</span>
                  </div>
              ) : null}

              {hasInlineError ? (
                  <div className="mb-2 ui-quiz-note-danger">
                    <div>{ps?.error}</div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {props.onRetryExercise ? (
                          <button
                              type="button"
                              onClick={props.onRetryExercise}
                              className="ui-quiz-action ui-quiz-action--ghost"
                          >
                            {t("retry")}
                          </button>
                      ) : null}
                    </div>
                  </div>
              ) : null}

              <div className="mt-2">
                {exerciseDebug("A_QuizPracticeCard_before_ExerciseRenderer", {
                  qId: q.id,
                  ownerCardId,
                  stableExerciseSlotId,
                  codeInputId,
                  codeRunnerMode,
                  toolsActive,
                  fetchExerciseKey: (q as any).fetch?.exerciseKey,
                  fetchStepId: (q as any).fetch?.stepId,
                  qExerciseKey: (q as any).exerciseKey,
                  qStepId: (q as any).stepId,
                  psExerciseKind: ps?.exercise?.kind,
                  psItem: summarizeExercisePatch(ps?.item),
                  exKind: ex.kind,
                  exId: (ex as any).id,
                  exExerciseKey: (ex as any).exerciseKey,
                  fetchTopic: (q as any).fetch?.topic,
                }) as any}

                <ExerciseRenderer
                    key={stableExerciseSlotId}
                    exercise={(livePracticeManifest as Exercise) ?? ex}
                    current={
                      isCorrect || isCompleted
                          ? {
                            ...(livePracticeItem as any),
                            feedbackDismissed: true,
                          }
                          : (livePracticeItem as any)
                    }
                    exerciseStateId={stableExerciseSlotId}
                    busy={Boolean(ps?.busy) || !unlocked || isCompleted || locked || isFinalized}
                    isAssignmentRun={false}
                    maxAttempts={maxForRenderer as any}
                    padRef={padRef as any}
                    updateCurrent={updateItemSafe}
                    readOnly={!unlocked || isCompleted || locked || isFinalized}
                    codeRunnerMode={codeRunnerMode}
                    codeTools={codeTools}
                    codeInputId={codeInputId}
                    codeOwnerCardId={ownerCardId ?? null}
                    codeToolsAutoOpen={toolsActive}
                    subjectSlug={(q as any).fetch?.subject}
                    moduleSlug={(q as any).fetch?.module}
                    sectionSlug={(q as any).fetch?.section}
                    topicId={normalizeTopicProgressKey((q as any).fetch?.topic)}
                    cardId={ownerCardId}
                    subjectRuntimeDefaults={subjectRuntimeDefaults}
                    courseRuntimeDefaults={courseRuntimeDefaults}
                    moduleRuntimeDefaults={moduleRuntimeDefaults}
                    sectionRuntimeDefaults={sectionRuntimeDefaults}
                    topicRuntimeDefaults={topicRuntimeDefaults}
                    // showPrompt={true}

                />
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                      type="button"
                      onClick={async () => {
                        if (submitAfterToolsFlushInFlightRef.current) return;

                        submitAfterToolsFlushInFlightRef.current = true;

                        try {
                          await flushReviewToolsBeforeSubmit(toolsAny);

                          /**
                           * Do not call the current onSubmit closure here.
                           *
                           * flushReviewToolsBeforeSubmit updates the runtime store with
                           * the latest terminal transcript/workspace. The onSubmit prop
                           * was created by the render BEFORE that flush, so calling it
                           * in the same click handler can submit stale/no terminal
                           * evidence and show "Terminal activity missing".
                           *
                           * Bump local state and let the next render call the fresh
                           * onSubmit from an effect.
                           */
                          setSubmitAfterToolsFlushToken((token) => token + 1);
                        } catch (error) {
                          submitAfterToolsFlushInFlightRef.current = false;
                          throw error;
                        }
                      }}
                      disabled={disableCheck}
                      data-testid="review-practice-submit-button"
                      data-flow-focus="1"
                      className={[
                        "ui-quiz-action",
                        "ui-btn-primary",
                        disableCheck ? "ui-quiz-action--disabled" : "ui-btn-primary",
                      ].join(" ")}
                  >
                    {btnLabel}
                  </button>

                  {!hasOpenedHelp ? (
                      <button
                          type="button"
                          onClick={() => onHelp(nextHelpStepKey ?? undefined)}
                          disabled={disableHelp}
                          className={[
                            "ui-quiz-action",
                            disableHelp ? "ui-quiz-action--disabled" : "ui-quiz-action--ghost",
                          ].join(" ")}
                      >
                        {nextHelpLabel ?? ui.t("buttons.help")}
                      </button>
                  ) : null}
                </div>

                {!compactLearnerUi || isCorrect || (!feedbackDismissed && resultOk === false && ps?.item?.result) ? (
                  <div className="ui-quiz-checkrow-status">
                    {!compactLearnerUi ? (
                      <span className="whitespace-normal">
                        {t("attempts", {
                          n: ps?.attempts ?? 0,
                          max: ps?.maxAttempts == null ? "∞" : ps.maxAttempts,
                        })}
                      </span>
                    ) : null}

                    {isCorrect ? (
                        <span
                            className={!compactLearnerUi ? "ml-2 whitespace-nowrap ui-quiz-status-good" : "whitespace-nowrap ui-quiz-status-good"}
                            data-testid="review-practice-result-correct"
                        >
        {t("correct")}
      </span>
                    ) : !feedbackDismissed && resultOk === false && ps?.item?.result ? (
                        <span
                            className={!compactLearnerUi ? "ml-2 whitespace-nowrap ui-quiz-status-danger" : "whitespace-nowrap ui-quiz-status-danger"}
                            data-testid="review-practice-result-incorrect"
                        >
        {t("notCorrect")}
      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <PracticeHelpPanel
                  exercise={(livePracticeManifest as Exercise) ?? ex}
                  current={livePracticeItem as any}
                  help={(livePracticeItem as any)?.help}
                  helpPolicy={ps?.helpPolicy}
                  updateCurrent={updateItemSafe}
                  onOpenHelp={onHelp}
                  codeInputId={codeInputId}
              />
            </div>
        ) : (
            <div className="mt-2 ui-quiz-status-soft">
              {ui.t("practice.noExercise")}
            </div>
        )}
      </div>
  );
}
