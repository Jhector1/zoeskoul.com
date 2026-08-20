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

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

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

export function useStandalonePracticeTools(args: {
  props: PracticeShellProps;
  rightCollapsed: boolean;
  rightW: number;
  onCollapse: () => void;
  onEnsureVisible: () => void;
}) {
  const { props, rightCollapsed, rightW, onCollapse, onEnsureVisible } = args;
  const [ephemeralToolProgress, setEphemeralToolProgress] = useState<any>({ topics: {} });
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

  const topicId = useMemo(
    () =>
      firstText(
        props.exercise?.topic,
        props.topic,
        (props.current as any)?.topic,
        "all",
      ) ?? "all",
    [props.current, props.exercise?.topic, props.topic],
  );

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

  const cardId = useMemo(
    () => `standalone-${props.experienceMode}`,
    [props.experienceMode],
  );

  const exerciseStateKey = useMemo(
    () =>
      getExerciseStateKey(
        {
          subjectSlug: props.subjectSlug ?? "practice",
          moduleSlug: props.moduleSlug ?? props.experienceMode,
          sectionSlug: props.section ?? undefined,
          topicId,
          cardId,
        },
        exerciseId,
      ),
    [
      cardId,
      exerciseId,
      props.experienceMode,
      props.moduleSlug,
      props.section,
      props.subjectSlug,
      topicId,
    ],
  );

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
    defaultLang: ((props.exercise as any)?.language ?? "python") as any,
    defaultCode: (props.exercise as any)?.starterCode ?? "",
    defaultStdin: (props.exercise as any)?.starterStdin ?? "",
    rightCollapsed,
    rightW,
    toolSaveDelayMs: 250,
  });

  const ensureVisible = useCallback(() => {
    onEnsureVisible();
  }, [onEnsureVisible]);

  const bind = useCallback(
    async (binding: { id: string } & RegisterExerciseToolArgs) => {
      await tool.bindCodeInput(binding as any);
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
      resetKey: `${exerciseStateKey}:${runtimeResetRevision}`,
      ensureVisible,
      onBindToToolsPanel: bind,
      onUnbindFromToolsPanel: unbind,
    }),
    [bind, ensureVisible, exerciseStateKey, runtimeResetRevision, unbind],
  );

  const codeToolEnabled =
    shouldShowStandalonePracticeCodeTool({
      busy: props.busy,
      exerciseKind:
        props.exercise?.kind,
      currentExerciseKind:
        props.current?.exercise?.kind,
    });

  const panelProps = useMemo<ComponentProps<typeof ToolsPanel>>(
    () => ({
      onCollapse,
      onUnbind: unbind,
      boundId: codeToolEnabled
        ? tool.boundId ??
          exerciseStateKey
        : null,
      pendingExerciseBinding:
        codeToolEnabled &&
        tool.boundId !==
          exerciseStateKey,
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
