



"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
    CodeExpectedExample,
    Exercise,
    SqlDialect, WorkspaceLanguage,
} from "@/lib/practice/types";
import type { FileEntry, RunResult } from "@/lib/code/types";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback";
import { runViaApi } from "@/lib/code/runClient";
import CodeRunner, { CodeRunnerFrame } from "@/components/code/CodeRunner";
import { resolveEditableWorkspaceFileId } from "@/components/code/runner/workspaceEditing";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useTaggedT } from "@/i18n/tagged";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import {
    resolveSqlRunnerConfig,
    type SqlTableSnapshots,
} from "@/lib/subjects/sql/sql/runtime/resolveSqlRunnerConfig";
import {isRunnerLanguage, RunnerLanguage} from "@zoeskoul/code-contracts";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";

type CodeInputExercise = Extract<Exercise, { kind: "code_input" }>;

import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import { resolveExerciseWorkspace } from "@/components/review/module/runtime/exerciseWorkspaceResolver";
import { reviewDebug, summarizeWorkspace } from "@/components/review/module/runtime/reviewDebug";
import { exerciseDebug, summarizeExerciseWorkspace } from "@/components/review/module/runtime/exerciseDebug";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "@/components/review/module/runtime/reviewSaveDebug";

export type CodeInputAutoBindMode = "never" | "whenUnbound" | "whenActive" | "always";

function join(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function ExpectedExampleCard({
                                 example,
                             }: {
    example: CodeExpectedExample;
}) {
    if (example.kind === "terminal") {
        const blocks: Array<{ type: "label" | "body"; text: string }> = [];

        if (example.stdin && example.stdin.trim().length > 0) {
            blocks.push({ type: "label", text: "> input" });
            blocks.push({ type: "body", text: example.stdin.replace(/\n$/, "") });
        }

        blocks.push({ type: "label", text: "output" });
        blocks.push({ type: "body", text: example.stdout.replace(/\n$/, "") });

        return (
            <div className="ui-surface p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="ui-title-sm">Example</div>
                    <div className="ui-meta">{
                        // example.meta ??
                        "Expected example"}</div>
                </div>

                <div className="mt-2 whitespace-pre-wrap break-words px-2 font-mono text-xs leading-5">
                    {blocks.map((block, i) => (
                        <span
                            key={i}
                            className={join(
                                block.type === "label" ? "ui-text-soft" : "ui-text"
                            )}
                        >
                            {block.text}
                            {i < blocks.length - 1 ? "\n" : null}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    if (example.kind === "sql_result") {
        return (
            <div className="ui-page-surface p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="ui-title-sm">Expected result</div>
                    <div className="ui-meta">{
                        // example.meta ??
                        "Result preview"}</div>
                </div>

                <div className="mt-2 overflow-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                        <tr className="border-b border-black/10 dark:border-white/10">
                            {example.columns.map((col) => (
                                <th key={col} className="px-2 py-1 ui-text-soft font-medium">
                                    {col}
                                </th>
                            ))}
                        </tr>
                        </thead>

                        <tbody>
                        {example.rows.map((row, i) => (
                            <tr
                                key={i}
                                className="border-b border-black/5 dark:border-white/5"
                            >
                                {row.map((cell, j) => (
                                    <td key={j} className="px-2 py-1 ui-text">
                                        {cell == null ? "NULL" : String(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return null;
}

export default function CodeInputExerciseUI({
                                                exercise,
                                                code,
                                                stdin,
                                                language,
                                                onChangeCode,
                                                onChangeStdin,
                                                onChangeLanguage,
                                                disabled,
                                                onRun,
                                                checked = false,
                                                ok = null,
                                                feedbackDismissed = false,
                                                reviewCorrect = null,
                                                readOnly = false,
                                                variant = "embedded",
                                                toolsBound = false,
                                                toolsUnbound = false,
                                                onUseTools,
                                                onSyncTools,
                                                autoBindMode = "whenUnbound",
                                                showPrompt = true,
                                                frame = "plain",
                                                feedback = null,
                                                explanation = null,
                                                runFeedback = null,
                                                runFeedbackTick = 0,
                                                sketch,
                                                savedSketch,
                                                sqlDialect,
                                                sqlDatasetId,
                                                exerciseSqlDatasetId,
                                                sqlResultShape,
                                                sqlSchemaSql,
                                                sqlSeedSql,
                                                sqlSetupSql,
                                                sqlInitialTableSnapshots,
                                                exerciseRuntime,
                                                recipe,
                                                subjectRuntimeDefaults,
                                                courseRuntimeDefaults,
                                                moduleRuntimeDefaults,
                                                sectionRuntimeDefaults,
                                                topicRuntimeDefaults,
                                                exerciseKey,
                                                subjectSlug,
                                                moduleSlug,
                                                sectionSlug,
                                                topicId,
                                                cardId,
                                                workspace,
                                                onChangeWorkspace,
                                            }: {
    exercise: CodeInputExercise;
    code: string;
    stdin: string;
    language: RunnerLanguage;
    onChangeCode: (code: string) => void;
    onChangeStdin: (stdin: string) => void;
    onChangeLanguage: (l: RunnerLanguage) => void;
    disabled: boolean;
    onRun?: (args: {
        language: RunnerLanguage;
        code: string;
        stdin: string;
        entry?: string;
        files?: FileEntry[];
        sqlDialect?: SqlDialect;
        sqlDatasetId?: string;
        sqlResultShape?: "table";
        sqlSchemaSql?: string;
        sqlSeedSql?: string;
        sqlSetupSql?: string;
        sqlInitialTableSnapshots?: SqlTableSnapshots;
    }) => Promise<RunResult>;
    checked?: boolean;
    ok?: boolean | null;
    feedbackDismissed?: boolean;
    reviewCorrect?: { language: RunnerLanguage; code: string; stdin: string } | null;
    readOnly?: boolean;
    onSketchStateChange?: (s: any) => void;
    savedSketch?: any;
    variant?: "embedded" | "tools";
    toolsBound?: boolean;
    toolsUnbound?: boolean;
    onUseTools?: () => void;
    onSyncTools?: () => void;
    autoBindMode?: CodeInputAutoBindMode;
    showPrompt?: boolean;
    frame?: CodeRunnerFrame;
    feedback?: CodeFeedback | null;
    explanation?: string | null;
    runFeedback?: CodeFeedback | null;
    runFeedbackTick?: number;
    sketch?: any;
    // Removed duplicate savedSketch here if any

    sqlDialect?: SqlDialect;
    sqlDatasetId?: string;
    exerciseSqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
    exerciseRuntime?: unknown;
    recipe?: unknown;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;

    exerciseKey?: string | null;
    subjectSlug?: string | null;
    moduleSlug?: string | null;
    sectionSlug?: string | null;
    topicId?: string | null;
    cardId?: string | null;
    workspace?: WorkspaceStateV2 | null;
    onChangeWorkspace?: (workspace: WorkspaceStateV2) => void;
}) {
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);

    const lockLanguage = exercise.kind === "code_input" && Boolean(exercise.language);

    const handleCodeChange = useCallback(
        (nextCode: string) => {
            if (readOnly) return;

            if (workspace && onChangeWorkspace) {
                const entryId = resolveEditableWorkspaceFileId(
                    workspace,
                    workspace.activeFileId,
                );

                if (!entryId) {
                    return;
                }

                const nextWorkspace: WorkspaceStateV2 = {
                    ...workspace,
                    nodes: workspace.nodes.map((node) => {
                        if (node.kind === "file" && node.id === entryId) {
                            return {
                                ...node,
                                content: nextCode,
                                updatedAt: Date.now(),
                            };
                        }

                        return node;
                    }),
                };

                onChangeWorkspace(nextWorkspace);
                return;
            }

            onChangeCode(nextCode);
        },
        [readOnly, workspace, onChangeWorkspace, onChangeCode],
    );

    const handleStdinChange = useCallback(
        (nextStdin: string) => {
            if (readOnly) return;

            if (workspace && onChangeWorkspace) {
                onChangeWorkspace({
                    ...workspace,
                    stdin: nextStdin,
                });
                return;
            }

            onChangeStdin(nextStdin);
        },
        [readOnly, workspace, onChangeWorkspace, onChangeStdin],
    );

    const handleWorkspaceChange = useCallback(
        (nextWorkspace: WorkspaceStateV2) => {
            if (readOnly) return;

            const entryId = resolveEditableWorkspaceFileId(
                nextWorkspace,
                nextWorkspace.activeFileId,
            );
            const entryNode = nextWorkspace.nodes.find(
                (node) => node.kind === "file" && node.id === entryId,
            );

            const nextCode =
                entryNode && entryNode.kind === "file"
                    ? entryNode.content ?? ""
                    : "";

            const nextStdin = nextWorkspace.stdin ?? "";

            exerciseDebug("F_CodeInputExerciseUI_handleWorkspaceChange", {
                exerciseKey,
                exerciseId: exercise.id,
                nextCode,
                nextStdin,
                workspace: summarizeExerciseWorkspace(nextWorkspace),
            });

            reviewDebug("1_EDITOR_EMIT CodeInputExerciseUI.handleWorkspaceChange", {
                exerciseKey,
                nextCode,
                nextStdin,
                workspace: summarizeWorkspace(nextWorkspace),
            });

            reviewSaveDebug("exercise editor changed", {
                exerciseKey,
                exerciseId: exercise.id,
                nextCodeLength: String(nextCode ?? "").length,
                nextStdinLength: String(nextStdin ?? "").length,
                workspace: summarizeWorkspaceForSave(nextWorkspace),
            });

            onChangeWorkspace?.(nextWorkspace);

            if (exerciseKey) {
                patchExercise(exerciseKey, {
                    workspace: nextWorkspace,
                    codeWorkspace: nextWorkspace,
                    ideWorkspace: nextWorkspace,
                    stdin: nextStdin,
                    codeStdin: nextStdin,
                    code: nextCode,
                    source: nextCode,
                    language: nextWorkspace.language ?? language,
                    lang: nextWorkspace.language ?? language,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                } as any);
            }

            if (nextCode !== code) {
                onChangeCode(nextCode);
            }

            if (nextStdin !== stdin) {
                onChangeStdin(nextStdin);
            }
        },
        [
            readOnly,
            onChangeWorkspace,
            exerciseKey,
            patchExercise,
            code,
            stdin,
            onChangeCode,
            onChangeStdin,
        ],
    );

    const handleWorkspaceLanguageChange = useCallback(
        (l: RunnerLanguage) => {
            if (readOnly || lockLanguage) return;
            const newWorkspace = resolveExerciseWorkspace({
                language: l as any,
                manifest: exercise,
            });
            onChangeLanguage(l);
            onChangeWorkspace?.(newWorkspace);
        },
        [readOnly, lockLanguage, onChangeLanguage, onChangeWorkspace, exercise],
    );

    const showCorrect =
        checked && ok === false && reviewCorrect && typeof reviewCorrect.code === "string";
    const didAutoBind = useRef(false);
    const didFirstSync = useRef(false);

    /**
     * React can reuse this component while QuizPracticeCard switches from
     * exercise A to exercise B. If these refs are not reset, the new exercise
     * may never bind to Tools, leaving the right editor showing exercise A.
     */
    useEffect(() => {
        didAutoBind.current = false;
        didFirstSync.current = false;
    }, [exerciseKey, exercise.id, variant]);
    const ui = useTaggedT("practiceUi.codeInput");

    const [embeddedRunFeedback, setEmbeddedRunFeedback] = useState<CodeFeedback | null>(null);

    useEffect(() => {
        setEmbeddedRunFeedback(null);
    }, [code, stdin, language, sqlDialect, sqlDatasetId, sqlSchemaSql, sqlSeedSql]);

    /**
     * Checked-answer feedback is durable until the learner edits.
     * Runtime sync, hydration, and tool rebinding must not hide it.
     */
    const checkedFeedback =
        !feedbackDismissed && checked && ok === false ? feedback ?? null : null;
    const checkedExplanation =
        !feedbackDismissed && checked && ok === false ? explanation ?? null : null;

    const activeFeedback =
        !feedbackDismissed && checked && ok === false
            ? checkedFeedback
            : variant === "tools"
                ? runFeedback ?? null
                : embeddedRunFeedback;

    const activeExplanation =
        !feedbackDismissed && checked && ok === false ? checkedExplanation : null;

    const showFeedback = Boolean(activeFeedback || activeExplanation);

    const resolvedSql = resolveSqlRunnerConfig({
        language,
        sqlDialect,
        sqlDatasetId,
        exerciseSqlDatasetId,
        sqlResultShape,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
        exerciseRuntime,
        recipe,
        subjectRuntimeDefaults,
        courseRuntimeDefaults,
        moduleRuntimeDefaults,
        sectionRuntimeDefaults,
        topicRuntimeDefaults,
    });

    const executeEmbeddedRun = useCallback(
        async (args: {
            language: RunnerLanguage;
            code: string;
            stdin: string;
            entry?: string;
            files?: FileEntry[];
            sqlDialect?: SqlDialect;
            sqlDatasetId?: string;
            sqlResultShape?: "table";
            sqlSchemaSql?: string;
            sqlSeedSql?: string;
            sqlSetupSql?: string;
        }) => {
            setEmbeddedRunFeedback(null);

            const nextResolvedSql = resolveSqlRunnerConfig({
                language: args.language,
                sqlDialect: args.sqlDialect ?? sqlDialect,
                sqlDatasetId: args.sqlDatasetId ?? sqlDatasetId,
                exerciseSqlDatasetId: exerciseSqlDatasetId ?? args.sqlDatasetId ?? sqlDatasetId,
                sqlResultShape: args.sqlResultShape ?? sqlResultShape,
                sqlSchemaSql: args.sqlSchemaSql ?? sqlSchemaSql,
                sqlSeedSql: args.sqlSeedSql ?? sqlSeedSql,
                sqlSetupSql: args.sqlSetupSql ?? sqlSetupSql,
                sqlInitialTableSnapshots,
                exerciseRuntime,
                recipe,
                subjectRuntimeDefaults,
                courseRuntimeDefaults,
                moduleRuntimeDefaults,
                sectionRuntimeDefaults,
                topicRuntimeDefaults,
            });

            const result = onRun
                ? await onRun({
                    language: args.language,
                    code: args.code,
                    stdin: args.stdin,
                    entry: args.entry,
                    files: args.files,
                    sqlDialect: nextResolvedSql.isSql ? nextResolvedSql.sqlDialect : undefined,
                    sqlDatasetId: nextResolvedSql.isSql ? nextResolvedSql.sqlDatasetId : undefined,
                    sqlResultShape: nextResolvedSql.isSql ? nextResolvedSql.sqlResultShape : undefined,
                    sqlSchemaSql: nextResolvedSql.isSql ? nextResolvedSql.sqlSchemaSql : undefined,
                    sqlSeedSql: nextResolvedSql.isSql ? nextResolvedSql.sqlSeedSql : undefined,
                    sqlSetupSql: nextResolvedSql.isSql ? nextResolvedSql.sqlSetupSql : undefined,
                    sqlInitialTableSnapshots: nextResolvedSql.isSql
                        ? nextResolvedSql.sqlInitialTableSnapshots
                        : undefined,
                })
                : await (async () => {
                    if (nextResolvedSql.isSql) {
                        return runViaApi(
                            {
                                kind: "sql",
                                language: "sql",
                                dialect: nextResolvedSql.sqlDialect,
                                code: args.code,
                                schemaSql: nextResolvedSql.sqlSchemaSql ?? "",
                                seedSql: nextResolvedSql.sqlSeedSql ?? "",
                                datasetId: nextResolvedSql.sqlDatasetId,
                                resultShape: nextResolvedSql.sqlResultShape,
                            },
                            undefined,
                        );
                    }

                    if (args.language === "sql") {
                        throw new Error("Unexpected sql language in non-sql code run.");
                    }

                    return runViaApi(
                        args.entry && args.files?.length
                            ? {
                                kind: "code",
                                language: args.language,
                                entry: args.entry,
                                files: args.files,
                                stdin: args.stdin,
                              }
                            : {
                                kind: "code",
                                language: args.language,
                                code: args.code,
                                stdin: args.stdin,
                              },
                        undefined,
                    );
                })();

            const nextFeedback = pickRunFeedbackFromResult({
                result,
                language: args.language,
                code: args.code,
            });

            setEmbeddedRunFeedback(nextFeedback);
            return result;
        },
        [
            onRun,
            sqlDialect,
            sqlDatasetId,
            exerciseSqlDatasetId,
            sqlResultShape,
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
            sqlInitialTableSnapshots,
            exerciseRuntime,
            recipe,
            subjectRuntimeDefaults,
            courseRuntimeDefaults,
            moduleRuntimeDefaults,
            sectionRuntimeDefaults,
            topicRuntimeDefaults,
        ],
    );

    useEffect(() => {
        if (variant !== "tools") return;
        if (!onUseTools) return;
        if (toolsBound) return;
        if (didAutoBind.current) return;

        if (autoBindMode === "never") return;
        if (autoBindMode === "whenUnbound" && !toolsUnbound) return;

        /**
         * Exercise navigation is independent from main sketch/card navigation.
         *
         * Bind the active exercise to Tools even if the exercise is disabled,
         * checked, or readOnly. Those flags should lock validation/input rules,
         * not prevent Tools from switching to the active exercise workspace.
         */
        didAutoBind.current = true;
        onUseTools();
    }, [variant, onUseTools, toolsBound, toolsUnbound, autoBindMode, exerciseKey, exercise.id]);

    const hideBoundToolsCard =
        learnerUiFlags.compactLearnerUi &&
        variant === "tools" &&
        toolsBound;

    useEffect(() => {
        if (variant !== "tools") return;
        if (!toolsBound) return;
        if (!onSyncTools) return;

        if (!didFirstSync.current) {
            didFirstSync.current = true;
            return;
        }

        onSyncTools();
    }, [variant, toolsBound, code, stdin, language, onSyncTools, runFeedbackTick]);
    if (variant === "tools") {
        return (
            <div className="grid gap-3">
                {showPrompt ? <ExercisePrompt exercise={exercise} /> : null}

                {exercise.expectedExample ? (
                    <ExpectedExampleCard example={exercise.expectedExample} />
                ) : null}

                {!hideBoundToolsCard ? (
                    <div className="ui-page-surface p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="ui-title-sm">
                                    {ui.t("tools.title", {}, "Use the Code tab")}
                                </div>

                                <div className="mt-1 ui-meta">
                                    {ui.t("tools.language", {}, "Language")}: {" "}
                                    <span className="font-medium ui-text">{String(language ?? "python")}</span>
                                    {" • "}
                                    {toolsBound
                                        ? ui.t("tools.bound", {}, "Workspace ready")
                                        : ui.t("tools.notBound", {}, "Workspace opening")}
                                </div>
                                <div className="mt-2 ui-meta">
                                    {ui.t(
                                        "tools.desc",
                                        {},
                                        "Open the Code tab to edit and run your answer in the full workspace."
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onUseTools}
                                disabled={!onUseTools}
                                className={
                                    !onUseTools ? "ui-btn-disabled" : "ui-btn-secondary"
                                }
                                title={ui.t("tools.bindTitle", {}, "Open the full code workspace")}
                                aria-label={
                                    toolsBound
                                        ? ui.t("tools.boundAria", {}, "Bound ✓ Jump to Code Open in Tools")
                                        : ui.t("tools.openAria", {}, "Open in Tools Open Code")
                                }
                            >
                                {toolsBound
                                    ? ui.t("tools.boundShort", {}, "Jump to Code")
                                    : ui.t("tools.open", {}, "Open Code")}
                            </button>
                        </div>
                    </div>
                ) : null}

                {showFeedback ? (
                    <CodeFeedbackCallout
                        feedback={activeFeedback}
                        explanation={activeExplanation}
                    />
                ) : null}

                {showCorrect ? (
                    <div className="ui-surface-success p-3">
                        <div className="ui-meta-strong">
                            {ui.t("correctSolution", {}, "Correct solution")}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    const runnerTitle = showPrompt ? exercise.title : undefined;

    const isWorkspaceValid =
        workspace &&
        workspace.version === 2 &&
        Array.isArray(workspace.nodes) &&
        workspace.nodes.some((n) => n.kind === "file") &&
        workspace.activeFileId &&
        workspace.entryFileId;

    const runnerExerciseKey =
        exerciseKey ||
        [
            "code-input",
            subjectSlug || "subject",
            moduleSlug || "module",
            sectionSlug || "section",
            topicId || "topic",
            cardId || "card",
            exercise.id || "exercise",
        ].join(":");


    const runnerEditorModelKey = [
        runnerExerciseKey,
        workspace?.activeFileId || workspace?.entryFileId || "entry",
    ].join(":");

    if (workspace && !isWorkspaceValid) {
        if (process.env.NODE_ENV === "development") {
            console.warn("[CodeInputExerciseUI] Invalid workspace provided:", workspace);
        }
        return (
            <div className="p-4 border border-dashed border-ui-border rounded text-ui-soft text-sm italic">
                Preparing workspace...
            </div>
        );
    }

    return (
        <div
            className="grid gap-3"
            data-testid="code-input-exercise"
            data-exercise-key={runnerExerciseKey}
        >
            {showPrompt ? <ExercisePrompt exercise={exercise} /> : null}

            {exercise.expectedExample ? (
                <ExpectedExampleCard example={exercise.expectedExample} />
            ) : null}

            <CodeRunner
                key={`${runnerExerciseKey}:main`}
                testId="code-runner"
                editorTestId="code-editor"
                stdinTestId="code-stdin"
                outputTestId="code-output"
                mobileEditorTabTestId="code-mobile-editor-tab"
                mobileOutputTabTestId="code-mobile-output-tab"
                title={runnerTitle as any}
                frame={frame}
                hintMarkdown={exercise.hint}
                height={320}
                disabled={disabled || readOnly}
                allowReset={!readOnly}
                allowRun={!readOnly}
                showStdinEditor
                runtime={{ backend: "judge0", terminalView: "plain" }}
                showHint={false}
                showEditorThemeToggle={!readOnly}
                language={language}
                onChangeLanguage={handleWorkspaceLanguageChange as any}
                fixedLanguage={lockLanguage ? language : undefined}
                showLanguagePicker={lockLanguage ? false : true}
                code={code}
                stdin={stdin}
                workspace={workspace}
                activeWorkspaceFileId={workspace?.activeFileId}
                onChangeWorkspace={handleWorkspaceChange}
                exerciseStateKey={runnerExerciseKey}
                editorModelKey={runnerEditorModelKey}
                fixedSqlDialect={resolvedSql.isSql ? resolvedSql.sqlDialect : undefined}
                showSqlDialectPicker={resolvedSql.isSql ? false : undefined}
                sqlDatasetId={resolvedSql.isSql ? resolvedSql.sqlDatasetId : undefined}
                sqlResultShape={resolvedSql.isSql ? resolvedSql.sqlResultShape : undefined}
                sqlSchemaSql={resolvedSql.isSql ? (resolvedSql.sqlSchemaSql ?? "") : undefined}
                sqlSeedSql={resolvedSql.isSql ? (resolvedSql.sqlSeedSql ?? "") : undefined}
                sqlSetupSql={resolvedSql.isSql ? resolvedSql.sqlSetupSql : undefined}
                sqlInitialTableSnapshots={
                    resolvedSql.isSql ? resolvedSql.sqlInitialTableSnapshots : undefined
                }
                sqlPaneOptions={resolvedSql.isSql ? resolvedSql.sqlPaneOptions : undefined}
                onChangeCode={handleCodeChange}
                onChangeStdin={handleStdinChange}
                onRun={(args) =>
                    executeEmbeddedRun({
                        language: args.language,
                        code: args.code,
                        stdin: args.stdin ?? "",
                        sqlDialect: (args as any).sqlDialect,
                        sqlDatasetId: (args as any).sqlDatasetId,
                        sqlResultShape: (args as any).sqlResultShape,
                        sqlSchemaSql: (args as any).sqlSchemaSql,
                        sqlSeedSql: (args as any).sqlSeedSql,
                        sqlSetupSql: (args as any).sqlSetupSql,
                    })
                }
                fixedTerminalDock="bottom"
            />

            {showFeedback ? (
                <CodeFeedbackCallout
                    feedback={activeFeedback}
                    explanation={activeExplanation}
                />
            ) : null}

            {showCorrect ? (
                <div className="ui-surface-success p-3">
                    <div className="ui-meta-strong">Correct solution</div>

                    <div className="mt-2">
                        <CodeRunner
                            key={`${runnerExerciseKey}:correct`}
                            frame="plain"
                            title={undefined as any}
                            hintMarkdown={undefined as any}
                            height={(exercise as any).editorHeight ?? 260}
                            disabled
                            allowReset={false}
                            allowRun={false}
                            showHint={false}
                            runtime={{ backend: "judge0", terminalView: "plain" }}
                            showEditorThemeToggle={false}
                            showLanguagePicker={false}
                            language={reviewCorrect!.language}
                            fixedLanguage={reviewCorrect!.language}
                            onChangeLanguage={() => {}}
                            exerciseStateKey={`${runnerExerciseKey}:correct`}
                            editorModelKey={`${runnerExerciseKey}:correct`}
                            code={reviewCorrect!.code}
                            stdin={reviewCorrect!.stdin}
                            onChangeCode={() => {}}
                            onChangeStdin={() => {}}
                            onRun={undefined}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
