"use client";

import { useCallback, useMemo, useState, type ComponentProps } from "react";

import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import type { ExerciseToolsValue, RegisterExerciseToolArgs } from "@/components/tools/context/ExerciseToolsContext";
import type ToolsPanel from "@/components/tools/ToolsPanel";
import { useToolCodeRunnerState } from "@/components/review/module/hooks/useToolCodeRunnerState";
import { getExerciseStateKey } from "@/components/review/module/runtime/exerciseKeys";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { resolveStablePracticeExerciseId } from "@/lib/practice/exerciseIdentity";

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function useStandalonePracticeTools(args: {
  props: PracticeShellProps;
  rightCollapsed: boolean;
  rightW: number;
  onCollapse: () => void;
  onEnsureVisible: () => void;
}) {
  const { props, rightCollapsed, rightW, onCollapse, onEnsureVisible } = args;
  const [toolProgress, setToolProgress] = useState<any>({ topics: {} });
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
    progressHydrated: true,
    setProgress: setToolProgress,
    viewTid: topicId,
    scopeKey: exerciseStateKey,
    defaultLang: (props.current?.codeLang ?? (props.exercise as any)?.language ?? "python") as any,
    defaultCode: props.current?.code ?? (props.exercise as any)?.starterCode ?? "",
    defaultStdin: props.current?.codeStdin ?? props.current?.stdin ?? "",
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

  const panelProps = useMemo<ComponentProps<typeof ToolsPanel>>(
    () => ({
      onCollapse,
      onUnbind: unbind,
      boundId: tool.boundId ?? exerciseStateKey,
      pendingExerciseBinding:
        props.exercise?.kind === "code_input" && !tool.boundId,
      editorOwnerKey: exerciseStateKey,
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
      codeEnabled: true,
      // Only the standard review/practice experience exposes Notes and the
      // collapse menu. Daily Practice and public challenges stay task-focused.
      showHeader:
        props.experienceMode === "standard" || props.experienceMode === "practice",
      showLanguagePicker: false,
      showSqlDialectPicker: false,
      toolSqlDialect: tool.toolSqlDialect,
      sqlDatasetId: tool.toolSqlDatasetId,
      sqlSchemaSql: tool.toolSqlSchemaSql,
      sqlSeedSql: tool.toolSqlSeedSql,
      sqlInitialTableSnapshots: tool.toolSqlInitialTableSnapshots,
    }),
    [
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
    providerProps,
    panelProps,
  };
}

export type StandalonePracticeTools = ReturnType<typeof useStandalonePracticeTools>;
export type StandalonePracticeCodeTools = ExerciseToolsValue;
