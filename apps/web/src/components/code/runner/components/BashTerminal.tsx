"use client";

import * as React from "react";
import XtermTerminal from "@/components/code/runner/components/XtermTerminal";
import type {
    FileEntry,
    RunEvent,
    RunSessionState,
} from "@zoeskoul/code-contracts";
import {toWebSocketUrl} from "@/utils";

type BashTerminalStartResult =
    | {
    ok: true;
    sessionId: string;
    state: RunSessionState;
    attachToken: string;
    wsUrl: string;
}
    | {
    ok: false;
    error: string;
};

type ServerToClientMessage =
    | { type: "ready"; sessionId: string; state: RunSessionState }
    | { type: "event"; event: RunEvent }
    | { type: "pong" }
    | { type: "error"; message: string };

type TerminalChunk = {
    id: number;
    kind: "pty" | "err" | "sys";
    data: string;
};

type BashTerminalProps = {
    projectId?: string;
    initialFiles?: FileEntry[];
    className?: string;
    title?: string;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
    autoStart?: boolean;
};

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export default function BashTerminal({
                                         projectId,
                                         initialFiles = [],
                                         className,
                                         title = "Shell Practice",
                                         wallTimeoutMs,
                                         idleTimeoutMs,
                                         autoStart = true,
                                     }: BashTerminalProps) {
    const [sessionId, setSessionId] = React.useState<string | null>(null);
    const [sessionState, setSessionState] =
        React.useState<RunSessionState>("queued");
    const [busy, setBusy] = React.useState(false);
    const [inputEnabled, setInputEnabled] = React.useState(false);
    const [terminalFeed, setTerminalFeed] = React.useState<TerminalChunk[]>([]);
    const [error, setError] = React.useState<string | null>(null);

    const wsRef = React.useRef<WebSocket | null>(null);
    const pendingRef = React.useRef<string[]>([]);
    const nextChunkIdRef = React.useRef(1);
    const autoStartedRef = React.useRef(false);

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

    const resetFeed = React.useCallback(() => {
        nextChunkIdRef.current = 1;
        setTerminalFeed([]);
    }, []);

    const closeSocket = React.useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        pendingRef.current = [];
    }, []);

    const updateUiForState = React.useCallback((state: RunSessionState) => {
        setSessionState(state);

        if (
            state === "running" ||
            state === "waiting_for_input" ||
            state === "compiling"
        ) {
            setBusy(true);
        } else {
            setBusy(false);
        }

        if (state === "running" || state === "waiting_for_input") {
            setInputEnabled(true);
        } else {
            setInputEnabled(false);
        }
    }, []);

    const flushPending = React.useCallback((ws: WebSocket) => {
        for (const msg of pendingRef.current.splice(0)) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg);
            } else {
                pendingRef.current.unshift(msg);
                break;
            }
        }
    }, []);

    const sendOrQueue = React.useCallback((payload: unknown) => {
        const encoded = JSON.stringify(payload);
        const ws = wsRef.current;

        if (!ws || ws.readyState === WebSocket.CONNECTING) {
            pendingRef.current.push(encoded);
            return;
        }

        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(encoded);
    }, []);

    const connect = React.useCallback(
        (
            nextSessionId: string,
            nextState: RunSessionState,
            rawWsUrl: string,
        ) => {
            closeSocket();

            setSessionId(nextSessionId);
            updateUiForState(nextState);

            const finalWsUrl = toWebSocketUrl(rawWsUrl);
            const ws = new WebSocket(finalWsUrl);

            ws.onopen = () => {
                flushPending(ws);
            };

            ws.onmessage = (ev) => {
                const msg = JSON.parse(String(ev.data)) as ServerToClientMessage;

                if (msg.type === "ready") {
                    updateUiForState(msg.state);
                    return;
                }

                if (msg.type === "event") {
                    const event = msg.event;

                    switch (event.type) {
                        case "status":
                            updateUiForState(event.state);
                            if (isFinalSessionState(event.state)) {
                                ws.close();
                                if (wsRef.current === ws) {
                                    wsRef.current = null;
                                }
                            }
                            return;

                        case "stdout":
                            pushChunk("pty", event.chunk);
                            return;

                        case "stderr":
                            pushChunk("err", event.chunk);
                            return;

                        case "error":
                            pushChunk("err", `\r\n${event.message}\r\n`);
                            return;

                        case "exit":
                            pushChunk("sys", `\r\n[process exited with code ${event.code}]\r\n`);
                            return;

                        case "compile_error":
                            if (event.stdout) pushChunk("pty", event.stdout);
                            if (event.stderr) pushChunk("err", event.stderr);
                            return;

                        case "input_request":
                            updateUiForState("waiting_for_input");
                            return;
                    }
                }

                if (msg.type === "error") {
                    setError(msg.message);
                    pushChunk("err", `\r\n${msg.message}\r\n`);
                }
            };

            ws.onerror = () => {
                setError("Terminal connection failed.");
            };

            ws.onclose = () => {
                if (wsRef.current === ws) {
                    wsRef.current = null;
                }
            };

            wsRef.current = ws;
        },
        [closeSocket, flushPending, pushChunk, updateUiForState],
    );

    const startShell = React.useCallback(async () => {
        setError(null);
        resetFeed();
        setSessionId(null);

        pushChunk("sys", "[starting bash shell]\r\n");

        const res = await fetch("/api/run/pty/sessions/ensure", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                kind: "shell",
                mode: "interactive",
                language: "bash",
                projectId,
                workspaceKey: projectId ? `bash-terminal:${projectId}` : `bash-terminal:${title}`,
                files: initialFiles,
                wallTimeoutMs,
                idleTimeoutMs,
            }),
        });

        const out = (await res.json()) as BashTerminalStartResult;

        if (!res.ok || !out.ok) {
            const message = out.ok === false ? out.error : `Failed (${res.status})`;
            setError(message);
            pushChunk("err", `\r\n${message}\r\n`);
            updateUiForState("failed");
            return;
        }

        connect(out.sessionId, out.state, out.wsUrl);
    }, [
        connect,
        idleTimeoutMs,
        initialFiles,
        projectId,
        pushChunk,
        resetFeed,
        updateUiForState,
        wallTimeoutMs,
    ]);

    const stopShell = React.useCallback(() => {
        sendOrQueue({ type: "cancel" });
    }, [sendOrQueue]);

    const sendTerminalData = React.useCallback(
        (data: string) => {
            if (!data) return;
            sendOrQueue({ type: "input", data });
        },
        [sendOrQueue],
    );

    const sendTerminalResize = React.useCallback(
        (cols: number, rows: number) => {
            sendOrQueue({ type: "resize", cols, rows });
        },
        [sendOrQueue],
    );

    React.useEffect(() => {
        if (!autoStart) return;
        if (autoStartedRef.current) return;
        autoStartedRef.current = true;
        void startShell();
    }, [autoStart, startShell]);

    React.useEffect(() => {
        return () => {
            closeSocket();
        };
    }, [closeSocket]);

    return (
        <div className={className}>
            <div className="flex h-full min-h-0 flex-col border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2 dark:border-white/10">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{title}</div>
                        <div className="text-xs text-neutral-500 dark:text-white/50">
                            {sessionId
                                ? `${sessionState}${projectId ? ` • project ${projectId}` : ""}`
                                : "idle"}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void startShell()}
                            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
                        >
                            Restart
                        </button>

                        <button
                            type="button"
                            onClick={stopShell}
                            disabled={!busy}
                            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                        >
                            Stop
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                        {error}
                    </div>
                ) : null}

                <div className="min-h-[360px] flex-1">
                    <XtermTerminal
                        terminalFeed={terminalFeed as any}
                        inputEnabled={inputEnabled}
                        busy={busy}
                        disabled={false}
                        lastResult={null}
                        onSendData={sendTerminalData}
                        onResize={sendTerminalResize}
                        optimisticLocalEcho={false}
                    />
                </div>
            </div>
        </div>
    );
}