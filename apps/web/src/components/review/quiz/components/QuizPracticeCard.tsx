"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

function uniqueTruthyStrings(values: Array<unknown>) {
  return Array.from(
      new Set(
          values
              .map((value) => String(value ?? "").trim())
              .filter(Boolean),
      ),
  );
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

const LOADING_TIMEOUT_MS = 8000;

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

function getManifestExerciseLanguage(exercise: Exercise | null | undefined) {
  const exAny = exercise as any;
  const isSqlExercise =
      exercise?.kind === "code_input" &&
      (
          exAny?.language === "sql" ||
          Boolean(exAny?.fixedSqlDialect) ||
          Boolean(exAny?.runtime?.datasetId) ||
          typeof exAny?.sqlSchemaSql === "string" ||
          typeof exAny?.sqlSeedSql === "string" ||
          Boolean(exAny?.sqlDatasetId)
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

function pickEntryFileFromFiles(files: unknown, fallback = "main.py") {
  if (Array.isArray(files)) {
    const entry = files.find(
        (file) =>
            isRecord(file) &&
            (file.entry === true || file.isEntry === true || file.main === true) &&
            typeof file.path === "string" &&
            file.path.trim(),
    );

    if (isRecord(entry) && typeof entry.path === "string") {
      return entry.path.trim();
    }

    const first = files.find(
        (file) => isRecord(file) && typeof file.path === "string" && file.path.trim(),
    );

    if (isRecord(first) && typeof first.path === "string") {
      return first.path.trim();
    }
  }

  if (isRecord(files)) {
    const keys = Object.keys(files).filter(Boolean);
    if (keys.includes(fallback)) return fallback;
    if (keys.length) return keys[0] ?? fallback;
  }

  return fallback;
}

function fileContentFromFiles(files: unknown, path: string) {
  if (Array.isArray(files)) {
    const match = files.find(
        (file) => isRecord(file) && file.path === path,
    );

    if (isRecord(match) && typeof match.content === "string") {
      return match.content;
    }
  }

  if (isRecord(files) && typeof files[path] === "string") {
    return String(files[path]);
  }

  return "";
}



function hasUsableStarterFileSource(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((file) => {
      if (!isRecord(file)) return false;
      return typeof file.content === "string" && file.content.trim().length > 0;
    });
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, entry]) => {
      if (
          [
            "entryFile",
            "entryFilePath",
            "mainFile",
            "mainFilePath",
            "language",
            "lang",
          ].includes(key)
      ) {
        return false;
      }

      if (typeof entry === "string") return entry.trim().length > 0;
      if (isRecord(entry) && typeof entry.content === "string") {
        return entry.content.trim().length > 0;
      }

      return false;
    });
  }

  return false;
}

function firstUsableStarterFiles(...values: unknown[]) {
  for (const value of values) {
    if (hasUsableStarterFileSource(value)) return value;
  }

  return undefined;
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

  const entryFile =
      firstNonBlankString(
          rawWorkspace?.entryFilePath,
          rawWorkspace?.entryFile,
          rawWorkspace?.mainFile,
          rawWorkspace?.mainFilePath,
      ) || pickEntryFileFromFiles(starterFiles, "main.py");

  const language =
      firstNonBlankString(
          step.language,
          rawWorkspace?.language,
          rawWorkspace?.lang,
      ) || "python";

  const starterCode =
      firstNonBlankString(
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
    solutionCode: firstNonBlankString(projectStepManifest.solutionCode),
    solutionFiles:
        projectStepManifest.solutionFiles ??
        (isRecord(projectStepManifest.workspace)
            ? projectStepManifest.workspace.solutionFiles
            : undefined),
  };

  if (!exercise) {
    return fallbackExercise as unknown as Exercise;
  }

  const exAny = exercise as any;
  const exWorkspace = isRecord(exAny.workspace) ? exAny.workspace : null;

  const mergedStarterCode = firstNonBlankString(
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

    starterCode: firstNonBlankString(
        exWorkspace?.starterCode,
        exAny.starterCode,
        fallbackWorkspace.starterCode,
    ),

    starterFiles: mergedWorkspaceStarterFiles,
  };

  return {
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

    solutionCode: firstNonBlankString(exAny.solutionCode, fallbackExercise.solutionCode),
    solutionFiles: exAny.solutionFiles ?? fallbackExercise.solutionFiles,
  } as Exercise;
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
  const language = firstNonBlankString(
      exAny.language,
      workspaceRecord.language,
      "python",
  );

  const starterCode = firstNonBlankString(
      exAny.starterCode,
      workspaceRecord.starterCode,
      fileContentFromFiles(exAny.starterFiles ?? workspaceRecord.starterFiles, "main.py"),
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
  const { raw } = useTaggedT();

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
      return mergeProjectStepFallbackExercise(null, projectStepManifest);
    }

    const resolved = resolveDeepTagged(ps.exercise, (key) => raw(key, "")) as Exercise;
    return mergeProjectStepFallbackExercise(resolved, projectStepManifest);
  }, [ps?.exercise, raw, projectStepManifest]);

  const projectStepFallbackItem = useMemo(
      () =>
          buildProjectStepFallbackPracticeItem({
            q,
            exercise: ex,
            projectStepManifest,
          }),
      [q, ex, projectStepManifest],
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
            projectStepManifest,
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
  }, [ex, rawPracticeItem, projectStepManifest, projectStepFallbackItem]);

  const livePracticeManifest = useMemo(
      () =>
          mergeProjectStepFallbackExercise(
              (livePracticeItem?.exercise as Exercise | undefined) ?? ex,
              projectStepManifest,
          ),
      [ex, livePracticeItem, projectStepManifest],
  );

  const toolsEnabled = Boolean(toolsAny?.enabled);
  const isCodeInput = ex?.kind === "code_input";
  const resolvedCodeSurface = resolveCodeSurface({
    exercise: livePracticeManifest ?? ex,
    projectStepManifest,
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
    return manifestSlotId || getStableExerciseSlotId(q, projectStepManifest);
  }, [q, projectStepManifest, livePracticeManifest]);
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
  const practiceExerciseSqlDatasetId = String((livePracticeManifest as any)?.sqlDatasetId ?? "");
  const practiceExerciseHasSqlSchema =
      typeof (livePracticeManifest as any)?.sqlSchemaSql === "string";
  const practiceExerciseHasSqlSeed =
      typeof (livePracticeManifest as any)?.sqlSeedSql === "string";
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
  const practiceWorkspaceKey = JSON.stringify(
      (livePracticeManifest as any)?.workspace ??
      (livePracticeItem as any)?.workspace ??
      null,
  );

  const runtimeExerciseCode = useMemo(() => {
    return (
        getWorkspaceEntryCodeForPracticeCard(runtimeExercise?.workspace) ||
        (typeof runtimeExercise?.code === "string" ? runtimeExercise.code : "")
    );
  }, [runtimeExercise]);

  useLayoutEffect(() => {
    if (!livePracticeManifest) return;
    if (livePracticeManifest.kind !== "code_input") return;
    if (!livePracticeItem && !projectStepManifest) return;

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
    practiceItemReady,
    practiceStarterCode,
    practiceStarterFilesKey,
    practiceWorkspaceKey,
    projectStepManifest,
  ]);

  useLayoutEffect(() => {
    if (!livePracticeManifest) return;
    if (livePracticeManifest.kind !== "code_input") return;

    const itemWorkspace =
        getWorkspaceFromAnyState(livePracticeItem) ??
        getWorkspaceFromAnyState(livePracticeManifest);

    if (!itemWorkspace) return;

    const existingWorkspace = getWorkspaceFromAnyState(runtimeExercise);
    const existingIsProtected =
        runtimeExercise?.userEdited === true ||
        runtimeExercise?.workspaceOrigin === "user" ||
        runtimeExercise?.workspaceOrigin === "saved";

    if (existingIsProtected) return;

    const existingWorkspaceKey = JSON.stringify(existingWorkspace ?? null);
    const liveWorkspaceKey = JSON.stringify(itemWorkspace);
    if (existingWorkspaceKey === liveWorkspaceKey) return;

    const code = deriveEntryCode(itemWorkspace) || "";
    const stdin = typeof itemWorkspace.stdin === "string" ? itemWorkspace.stdin : "";
    const language = getManifestExerciseLanguage(livePracticeManifest);

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
      userEdited: false,
      workspaceOrigin: "starter",
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

  const hasInput = useMemo(() => {
    if (!ex || !ps?.item) return false;

    if (ex.kind === "code_input" && runtimeExerciseCode.trim().length > 0) {
      return true;
    }

    return !isEmptyPracticeAnswer(ex, ps.item, padRef?.current);
  }, [ex, ps?.item, padRef, runtimeExerciseCode]);

  const isCodeExerciseWithInput = ex?.kind === "code_input" && hasInput;

  const feedbackDismissed = Boolean((ps?.item as any)?.feedbackDismissed);

  const resultOk =
      typeof (ps?.item as any)?.result?.ok === "boolean"
          ? Boolean((ps?.item as any).result.ok)
          : null;

  const isCorrect =
      (Boolean((ps?.item as any)?.result?.finalized) && resultOk === true) ||
      ps?.ok === true ||
      resultOk === true;

  const isFinalized =
      Boolean((ps?.item as any)?.result?.finalized) ||
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
        {ui.t("practice.checking", {}, "Checking…")}
    </span>
  ) : (
      ui.t("buttons.checkAnswer", {}, "Check this answer")
  );

  const maxForRenderer = ps?.maxAttempts ?? Number.POSITIVE_INFINITY;

  const hasExercise = Boolean(ex && livePracticeItem);
  const hasProjectStepFallback = Boolean(projectStepManifest && projectStepFallbackItem);
  const isInitialLoading = Boolean(
      ps?.loading && !hasExercise && !hasProjectStepFallback && !ps?.error,
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

  useEffect(() => {
    if (!isInitialLoading) return;
    if (!loadTimedOut) return;
    if (!props.onRetryExercise) return;

    const retryKey = `${q.id}:${ps?.attempts ?? 0}`;
    if (autoRetriedRef.current === retryKey) return;

    autoRetriedRef.current = retryKey;
    props.onRetryExercise();
  }, [isInitialLoading, loadTimedOut, props.onRetryExercise, q.id, ps?.attempts]);

  const showStuckLoading = isInitialLoading && loadTimedOut;

  return (
      <div className={["p-2", !unlocked ? "opacity-70" : ""].join(" ")}>
        {!unlocked ? (
            <div className="ui-quiz-hint">
              {ui.t(
                  "unlockHint",
                  {},
                  "Answer the previous question correctly to unlock this one.",
              )}
            </div>
        ) : null}

        {showStuckLoading ? (
            <div className="ui-quiz-note-danger">
              <div>
                {ui.t(
                    "practice.loadingStuck",
                    {},
                    "This exercise is taking longer than expected to load.",
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {props.onRetryExercise ? (
                    <button
                        type="button"
                        onClick={props.onRetryExercise}
                        className="ui-quiz-action ui-quiz-action--ghost"
                    >
                      {ui.t("buttons.retry", {}, "Retry")}
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
                      ? ui.t("buttons.excused", {}, "Excused")
                      : ui.t("buttons.continue", {}, "Continue")}
                </button>
              </div>
            </div>
        ) : isInitialLoading ? (
            <div className="mt-2 ui-quiz-status-soft flex items-center gap-2">
              <span>{ui.t("practice.loadingExercise", {}, "Loading exercise…")}</span>
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
                      {ui.t("buttons.retry", {}, "Retry")}
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
                      ? ui.t("buttons.excused", {}, "Excused")
                      : ui.t("buttons.continue", {}, "Continue")}
                </button>
              </div>
            </div>
        ) : ex && livePracticeItem ? (
            <div className="mt-1">
              {isRefreshing ? (
                  <div className="mb-2 ui-quiz-status-soft flex items-center gap-2">
                    <span>{ui.t("practice.refreshing", {}, "Refreshing…")}</span>
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
                            {ui.t("buttons.retry", {}, "Retry")}
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
                        {nextHelpLabel ?? ui.t("buttons.help", {}, "Help")}
                      </button>
                  ) : null}
                </div>

                <div className="ui-quiz-checkrow-status">
              <span className="whitespace-normal">
                {ui.t(
                    "practice.attempts",
                    {
                      n: ps?.attempts ?? 0,
                      max: ps?.maxAttempts == null ? "∞" : ps.maxAttempts,
                    },
                    `Attempts: ${ps?.attempts ?? 0}/${ps?.maxAttempts == null ? "∞" : ps.maxAttempts}`,
                )}
              </span>

                  {isCorrect ? (
                      <span
                          className="ml-2 whitespace-nowrap ui-quiz-status-good"
                          data-testid="review-practice-result-correct"
                      >
      ✓ Correct
    </span>
                  ) : !feedbackDismissed && resultOk === false && ps?.item?.result ? (
                      <span
                          className="ml-2 whitespace-nowrap ui-quiz-status-danger"
                          data-testid="review-practice-result-incorrect"
                      >
      ✕ Not correct
    </span>
                  ) : null}
                </div>
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
              {ui.t("practice.noExercise", {}, "No exercise.")}
            </div>
        )}
      </div>
  );
}
