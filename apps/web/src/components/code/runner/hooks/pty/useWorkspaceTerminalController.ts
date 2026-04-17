"use client";

import * as React from "react";
import type {
    FileEntry,
    RunSessionState,
} from "@zoeskoul/code-contracts";
import type {
    TerminalChunk,
    WorkspaceTerminalController,
    WorkspaceTerminalConfig,
} from "../../runtime";
import { useRunSession } from "../useRunSession";

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

function normalizeFiles(
    files: WorkspaceTerminalConfig["initialFiles"],
): FileEntry[] | undefined {
    if (!files) return undefined;
    if (Array.isArray(files)) return files;

    return Object.entries(files).map(([path, content]) => ({
        path,
        content,
    }));
}

type UseWorkspaceTerminalArgs = WorkspaceTerminalConfig & {
    enabled: boolean;
};

export function useWorkspaceTerminalController(
    args: UseWorkspaceTerminalArgs,
): WorkspaceTerminalController {
    const {
        sessionId,
        state: sessionState,
        events,
        start,
        sendInput,
        resize: sessionResize,
        cancel,
        closeSocket,
    } = useRunSession();

    const [terminalFeed, setTerminalFeed] = React.useState<TerminalChunk[]>([]);
    const [inputEnabled, setInputEnabled] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [state, setState] = React.useState<RunSessionState | "idle">("idle");
    const [started, setStarted] = React.useState(false);
    const [starting, setStarting] = React.useState(false);

    const nextChunkIdRef = React.useRef(1);
    const lastHandledSeqRef = React.useRef(0);

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

    const reset = React.useCallback(() => {
        closeSocket();
        lastHandledSeqRef.current = 0;
        nextChunkIdRef.current = 1;
        setTerminalFeed([]);
        setInputEnabled(false);
        setBusy(false);
        setState("idle");
        setStarted(false);
        setStarting(false);
    }, [closeSocket]);

    const open = React.useCallback(async () => {
        if (!args.enabled) return;
        if (starting) return;
        if (started && !isFinalSessionState(state)) return;

        const files = normalizeFiles(args.initialFiles);

        lastHandledSeqRef.current = 0;
        nextChunkIdRef.current = 1;
        setTerminalFeed([]);
        setInputEnabled(false);
        setBusy(true);
        setState("preparing");
        setStarting(true);

        pushChunk("sys", "[starting workspace terminal]\r\n");

        try {
            await start({
                kind: "shell",
                mode: "interactive",
                language: "bash",
                projectId: args.projectId,
                cwd: args.cwd,
                ...(files?.length ? { files } : {}),
            });

            setStarted(true);
        } catch (e: any) {
            pushChunk("err", `${e?.message ?? "Failed to start workspace terminal."}\r\n`);
            setBusy(false);
            setInputEnabled(false);
            setState("failed");
            setStarted(false);
        } finally {
            setStarting(false);
        }
    }, [
        args.enabled,
        args.initialFiles,
        args.projectId,
        args.cwd,
        start,
        started,
        starting,
        state,
        pushChunk,
    ]);

    const stop = React.useCallback(async () => {
        if (!started && !starting) return;

        try {
            await cancel();
            pushChunk("sys", "\r\n[workspace terminal stopped]\r\n");
        } finally {
            setBusy(false);
            setInputEnabled(false);
            setStarted(false);
            setStarting(false);
        }
    }, [cancel, started, starting, pushChunk]);

    const sendData = React.useCallback(
        (data: string) => {
            if (!data) return;
            void sendInput(data);
        },
        [sendInput],
    );

    const resize = React.useCallback(
        (cols: number, rows: number) => {
            void sessionResize(cols, rows);
        },
        [sessionResize],
    );

    React.useEffect(() => {
        if (!args.enabled) {
            reset();
        }
    }, [args.enabled, reset]);

    React.useEffect(() => {
        if (!events.length) return;

        const newEvents = events.filter(
            (ev) => ev.seq > lastHandledSeqRef.current,
        );

        if (!newEvents.length) return;

        for (const ev of newEvents) {
            lastHandledSeqRef.current = Math.max(lastHandledSeqRef.current, ev.seq);

            if (ev.type === "stdout") {
                pushChunk("pty", ev.chunk);
                continue;
            }

            if (ev.type === "stderr") {
                pushChunk("err", ev.chunk);
                continue;
            }

            if (ev.type === "status") {
                setState(ev.state);

                if (ev.state === "preparing" || ev.state === "compiling") {
                    setBusy(true);
                    setInputEnabled(false);
                    continue;
                }

                if (ev.state === "running" || ev.state === "waiting_for_input") {
                    setBusy(true);
                    setInputEnabled(true);
                    setStarted(true);
                    continue;
                }

                if (isFinalSessionState(ev.state)) {
                    setBusy(false);
                    setInputEnabled(false);
                    setStarted(false);
                    continue;
                }

                continue;
            }

            if (ev.type === "input_request") {
                setState("waiting_for_input");
                setBusy(true);
                setInputEnabled(true);
                setStarted(true);
                continue;
            }

            if (ev.type === "compile_error") {
                if (ev.stdout) pushChunk("pty", ev.stdout);
                if (ev.stderr) pushChunk("err", ev.stderr);
                setBusy(false);
                setInputEnabled(false);
                setState("failed");
                setStarted(false);
                continue;
            }

            if (ev.type === "exit") {
                pushChunk("sys", `\r\n[process exited with code ${ev.code}]\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setStarted(false);
                continue;
            }

            if (ev.type === "error") {
                pushChunk("err", `\r\n${ev.message}\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setState("failed");
                setStarted(false);
            }
        }
    }, [events, pushChunk]);

    React.useEffect(() => {
        if (!sessionId && state !== "idle" && !busy && !starting) {
            setStarted(false);
        }
    }, [sessionId, state, busy, starting]);

    return {
        available: args.enabled,
        started,
        starting,
        busy,
        inputEnabled,
        sessionId,
        state,
        terminalFeed,

        open,
        stop,
        reset,

        sendData,
        resize,
    };
}