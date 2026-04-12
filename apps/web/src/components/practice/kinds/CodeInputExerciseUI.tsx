



"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
    CodeExpectedExample,
    CodeLanguage,
    Exercise,
    SqlDialect,
} from "@/lib/practice/types";
import type { RunResult } from "@/lib/code/types";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback";
import { runViaApi } from "@/lib/code/runClient";
import CodeRunner, { CodeRunnerFrame } from "@/components/code/CodeRunner";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useTaggedT } from "@/i18n/tagged";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import {
    resolveSqlRunnerConfig,
    type SqlTableSnapshots,
} from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";

type CodeInputExercise = Extract<Exercise, { kind: "code_input" }>;

export type CodeInputAutoBindMode = "never" | "whenUnbound" | "whenActive";

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
            <div className="ui-page-surface p-3">
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
                                                sqlDialect,
                                                sqlDatasetId,
                                                sqlSchemaSql,
                                                sqlSeedSql,
                                                sqlSetupSql,
                                                sqlInitialTableSnapshots,
                                            }: {
    exercise: CodeInputExercise;
    code: string;
    stdin: string;
    language: CodeLanguage;
    onChangeCode: (code: string) => void;
    onChangeStdin: (stdin: string) => void;
    onChangeLanguage: (l: CodeLanguage) => void;
    disabled: boolean;
    onRun?: (args: {
        language: CodeLanguage;
        code: string;
        stdin: string;
        sqlDialect?: SqlDialect;
        sqlDatasetId?: string;
        sqlSchemaSql?: string;
        sqlSeedSql?: string;
        sqlSetupSql?: string;
        sqlInitialTableSnapshots?: SqlTableSnapshots;
    }) => Promise<RunResult>;
    checked?: boolean;
    ok?: boolean | null;
    reviewCorrect?: { language: CodeLanguage; code: string; stdin: string } | null;
    readOnly?: boolean;
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

    sqlDialect?: SqlDialect;
    sqlDatasetId?: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
}) {
    const showCorrect =
        checked && ok === false && reviewCorrect && typeof reviewCorrect.code === "string";

    const lockLanguage = true;
    const didAutoBind = useRef(false);
    const didFirstSync = useRef(false);
    const ui = useTaggedT("practiceUi.codeInput");

    const [embeddedRunFeedback, setEmbeddedRunFeedback] = useState<CodeFeedback | null>(null);

    useEffect(() => {
        setEmbeddedRunFeedback(null);
    }, [code, stdin, language, sqlDialect, sqlDatasetId, sqlSchemaSql, sqlSeedSql]);

    const checkedFeedback = checked && ok === false ? feedback ?? null : null;
    const checkedExplanation = checked && ok === false ? explanation ?? null : null;

    const activeFeedback =
        checkedFeedback ??
        (variant === "tools" ? runFeedback ?? null : embeddedRunFeedback);

    const activeExplanation = checkedFeedback ? checkedExplanation : null;
    const showFeedback = Boolean(activeFeedback || activeExplanation);

    const resolvedSql = resolveSqlRunnerConfig({
        language,
        sqlDialect,
        sqlDatasetId,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
    });

    const executeEmbeddedRun = useCallback(
        async (args: {
            language: CodeLanguage;
            code: string;
            stdin: string;
        }) => {
            setEmbeddedRunFeedback(null);

            const nextResolvedSql = resolveSqlRunnerConfig({
                language: args.language,
                sqlDialect,
                sqlDatasetId,
                sqlSchemaSql,
                sqlSeedSql,
                sqlSetupSql,
                sqlInitialTableSnapshots,
            });

            const result = onRun
                ? await onRun({
                    language: args.language,
                    code: args.code,
                    stdin: args.stdin,
                    sqlDialect: nextResolvedSql.isSql ? nextResolvedSql.sqlDialect : undefined,
                    sqlDatasetId: nextResolvedSql.isSql ? nextResolvedSql.sqlDatasetId : undefined,
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
                            },
                            undefined,
                        );
                    }

                    if (args.language === "sql") {
                        throw new Error("Unexpected sql language in non-sql code run.");
                    }

                    return runViaApi(
                        {
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
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
            sqlInitialTableSnapshots,
        ],
    );

    useEffect(() => {
        if (variant !== "tools") return;
        if (!onUseTools) return;
        if (readOnly || disabled) return;
        if (toolsBound) return;
        if (didAutoBind.current) return;

        if (autoBindMode === "never") return;
        if (autoBindMode === "whenUnbound" && !toolsUnbound) return;

        didAutoBind.current = true;
        onUseTools();
    }, [variant, onUseTools, readOnly, disabled, toolsBound, toolsUnbound, autoBindMode]);

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

                <div className="ui-page-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="ui-title-sm">
                                {ui.t("tools.title", {}, "Solve in Tools")}
                            </div>

                            <div className="mt-1 ui-meta">
                                {ui.t("tools.language", {}, "Language")}:{" "}
                                <span className="font-medium ui-text">{String(language ?? "python")}</span>
                                {" • "}
                                {toolsBound
                                    ? ui.t("tools.bound", {}, "Bound to Tools")
                                    : ui.t("tools.notBound", {}, "Not bound yet")}
                            </div>

                            <div className="mt-2 ui-meta">
                                {ui.t(
                                    "tools.desc",
                                    {},
                                    "Write code, run it, and use Fill answer directly in the Tools pane."
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onUseTools}
                            disabled={disabled || readOnly || !onUseTools}
                            className={
                                disabled || readOnly || !onUseTools ? "ui-btn-disabled" : "ui-btn-secondary"
                            }
                            title={ui.t("tools.bindTitle", {}, "Bind this question to the Tools panel")}
                        >
                            {toolsBound
                                ? ui.t("tools.boundShort", {}, "Bound ✓")
                                : ui.t("tools.open", {}, "Open in Tools")}
                        </button>
                    </div>
                </div>

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

    return (
        <div className="grid gap-3">
            {showPrompt ? <ExercisePrompt exercise={exercise} /> : null}

            {exercise.expectedExample ? (
                <ExpectedExampleCard example={exercise.expectedExample} />
            ) : null}

            <CodeRunner
                title={runnerTitle as any}
                frame={frame}
                hintMarkdown={exercise.hint}
                height={320}
                disabled={disabled || readOnly}
                allowReset={!readOnly}
                allowRun={!readOnly}
                runtime={{ backend: "judge0", terminalView: "plain" }}
                showHint={false}
                showEditorThemeToggle={!readOnly}
                language={language}
                onChangeLanguage={onChangeLanguage}
                fixedLanguage={lockLanguage ? language : undefined}
                showLanguagePicker={lockLanguage ? false : true}
                code={code}
                stdin={stdin}
                fixedSqlDialect={resolvedSql.isSql ? resolvedSql.sqlDialect : undefined}
                showSqlDialectPicker={resolvedSql.isSql ? false : undefined}
                sqlSchemaSql={resolvedSql.isSql ? (resolvedSql.sqlSchemaSql ?? "") : undefined}
                sqlSeedSql={resolvedSql.isSql ? (resolvedSql.sqlSeedSql ?? "") : undefined}
                sqlInitialTableSnapshots={
                    resolvedSql.isSql ? resolvedSql.sqlInitialTableSnapshots : undefined
                }
                onChangeCode={(c) => !readOnly && onChangeCode(c)}
                onChangeStdin={(s) => !readOnly && onChangeStdin(s)}
                onRun={(args) =>
                    executeEmbeddedRun({
                        language: args.language,
                        code: args.code,
                        stdin: args.stdin ?? "",
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