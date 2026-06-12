"use client";

import type { SharedRunnerArgs, CodeRunnerController } from "../../runtime";
import { useTerminalRunner } from "../useTerminalRunner";

export function useJudge0Runner(args: SharedRunnerArgs): CodeRunnerController {
    const legacy = useTerminalRunner({
        lang: args.lang,
        code: args.code,
        getLatestCode: args.getLatestCode,
        stdin: (args as any).stdin,
        sqlDialect: args.sqlDialect,
        sqlSchemaSql: args.sqlSchemaSql,
        sqlSeedSql: args.sqlSeedSql,
        sqlSetupSql: args.sqlSetupSql,
        sqlDatasetId: args.sqlDatasetId,
        sqlResultShape: args.sqlResultShape,
        workspace: args.workspace,
        exerciseStateKey: args.exerciseStateKey,
        disabled: args.disabled,
        allowRun: args.allowRun,
        resetTerminalOnRun: args.resetTerminalOnRun,
        onRun: args.onRun!,
        getWorkspaceFiles: args.getWorkspaceFiles,
        onTerminalSnapshotFiles: args.onTerminalSnapshotFiles,
    });

    const isSql = args.lang === "sql";

    return {
        backend: isSql ? "sql" : "judge0",
        runtime: {
            backend: "judge0",
            terminalView: "plain",
        },

        busy: legacy.busy,
        runState: legacy.runState,
        canCancel: legacy.canCancel,
        cancelRun: legacy.cancelRun,

        lastResult: legacy.lastResult,
        lastRunLanguage: legacy.lastRunLanguage,

        resetTerminal: legacy.resetTerminal,
        startRun: legacy.startRun,

        transcript: isSql
            ? null
            : {
                terminal: legacy.terminal,
                stdinBuffer: legacy.stdinBuffer,
                awaitingInput: legacy.awaitingInput,
                inputPrompt: legacy.inputPrompt,
                inputLine: legacy.inputLine,
                setInputLine: legacy.setInputLine,
                inputRef: legacy.inputRef,
                submitInput: legacy.submitInput,
                typedLines: legacy.typedLines,
            },

        stream: isSql
            ? null
            : {
                terminalFeed: [],
                inputEnabled: false,
                sendTerminalData: () => {},
                sendTerminalResize: () => {},
            },
    };
}
