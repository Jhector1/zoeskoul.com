"use client";

import { useCallback, useMemo, useRef, useState, type ComponentProps } from "react";

import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import type { ExerciseToolsValue, RegisterExerciseToolArgs } from "@/components/tools/context/ExerciseToolsContext";
import type ToolsPanel from "@/components/tools/ToolsPanel";
import { useToolCodeRunnerState } from "@/components/review/module/hooks/useToolCodeRunnerState";
import { useReviewProgress } from "@/components/review/module/hooks/useReviewProgress";
import { getExerciseStateKey } from "@zoeskoul/learning-runtime/review/module/runtime/exerciseKeys";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import { resolveStablePracticeExerciseId } from "@/lib/practice/exerciseIdentity";
import { resolveReviewExerciseSourceCoordinates } from "@zoeskoul/learning-runtime/review/module/runtime/resolveReviewExerciseSourceCoordinates";
import { normalizeTopicProgressKey } from "@zoeskoul/learning-runtime";

export function isStandalonePracticeCodeExercise(
  exerciseKind:
    | string
    | null
    | undefined,
) {
  return (
    exerciseKind ===
    "code_input"
  );
}

export function shouldShowStandalonePracticeCodeTool(
  args: {
    busy: boolean;
    exerciseKind?:
      | string
      | null;
    currentExerciseKind?:
      | string
      | null;
  },
) {
  if (args.busy) {
    return true;
  }

  return isStandalonePracticeCodeExercise(
    args.exerciseKind ??
      args.currentExerciseKind,
  );
}

export function isStandalonePracticeToolBindingPending(args: {
  codeToolEnabled: boolean;
  busy: boolean;
  hasExercise: boolean;
  hasCurrent: boolean;
  boundId: string | null;
  exerciseStateKey: string;
}) {
  if (!args.codeToolEnabled) {
    return false;
  }

  /**
   * While the practice item itself is unresolved, keep the coordinated Tools
   * loading state. Once the exercise and item are available, however, the
   * editor can hydrate deterministically from exerciseStateKey even before the
   * optional formal bind callback finishes. Treating a null boundId as pending
   * made practice-only code exercises display "Loading exercise..." forever.
   */
  if (
    args.busy &&
    (!args.hasExercise || !args.hasCurrent)
  ) {
    return true;
  }

  /**
   * Formal Tools binding is advisory once the current exercise contract is
   * resolved. A stale previous-exercise boundId must not keep the deterministic
   * current workspace behind the loading mask forever.
   */
  return false;
}

export function buildStandalonePracticeToolsResetKey(args: {
  experienceMode: PracticeShellProps["experienceMode"];
  subjectSlug?: string | null;
  moduleSlug?: string | null;
  runtimeResetRevision: number;
}) {
  return [
    "standalone-practice-tools",
    args.experienceMode,
    args.subjectSlug ?? "practice",
    args.moduleSlug ?? args.experienceMode,
    args.runtimeResetRevision,
  ].join(":");
}


export function resolveStandalonePracticeToolsIdentity(args: {
  exerciseId: string;
  experienceMode: PracticeShellProps["experienceMode"];
  subjectSlug?: unknown;
  moduleSlug?: unknown;
  sectionSlug?: unknown;
  topicSlug?: unknown;
  exercise?: unknown;
  item?: unknown;
  selectedTargets?: readonly unknown[] | null;
}) {
  const sourceCoordinates = resolveReviewExerciseSourceCoordinates({
    exerciseKey: args.exerciseId,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    sectionSlug: args.sectionSlug,
    topicSlug: args.topicSlug,
    exercise: args.exercise,
    item: args.item,
    selectedTargets: args.selectedTargets,
  });

  const topicId = normalizeTopicProgressKey(sourceCoordinates.topicSlug || "all");
  const cardId = `standalone-${args.experienceMode}`;

  return {
    sourceCoordinates,
    topicId,
    cardId,
    exerciseStateKey: getExerciseStateKey(
      {
        subjectSlug:
          sourceCoordinates.subjectSlug || "practice",
        moduleSlug:
          sourceCoordinates.moduleSlug || args.experienceMode,
        sectionSlug:
          sourceCoordinates.sectionSlug || undefined,
        topicId,
        cardId,
      },
      args.exerciseId,
    ),
  };
}

export function useStandalonePracticeTools(args: {
  props: PracticeShellProps;
  rightCollapsed: boolean;
  rightW: number;
  onCollapse: () => void;
  onEnsureVisible: () => void;
}) {
  const { props, rightCollapsed, rightW, onCollapse, onEnsureVisible } = args;
  const [ephemeralToolProgress, setEphemeralToolProgress] = useState<{
    topics: Record<string, unknown>;
    [key: string]: unknown;
  }>({ topics: {} });
  const runtimeResetRevision = useReviewRuntimeStore((state) => state.resetRevision);

  const exerciseId = useMemo(
    () =>
      resolveStablePracticeExerciseId({
        item: props.current,
        exercise: props.exercise,
        fallbackIndex: props.idx,
      }),
    [props.current, props.exercise, props.idx],
  );

  const standaloneIdentity = resolveStandalonePracticeToolsIdentity({
    exerciseId,
    experienceMode: props.experienceMode,
    subjectSlug: props.subjectSlug,
    moduleSlug: props.moduleSlug,
    sectionSlug: props.section,
    topicSlug: props.topic,
    exercise: props.exercise,
    item: props.current,
    selectedTargets:
      props.modulePracticeProgress?.selectedTargets ?? null,
  });

  const topicId = standaloneIdentity.topicId;

  const persistenceFirstTopicRef = useRef<string | null>(null);
  if (
    persistenceFirstTopicRef.current == null &&
    topicId !== "all"
  ) {
    persistenceFirstTopicRef.current = topicId;
  }

  const persistModulePracticeWorkspace =
    props.experienceMode === "standard" &&
    Boolean(props.subjectSlug) &&
    Boolean(props.moduleSlug) &&
    persistenceFirstTopicRef.current != null;

  /**
   * Reuse the exact Review/Lesson persistence owner for standard module
   * Practice. The PracticeSession remains the canonical queue/attempt owner;
   * Review progress owns only the exercise-scoped editor/runtime workspace.
   *
   * moduleTopicIds=[] intentionally means "the module's canonical progress row"
   * here. Practice can round-robin across authored topics and does not own a
   * separate topic inventory. Exact exerciseStateKey identity prevents Practice
   * workspaces from colliding with lesson exercises.
   */
  const persistedReviewProgress = useReviewProgress({
    // Both Review/Lesson hooks already no-op when the persistence scope is
    // empty. Use that shared contract instead of depending on the Web-only
    // remoteSyncEnabled option.
    subjectSlug: persistModulePracticeWorkspace
      ? (props.subjectSlug ?? "")
      : "",
    moduleSlug: persistModulePracticeWorkspace
      ? (props.moduleSlug ?? "")
      : "",
    locale: props.locale ?? "en",
    firstTopicId: persistenceFirstTopicRef.current ?? topicId,
    moduleTopicIds: [],
    gamificationEnabled: false,
    followRemoteNavigation: false,
  });

  const toolProgress = persistModulePracticeWorkspace
    ? persistedReviewProgress.progress
    : ephemeralToolProgress;
  const setToolProgress = persistModulePracticeWorkspace
    ? persistedReviewProgress.setProgress
    : setEphemeralToolProgress;
  const toolProgressHydrated = persistModulePracticeWorkspace
    ? persistedReviewProgress.hydrated
    : true;

  const cardId = standaloneIdentity.cardId;

  const exerciseStateKey = standaloneIdentity.exerciseStateKey;

  const codeInputId = useMemo(
    () => `standalone-code:${exerciseStateKey}`,
    [exerciseStateKey],
  );

  const tool = useToolCodeRunnerState({
    progress: toolProgress,
    progressHydrated: toolProgressHydrated,
    setProgress: setToolProgress,
    viewTid: topicId,
    scopeKey: exerciseStateKey,
    /**
     * Same contract as Review/Lesson: defaults are authored defaults. Exact
     * learner work is restored by useToolCodeRunnerState from the scoped saved
     * runtime/progress state, never by feeding mutable current code back as a default.
     */
    defaultLang:
      (props.exercise?.kind === "code_input"
        ? props.exercise.language
        : undefined) ??
      "python",
    defaultCode:
      (props.exercise?.kind === "code_input"
        ? props.exercise.starterCode
        : undefined) ??
      "",
    defaultStdin:
      props.exercise?.kind === "code_input"
        ? ((props.exercise as any).starterStdin ?? "")
        : "",
    rightCollapsed,
    rightW,
    toolSaveDelayMs: 250,
  });

  const ensureVisible = useCallback(() => {
    onEnsureVisible();
  }, [onEnsureVisible]);

  const bind = useCallback(
    async (binding: { id: string } & RegisterExerciseToolArgs) => {
      await tool.bindCodeInput(
        binding as Parameters<typeof tool.bindCodeInput>[0],
      );
      return true;
    },
    [tool.bindCodeInput],
  );

  const unbind = useCallback(() => {
    void tool.flushLatest();
    tool.unbindCodeInput();
  }, [tool.flushLatest, tool.unbindCodeInput]);

  const providerProps = useMemo(
    () => ({
      enabled: true,
      mode: "manual" as const,
      // Provider lifetime is module/run scoped. The actual editor workspace
      // remains exercise-scoped through exerciseStateKey below. Resetting the
      // provider for every A -> B navigation can race child registration and
      // briefly leave the previous exercise bound in Tools.
      resetKey: buildStandalonePracticeToolsResetKey({
        experienceMode: props.experienceMode,
        subjectSlug: props.subjectSlug,
        moduleSlug: props.moduleSlug,
        runtimeResetRevision,
      }),
      ensureVisible,
      onBindToToolsPanel: bind,
      onUnbindFromToolsPanel: unbind,
    }),
    [
      bind,
      ensureVisible,
      props.experienceMode,
      props.moduleSlug,
      props.subjectSlug,
      runtimeResetRevision,
      unbind,
    ],
  );

  const codeToolEnabled =
    shouldShowStandalonePracticeCodeTool({
      busy: props.busy,
      exerciseKind:
        props.exercise?.kind,
      currentExerciseKind:
        props.current?.exercise?.kind,
    });

  const pendingExerciseBinding =
    isStandalonePracticeToolBindingPending({
      codeToolEnabled,
      busy: props.busy,
      hasExercise: Boolean(props.exercise),
      hasCurrent: Boolean(props.current),
      boundId: tool.boundId,
      exerciseStateKey,
    });

  const panelProps = useMemo<ComponentProps<typeof ToolsPanel>>(
    () => ({
      onCollapse,
      onUnbind: unbind,
      boundId: codeToolEnabled
        ? exerciseStateKey
        : null,
      pendingExerciseBinding,
      editorOwnerKey:
        codeToolEnabled
          ? exerciseStateKey
          : null,
      toolScopeKey: exerciseStateKey,
      rightBodyRef: tool.rightBodyRef,
      codeRunnerRegionH: tool.codeRunnerRegionH,
      toolHydrated: tool.toolHydrated,
      toolLang: tool.toolLang,
      toolCode: tool.toolCode,
      toolStdin: tool.toolStdin,
      toolWorkspace: tool.toolWorkspace,
      ideConfig: tool.toolIdeConfig,
      draftStorageMode: "off",
      onChangeCode: tool.setToolCode,
      onChangeStdin: tool.setToolStdin,
      onChangeWorkspace: tool.setToolWorkspace,
      onBeforeRun: tool.flushLatest,
      subjectSlug: props.subjectSlug ?? "practice",
      moduleId: props.moduleSlug ?? props.experienceMode,
      locale: props.locale ?? "en",
      codeEnabled: codeToolEnabled,
      // Match the lesson/review workspace: keep the editor/output surface,
      // but hide the secondary Tools/Run/More chrome in standalone Practice.
      showHeader: false,
      showLanguagePicker: false,
      showSqlDialectPicker: false,
      toolSqlDialect: tool.toolSqlDialect,
      sqlDatasetId: tool.toolSqlDatasetId,
      sqlSchemaSql: tool.toolSqlSchemaSql,
      sqlSeedSql: tool.toolSqlSeedSql,
      sqlInitialTableSnapshots: tool.toolSqlInitialTableSnapshots,
    }),
    [
      codeToolEnabled,
      exerciseStateKey,
      onCollapse,
      pendingExerciseBinding,
      props.experienceMode,
      props.locale,
      props.moduleSlug,
      props.subjectSlug,
      tool,
      unbind,
    ],
  );

  return {
    exerciseId,
    exerciseStateKey,
    codeInputId,
    cardId,
    codeToolEnabled,
    providerProps,
    panelProps,
  };
}

export type StandalonePracticeTools = ReturnType<typeof useStandalonePracticeTools>;
export type StandalonePracticeCodeTools = ExerciseToolsValue;
