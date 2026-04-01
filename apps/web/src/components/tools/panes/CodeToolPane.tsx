"use client";

import React, { useCallback, useEffect, useState } from "react";
import CodeRunner from "@/components/code/runner/CodeRunner";
import { CodeLanguage } from "@/lib/practice/types";
import { useElementSize } from "@/components/tools/hooks/useElementSize";
import { runViaApi } from "@/lib/code/runClient";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback/classify";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import type { OnRun } from "@/components/code/runner/types";

export default function CodeToolPane(props: {
    height: number;
    toolLang: CodeLanguage;
    toolCode: string;
    toolStdin: string;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onBeforeRun?: () => void | Promise<void>;
}) {
    const {
        toolLang,
        toolCode,
        toolStdin,
        onChangeCode,
        onChangeStdin,
        onBeforeRun,
    } = props;

    const tools = useReviewTools();
    const boundId = tools?.boundId ?? null;
    const clearRunFeedback = tools?.clearRunFeedback;
    const setRunFeedbackForCard = tools?.setRunFeedback;

    const { ref, size } = useElementSize<HTMLDivElement>();
    const runnerH = Math.max(320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);

    useEffect(() => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
    }, [toolLang, toolCode, toolStdin, boundId, clearRunFeedback]);
    const handleRun = useCallback<OnRun>(
        async (args) => {
            if (args.language === "sql") {
                const result = await runViaApi(
                    {
                        kind: "sql",
                        language: "sql",
                        dialect: args.sqlDialect,
                        code: args.code,
                        schemaSql: args.sqlSchemaSql,
                        seedSql: args.sqlSeedSql,
                        setupSql: args.setupSql,
                        datasetId: args.datasetId,
                    },
                    args.signal,
                );

                setRunFeedback(null);

                if (boundId) {
                    setRunFeedbackForCard?.(boundId, null);
                }

                return result;
            }

            const result = await runViaApi(
                {
                    kind: "code",
                    language: args.language,
                    code: args.code,
                    stdin: args.stdin ?? "",
                },
                args.signal,
            );

            const feedback = pickRunFeedbackFromResult({
                result,
                language: args.language,
                code: args.code,
            });

            setRunFeedback(feedback);

            if (boundId) {
                setRunFeedbackForCard?.(boundId, feedback);
            }

            return result;
        },
        [boundId, setRunFeedbackForCard],
    );

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <CodeRunner
                frame="plain"
                title="Run code"
                showHint={false}
                height={runnerH - 50}
                showTerminalDockToggle
                runtime={{ backend: "judge0", terminalView: "plain" }}
                showEditorThemeToggle
                fixedLanguage={toolLang}
                showLanguagePicker={false}
                code={toolCode}
                stdin={toolStdin}
                onChangeCode={(c: string) => {
                    setRunFeedback(null);
                    if (boundId) clearRunFeedback?.(boundId);
                    onChangeCode(c);
                }}
                onChangeStdin={(s) => {
                    setRunFeedback(null);
                    if (boundId) clearRunFeedback?.(boundId);
                    onChangeStdin(s);
                }}
                onBeforeRun={async () => {
                    setRunFeedback(null);
                    if (boundId) clearRunFeedback?.(boundId);
                    await onBeforeRun?.();
                }}
                onRun={handleRun}
            />

            {runFeedback ? (
                <div className="mt-3">
                    <CodeFeedbackCallout feedback={runFeedback} />
                </div>
            ) : null}
        </div>
    );
}