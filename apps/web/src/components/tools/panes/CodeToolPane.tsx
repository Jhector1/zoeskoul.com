"use client";

import React, { useCallback, useEffect, useState } from "react";
import CodeRunner from "@/components/code/runner/CodeRunner";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import { useElementSize } from "@/components/tools/hooks/useElementSize";
import { runViaApi } from "@/lib/code/runClient";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import type { OnRun } from "@/components/code/runner/types";
import {TerminalRunnerLanguage} from "@zoeskoul/code-contracts";

type SqlTableSnapshot = {
    name: string;
    columns: Array<{
        name: string;
        type?: string | null;
    }>;
    rows: unknown[][];
    rowCount: number;
};

type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

export default function CodeToolPane(props: {
    height: number;
    toolLang: TerminalRunnerLanguage;
    toolCode: string;
    toolStdin: string;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onBeforeRun?: () => void | Promise<void>;

    // SQL lesson-controlled config
    sqlDialect?: SqlDialect;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string; // optional legacy alias
    sqlInitialTableSnapshots?: SqlTableSnapshots;
}) {
    const {
        toolLang,
        toolCode,
        toolStdin,
        onChangeCode,
        onChangeStdin,
        onBeforeRun,
        sqlDialect = "sqlite",
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
    } = props;

    const tools = useReviewTools();
    const boundId = tools?.boundId ?? null;
    const clearRunFeedback = tools?.clearRunFeedback;
    const setRunFeedbackForCard = tools?.setRunFeedback;
    const syncCodeInputSnapshot = tools?.syncCodeInputSnapshot;

    const { ref, size } = useElementSize<HTMLDivElement>();
    const runnerH = Math.max(320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);

    useEffect(() => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
    }, [toolLang, toolCode, toolStdin, boundId, clearRunFeedback]);

    const handleRun = useCallback<OnRun>(
        async (args: any) => {
            const result =
                args.language === "sql"
                    ? await runViaApi(
                        {
                            kind: "sql",
                            language: "sql",
                            dialect: sqlDialect,
                            code: args.code,
                            schemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                            seedSql: sqlSeedSql ?? "",
                        },
                        args.signal,
                    )
                    : await runViaApi(
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
        [boundId, setRunFeedbackForCard, sqlDialect, sqlSchemaSql, sqlSeedSql, sqlSetupSql],
    );

    const isSql = toolLang === "sql";

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <CodeRunner
                frame="plain"
                title={isSql ? "Run SQL" : "Run code"}
                showHint={false}
                height={runnerH - 50}
                showTerminalDockToggle
                runtime={{ backend: "judge0", terminalView: "plain" }}
                showEditorThemeToggle
                fixedLanguage={toolLang}
                showLanguagePicker={false}
                code={toolCode}
                stdin={toolStdin}
                fixedSqlDialect={isSql ? sqlDialect : undefined}
                showSqlDialectPicker={false}
                sqlSchemaSql={isSql ? (sqlSchemaSql ?? sqlSetupSql ?? "") : undefined}
                sqlSeedSql={isSql ? (sqlSeedSql ?? "") : undefined}
                sqlInitialTableSnapshots={isSql ? sqlInitialTableSnapshots : undefined}
                onChangeCode={(c: string) => {
                    setRunFeedback(null);
                    if (boundId) clearRunFeedback?.(boundId);

                    onChangeCode(c);

                    if (boundId) {
                        syncCodeInputSnapshot?.(boundId, {
                            code: c,
                            submitted: false,
                            result: null,
                        });
                    }
                }}
                onChangeStdin={(s: string) => {
                    setRunFeedback(null);
                    if (boundId) clearRunFeedback?.(boundId);

                    onChangeStdin(s);

                    if (boundId) {
                        syncCodeInputSnapshot?.(boundId, {
                            codeStdin: s,
                            submitted: false,
                            result: null,
                        });
                    }
                }}
                onBeforeRun={async () => {
                    setRunFeedback(null);
                    if (boundId) clearRunFeedback?.(boundId);
                    await onBeforeRun?.();
                }}
                onRun={handleRun}
            />

            {!isSql && runFeedback ? (
                <div className="mt-3">
                    <CodeFeedbackCallout feedback={runFeedback} />
                </div>
            ) : null}
        </div>
    );
}