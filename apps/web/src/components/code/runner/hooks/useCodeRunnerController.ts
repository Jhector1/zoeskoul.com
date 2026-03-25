// src/components/code/runner/hooks/useCodeRunnerController.ts
"use client";

import * as React from "react";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import type { BatchRunResult } from "@/lib/code/types/batch";
import type { RunEvent } from "@/lib/code/types/session";
import type {TermLine, RunnerState, OnRun} from "../types";
import { useRunSession } from "./useRunSession";
import { runBatchClient } from "./useBatchRun";

function appendChunk(
    prev: TermLine[],
    type: "out" | "err" | "sys",
    chunk: string,
): TermLine[] {
    const text = String(chunk ?? "");
    if (!text) return prev;

    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const next = [...prev];
    if (next.length === 0) {
        next.push({ type, text: "" });
    }

    for (const ch of normalized) {
        const last = next[next.length - 1];

        if (ch === "\n") {
            next.push({ type, text: "" });
            continue;
        }

        if (last.type === type) {
            next[next.length - 1] = {
                ...last,
                text: last.text + ch,
            };
            continue;
        }

        if (last.text === "") {
            next[next.length - 1] = {
                type,
                text: ch,
            };
            continue;
        }

        next.push({ type, text: ch });
    }

    return trimTrailingDuplicateEmpty(next);
}

function trimTrailingDuplicateEmpty(lines: TermLine[]) {
    const next = [...lines];
    while (next.length >= 2) {
        const a = next[next.length - 1];
        const b = next[next.length - 2];
        if (a.text === "" && b.text === "") {
            next.pop();
            continue;
        }
        break;
    }
    return next;
}

function commitSubmittedInput(prev: TermLine[], value: string): TermLine[] {
    const text = String(value ?? "");
    const next = [...prev];

    if (next.length === 0) {
        next.push({ type: "out", text });
        next.push({ type: "out", text: "" });
        return next;
    }

    const last = next[next.length - 1];

    next[next.length - 1] = {
        ...last,
        text: last.text + text,
    };

    // Simulate pressing Enter: move terminal to a fresh new line
    next.push({ type: "out", text: "" });

    return next;
}

function endsWithLineBreak(_text: string) {
    return false;
}

function squashTrailingEmpty(lines: TermLine[]) {
    const next = [...lines];
    while (next.length >= 2) {
        const a = next[next.length - 1];
        const b = next[next.length - 2];
        if (a.text === "" && b.text === "") {
            next.pop();
            continue;
        }
        break;
    }
    return next;
}

function appendInputEcho(prev: TermLine[], value: string): TermLine[] {
    const text = String(value ?? "");
    const next = [...prev];
    const last = next[next.length - 1];

    if (last) {
        next[next.length - 1] = {
            ...last,
            text: last.text + text,
        };
        return next;
    }

    return [{ type: "in", text }];
}

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
    onRun?: OnRun; // ✅ ADD THIS

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

    const [terminal, setTerminal] = React.useState<TermLine[]>([]);
    const [stdinBuffer, setStdinBuffer] = React.useState("");
    const [awaitingInput, setAwaitingInput] = React.useState(false);
    const [inputPrompt, setInputPrompt] = React.useState("");
    const [inputLine, setInputLine] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [runState, setRunState] = React.useState<RunnerState>("idle");
    const [lastResult, setLastResult] = React.useState<BatchRunResult | null>(null);
    const [lastRunLanguage, setLastRunLanguage] = React.useState<CodeLanguage | null>(null);
    const [typedLines, setTypedLines] = React.useState<string[]>([]);

    const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
    const lastHandledSeqRef = React.useRef(0);

    const isSql = lang === "sql";

    const resetTerminal = React.useCallback(() => {
        lastHandledSeqRef.current = 0;
        setTerminal([]);
        setStdinBuffer("");
        setAwaitingInput(false);
        setInputPrompt("");
        setInputLine("");
        setBusy(false);
        setRunState("idle");
        setLastResult(null);
        setLastRunLanguage(null);
        setTypedLines([]);
    }, []);
    const startRun = React.useCallback(async () => {
        if (disabled || !allowRun || busy) return;

        if (resetTerminalOnRun) {
            resetTerminal();
        } else {
            lastHandledSeqRef.current = 0;
            setAwaitingInput(false);
            setInputPrompt("");
            setInputLine("");
            setLastResult(null);
            setTypedLines([]);
            setStdinBuffer("");
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
                setTerminal((prev) => [
                    ...prev,
                    { type: "err", text: e?.message ?? "SQL run failed." },
                ]);
            } finally {
                setBusy(false);
                setRunState("idle");
            }

            return;
        }

        // IDE / custom runner path
        if (onRun) {
            setBusy(true);
            setRunState("starting");

            let interactiveStarted = false;

            try {
                const result = await onRun({
                    language: lang,
                    code,
                    stdin: stdinBuffer,
                });

                if (result && typeof result === "object" && "sessionId" in result) {
                    session.connect(result.sessionId, result.state ?? "queued");
                    interactiveStarted = true;
                    return;
                }

                setLastResult(result as BatchRunResult);
            } catch (e: any) {
                setTerminal((prev) => [
                    ...prev,
                    { type: "err", text: e?.message ?? "Run failed." },
                ]);
            } finally {
                if (!interactiveStarted) {
                    setBusy(false);
                    setRunState("idle");
                }
            }

            return;
        }

        // Standalone interactive fallback
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
            setTerminal((prev) => [
                ...prev,
                { type: "err", text: e?.message ?? "Failed to start session." },
            ]);
            setBusy(false);
            setRunState("idle");
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
        stdinBuffer,
        session,
    ]);

    const submitInput = React.useCallback(async () => {
        if (!awaitingInput || !session.sessionId) return;

        const value = String(inputLine ?? "");

        setTerminal((prev) => commitSubmittedInput(prev, value));
        setTypedLines((prev) => [...prev, value]);
        setStdinBuffer((prev) => prev + value + "\n");

        setInputLine("");
        setAwaitingInput(false);
        setInputPrompt("");
        setRunState("running");
        setBusy(true);

        try {
            await session.sendInput(value + "\n");
        } catch (e: any) {
            setTerminal((prev) => [
                ...prev,
                { type: "err", text: e?.message ?? "Failed to send input." },
            ]);
            setBusy(false);
            setRunState("idle");
        }
    }, [awaitingInput, session, inputLine]);
    const cancelRun = React.useCallback(async () => {
        if (isSql) {
            setBusy(false);
            setAwaitingInput(false);
            setRunState("idle");
            return;
        }

        try {
            await session.cancel();
        } finally {
            setBusy(false);
            setAwaitingInput(false);
            setInputPrompt("");
            setRunState("idle");
            setTerminal((prev) => [...prev, { type: "sys", text: "Run canceled." }]);
        }
    }, [session, isSql]);

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
                setTerminal,
                setBusy,
                setAwaitingInput,
                setInputPrompt,
                setRunState,
            });
        }
    }, [session.events]);

    return {
        stdinBuffer,
        terminal,
        awaitingInput,
        inputPrompt,
        inputLine,
        setInputLine,
        inputRef,
        busy,
        runState,
        canCancel:
            runState === "starting" ||
            runState === "running" ||
            runState === "awaiting_input",
        cancelRun,
        lastResult,
        lastRunLanguage,
        resetTerminal,
        startRun,
        submitInput,
        typedLines,
    };
}

function handleSessionEvent(args: {
    ev: RunEvent;
    setTerminal: React.Dispatch<React.SetStateAction<TermLine[]>>;
    setBusy: React.Dispatch<React.SetStateAction<boolean>>;
    setAwaitingInput: React.Dispatch<React.SetStateAction<boolean>>;
    setInputPrompt: React.Dispatch<React.SetStateAction<string>>;
    setRunState: React.Dispatch<React.SetStateAction<RunnerState>>;
}) {
    const {
        ev,
        setTerminal,
        setBusy,
        setAwaitingInput,
        setInputPrompt,
        setRunState,
    } = args;

    if (ev.type === "stdout") {
        setTerminal((prev) => appendChunk(prev, "out", ev.chunk));
        return;
    }

    if (ev.type === "stderr") {
        setTerminal((prev) => appendChunk(prev, "err", ev.chunk));
        return;
    }

    if (ev.type === "input_request") {
        setBusy(false);
        setAwaitingInput(true);
        setInputPrompt("");
        setRunState("awaiting_input");
        return;
    }

    if (ev.type === "status") {
        if (ev.state === "preparing" || ev.state === "compiling") {
            setBusy(true);
            setAwaitingInput(false);
            setRunState("starting");
            return;
        }

        if (ev.state === "running") {
            setBusy(true);
            setAwaitingInput(false);
            setRunState("running");
            return;
        }

        if (ev.state === "waiting_for_input") {
            setBusy(false);
            setAwaitingInput(true);
            setRunState("awaiting_input");
            return;
        }

        if (isFinalSessionState(ev.state)) {
            setBusy(false);
            setAwaitingInput(false);
            setInputPrompt("");
            setRunState("idle");
            return;
        }

        return;
    }

    if (ev.type === "compile_error") {
        if (ev.stdout) {
            setTerminal((prev) => appendChunk(prev, "out", ev.stdout));
        }
        if (ev.stderr) {
            setTerminal((prev) => appendChunk(prev, "err", ev.stderr));
        }
        setBusy(false);
        setAwaitingInput(false);
        setInputPrompt("");
        setRunState("idle");
        return;
    }

    if (ev.type === "exit") {
        setTerminal((prev) => [
            ...prev,
            { type: "sys", text: `Process exited with code ${ev.code}` },
        ]);
        setBusy(false);
        setAwaitingInput(false);
        setInputPrompt("");
        setRunState("idle");
        return;
    }

    if (ev.type === "error") {
        setTerminal((prev) => [...prev, { type: "err", text: ev.message }]);
        setBusy(false);
        setAwaitingInput(false);
        setInputPrompt("");
        setRunState("idle");
    }
}