"use client";

import * as React from "react";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import type { BatchRunResult } from "@/lib/code/types/batch";
import type { RunEvent } from "@/lib/code/types/session";
import type { RunnerState, OnRun } from "../types";
import { useRunSession } from "./useRunSession";
import { runBatchClient } from "./useBatchRun";

export type TerminalChunk = {
    id: number;
    kind: "pty" | "err" | "sys";
    data: string;
};

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export function useCodeRunnerController(args: {
    lang: CodeLanguage;
    code: string;
    sqlDialect?: SqlDialect;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlDatasetId?: string;
    disabled: boolean;
    allowRun: boolean;
    resetTerminalOnRun: boolean;
    onRun?: OnRun;
}) {
    const {
        lang,
        code,
        sqlDialect,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlDatasetId,
        disabled,
        allowRun,
        resetTerminalOnRun,
        onRun,
    } = args;

    const session = useRunSession();

    const [terminalFeed, setTerminalFeed] = React.useState<TerminalChunk[]>([]);
    const [inputEnabled, setInputEnabled] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [runState, setRunState] = React.useState<RunnerState>("idle");
    const [lastResult, setLastResult] = React.useState<BatchRunResult | null>(null);
    const [lastRunLanguage, setLastRunLanguage] = React.useState<CodeLanguage | null>(null);

    const isSql = lang === "sql";
    const lastHandledSeqRef = React.useRef(0);
    const nextChunkIdRef = React.useRef(1);

    const pushChunk = React.useCallback(
        (kind: TerminalChunk["kind"], data: string) => {
            if (!data) return;
            setTerminalFeed((prev) => [
                ...prev,
                { id: nextChunkIdRef.current++, kind, data },
            ]);
        },
        [],
    );

    const resetTerminal = React.useCallback(() => {
        lastHandledSeqRef.current = 0;
        nextChunkIdRef.current = 1;
        setTerminalFeed([]);
        setInputEnabled(false);
        setBusy(false);
        setRunState("idle");
        setLastResult(null);
        setLastRunLanguage(null);
    }, []);

    const sendTerminalData = React.useCallback(
        (data: string) => {
            if (!data || !inputEnabled) return;
            void session.sendInput(data);
        },
        [inputEnabled, session],
    );

    const sendTerminalResize = React.useCallback(
        (cols: number, rows: number) => {
            void session.resize(cols, rows);
        },
        [session],
    );

    const startRun = React.useCallback(async () => {
        if (disabled || !allowRun || busy) return;

        if (resetTerminalOnRun) {
            resetTerminal();
        } else {
            lastHandledSeqRef.current = 0;
            setInputEnabled(false);
            setLastResult(null);
        }

        setLastRunLanguage(lang);

        if (isSql) {
            setBusy(true);
            setRunState("starting");

            try {
                const result = await runBatchClient(
                    {
                        kind: "sql",
                        mode: "batch",
                        language: "sql",
                        dialect: sqlDialect ?? "sqlite",
                        code,
                        schemaSql: sqlSchemaSql ?? sqlSetupSql,
                        seedSql: sqlSeedSql,
                        datasetId: sqlDatasetId,
                    },
                    undefined,
                );

                setLastResult(result);
            } catch (e: any) {
                pushChunk("err", `${e?.message ?? "SQL run failed."}\r\n`);
            } finally {
                setBusy(false);
                setRunState("idle");
                setInputEnabled(false);
            }

            return;
        }

        if (onRun) {
            setBusy(true);
            setRunState("starting");

            let interactiveStarted = false;

            try {
                const result = await onRun({
                    language: lang,
                    code,
                    stdin: "",
                });

                if (result && typeof result === "object" && "sessionId" in result) {
                    session.connect(result.sessionId, result.state ?? "queued");
                    interactiveStarted = true;
                    return;
                }

                setLastResult(result as BatchRunResult);
            } catch (e: any) {
                pushChunk("err", `${e?.message ?? "Run failed."}\r\n`);
            } finally {
                if (!interactiveStarted) {
                    setBusy(false);
                    setRunState("idle");
                    setInputEnabled(false);
                }
            }

            return;
        }

        setBusy(true);
        setRunState("starting");

        try {
            await session.start({
                kind: "code",
                mode: "interactive",
                language: lang,
                code,
            });
        } catch (e: any) {
            pushChunk("err", `${e?.message ?? "Failed to start session."}\r\n`);
            setBusy(false);
            setRunState("idle");
            setInputEnabled(false);
        }
    }, [
        disabled,
        allowRun,
        busy,
        resetTerminalOnRun,
        resetTerminal,
        lang,
        isSql,
        sqlDialect,
        code,
        sqlSchemaSql,
        sqlSetupSql,
        sqlSeedSql,
        sqlDatasetId,
        onRun,
        session,
        pushChunk,
    ]);

    const cancelRun = React.useCallback(async () => {
        if (isSql) {
            setBusy(false);
            setInputEnabled(false);
            setRunState("idle");
            pushChunk("sys", "\r\n[run canceled]\r\n");
            return;
        }

        try {
            await session.cancel();
            pushChunk("sys", "\r\n[run canceled]\r\n");
        } finally {
            setBusy(false);
            setInputEnabled(false);
            setRunState("idle");
        }
    }, [session, isSql, pushChunk]);

    React.useEffect(() => {
        if (!session.events.length) return;

        const newEvents = session.events.filter(
            (ev) => ev.seq > lastHandledSeqRef.current,
        );
        if (!newEvents.length) return;

        for (const ev of newEvents) {
            lastHandledSeqRef.current = Math.max(lastHandledSeqRef.current, ev.seq);

            handleSessionEvent({
                ev,
                pushChunk,
                setBusy,
                setInputEnabled,
                setRunState,
            });
        }
    }, [session.events, pushChunk]);

    return {
        terminalFeed,
        inputEnabled,
        sendTerminalData,
        sendTerminalResize,
        busy,
        runState,
        canCancel:
            runState === "starting" ||
            runState === "running" ||
            inputEnabled,
        cancelRun,
        lastResult,
        lastRunLanguage,
        resetTerminal,
        startRun,
    };
}

function handleSessionEvent(args: {
    ev: RunEvent;
    pushChunk: (kind: TerminalChunk["kind"], data: string) => void;
    setBusy: React.Dispatch<React.SetStateAction<boolean>>;
    setInputEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    setRunState: React.Dispatch<React.SetStateAction<RunnerState>>;
}) {
    const { ev, pushChunk, setBusy, setInputEnabled, setRunState } = args;

    if (ev.type === "stdout") {
        pushChunk("pty", ev.chunk);
        return;
    }

    if (ev.type === "stderr") {
        pushChunk("err", ev.chunk);
        return;
    }

    if (ev.type === "status") {
        if (ev.state === "preparing" || ev.state === "compiling") {
            setBusy(true);
            setInputEnabled(false);
            setRunState("starting");
            return;
        }

        if (ev.state === "running") {
            setBusy(true);
            setInputEnabled(true);
            setRunState("running");
            return;
        }

        if (isFinalSessionState(ev.state)) {
            setBusy(false);
            setInputEnabled(false);
            setRunState("idle");
            return;
        }

        return;
    }

    if (ev.type === "compile_error") {
        if (ev.stdout) pushChunk("pty", ev.stdout);
        if (ev.stderr) pushChunk("err", ev.stderr);
        setBusy(false);
        setInputEnabled(false);
        setRunState("idle");
        return;
    }

    if (ev.type === "exit") {
        pushChunk("sys", `\r\n[process exited with code ${ev.code}]\r\n`);
        setBusy(false);
        setInputEnabled(false);
        setRunState("idle");
        return;
    }

    if (ev.type === "error") {
        pushChunk("err", `\r\n${ev.message}\r\n`);
        setBusy(false);
        setInputEnabled(false);
        setRunState("idle");
    }
}