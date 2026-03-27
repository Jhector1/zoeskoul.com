"use client";

import * as React from "react";
import type { RunEvent, RunSessionState } from "@/lib/code/types/session";
import type {
    SharedRunnerArgs,
    CodeRunnerController,
    TerminalChunk,
} from "../../runtime";
import type { RunnerState } from "../../types";
import { useRunSession } from "../useRunSession";
import { resolveRuntime } from "../controller/useResolvedRuntime";
import {CodeLanguage} from "@/lib/practice/types";

type StartedInteractiveSession = {
    ok?: true;
    sessionId: string;
    state: RunSessionState;
};
type PtyRunnerArgs = Omit<SharedRunnerArgs, "lang"> & {
    lang: Exclude<CodeLanguage, "sql">;
};

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

function isStartedInteractiveSession(value: unknown): value is StartedInteractiveSession {
    if (!value || typeof value !== "object") return false;

    const v = value as Record<string, unknown>;
    return (
        typeof v.sessionId === "string" &&
        typeof v.state === "string"
    );
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

export function usePtyRunner(args: PtyRunnerArgs): CodeRunnerController {
    const {
        lang,
        code,
        disabled,
        allowRun,
        resetTerminalOnRun,
        onRun,
    } = args;

    const runtime = resolveRuntime(args.runtime);
    const session = useRunSession();

    const [terminalFeed, setTerminalFeed] = React.useState<TerminalChunk[]>([]);
    const [inputEnabled, setInputEnabled] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [runState, setRunState] = React.useState<RunnerState>("idle");
    const [lastRunLanguage, setLastRunLanguage] = React.useState<typeof lang | null>(null);

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
        }

        setBusy(true);
        setRunState("starting");
        setLastRunLanguage(lang);

        try {
            if (onRun) {
                const started = await onRun({
                    language: lang as Exclude<typeof lang, "sql">,
                    code,
                    stdin: "",
                } as any);

                if (isStartedInteractiveSession(started)) {
                    session.connect(started.sessionId, started.state);
                    return;
                }
            }

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
        session,
        lang,
        code,
        onRun,
        pushChunk,
    ]);

    const cancelRun = React.useCallback(async () => {
        try {
            await session.cancel();
            pushChunk("sys", "\r\n[run canceled]\r\n");
        } finally {
            setBusy(false);
            setInputEnabled(false);
            setRunState("idle");
        }
    }, [session, pushChunk]);

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
        backend: "pty",
        runtime,

        busy,
        runState,
        canCancel:
            runState === "starting" ||
            runState === "running" ||
            inputEnabled,
        cancelRun,

        lastResult: null,
        lastRunLanguage,

        resetTerminal,
        startRun,

        transcript: null,
        stream: {
            terminalFeed,
            inputEnabled,
            sendTerminalData,
            sendTerminalResize,
        },
    };
}