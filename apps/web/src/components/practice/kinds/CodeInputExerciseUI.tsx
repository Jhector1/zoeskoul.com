"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CodeLanguage, Exercise } from "@/lib/practice/types";
import type { RunResult } from "@/lib/code/types";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback/classify";
import { runViaApi } from "@/lib/code/runClient";
import CodeRunner, { CodeRunnerFrame } from "@/components/code/CodeRunner";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useTaggedT } from "@/i18n/tagged";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import {InteractiveLanguage} from "@zoeskoul/code-contracts";
import {isInteractiveLanguage} from "@/components/practice/practiceType";

type CodeInputExercise = Extract<Exercise, { kind: "code_input" }>;

export type CodeInputAutoBindMode = "never" | "whenUnbound" | "whenActive";

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
                                            }: {
    exercise: CodeInputExercise;
    code: string;
    stdin: string;
    language: CodeLanguage;
    onChangeCode: (code: string) => void;
    onChangeStdin: (stdin: string) => void;
    onChangeLanguage: (l: CodeLanguage) => void;
    disabled: boolean;
    onRun?: (args: { language: CodeLanguage; code: string; stdin: string }) => Promise<RunResult>;
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
    }, [code, stdin, language]);

    const checkedFeedback = checked && ok === false ? feedback ?? null : null;
    const checkedExplanation = checked && ok === false ? explanation ?? null : null;

    const activeFeedback =
        checkedFeedback ??
        (variant === "tools" ? runFeedback ?? null : embeddedRunFeedback);

    const activeExplanation = checkedFeedback ? checkedExplanation : null;
    const showFeedback = Boolean(activeFeedback || activeExplanation);

    const executeEmbeddedRun = useCallback(
        async (args: { language: CodeLanguage; code: string; stdin: string }) => {
            setEmbeddedRunFeedback(null);
            if (!isInteractiveLanguage(args.language)) {
                                throw new Error("SQL is not supported in CodeInputExerciseUI embedded runner.");
            }
            const result = onRun
                ? await onRun(args)
                : await runViaApi(
                    {
                        kind: "code",
                        language: args.language,
                        code: args.code,
                        stdin: args.stdin,
                    },
                    undefined,
                );

            const nextFeedback = pickRunFeedbackFromResult({
                result,
                language: args.language,
                code: args.code,
            });

            setEmbeddedRunFeedback(nextFeedback);
            return result;
        },
        [onRun],
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