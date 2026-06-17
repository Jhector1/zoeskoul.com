"use client";

import * as React from "react";
import type {
    InteractiveRunReq,
    RunEvent,
    RunSessionState,
} from "@zoeskoul/code-contracts";
import { TERMINAL_SOCKET_STALE_MS, type TerminalConnectionState } from "../runtime";
import {toWebSocketUrl} from "@/utils";

type StartBrowserSessionResult =
    | {
    ok: true;
    sessionId: string;
    state: RunSessionState;
    attachToken: string;
    wsUrl: string;
    reused?: boolean;
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

type CancelSessionResult =
    | { ok: true }
    | { ok: false; error: string };

async function parseJsonSafe<T>(
    res: Response,
    fallbackPrefix: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const text = await res.text();

    try {
        return {
            ok: true,
            data: JSON.parse(text) as T,
        };
    } catch {
        return {
            ok: false,
            error: `${fallbackPrefix} (${res.status}): ${text.slice(0, 300)}`,
        };
    }
}

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

const SOCKET_PING_INTERVAL_MS = 20_000;
const SOCKET_PROBE_TIMEOUT_MS = 4_000;

export function useRunSession() {
    const [sessionId, setSessionId] = React.useState<string | null>(null);
    const [state, setState] = React.useState<RunSessionState>("queued");
    const [events, setEvents] = React.useState<RunEvent[]>([]);
    const [connectionState, setConnectionState] =
        React.useState<TerminalConnectionState>("idle");
    const [socketReadyState, setSocketReadyState] = React.useState<number | null>(null);
    const [lastMessageAt, setLastMessageAt] = React.useState<number | null>(null);
    const [disconnectReason, setDisconnectReason] = React.useState<string | null>(null);

    const wsRef = React.useRef<WebSocket | null>(null);
    const expectedSocketClosuresRef = React.useRef(new Set<WebSocket>());
    const pendingRef = React.useRef<string[]>([]);
    const sessionIdRef = React.useRef<string | null>(null);
    const stateRef = React.useRef<RunSessionState>("queued");
    const connectionStateRef = React.useRef<TerminalConnectionState>("idle");
    const lastMessageAtRef = React.useRef<number | null>(null);
    const probeInFlightRef = React.useRef<Promise<boolean> | null>(null);
    const probeTimerRef = React.useRef<number | null>(null);

    const clearProbeTimer = React.useCallback(() => {
        if (probeTimerRef.current != null) {
            window.clearTimeout(probeTimerRef.current);
            probeTimerRef.current = null;
        }
    }, []);

    const setSocketHealth = React.useCallback(
        (next: {
            connectionState?: TerminalConnectionState;
            socketReadyState?: number | null;
            lastMessageAt?: number | null;
            disconnectReason?: string | null;
        }) => {
            if (next.connectionState !== undefined) {
                setConnectionState(next.connectionState);
                connectionStateRef.current = next.connectionState;
            }

            if (next.socketReadyState !== undefined) {
                setSocketReadyState(next.socketReadyState);
            }

            if (next.lastMessageAt !== undefined) {
                setLastMessageAt(next.lastMessageAt);
                lastMessageAtRef.current = next.lastMessageAt;
            }

            if (next.disconnectReason !== undefined) {
                setDisconnectReason(next.disconnectReason);
            }
        },
        [],
    );

    const markDisconnected = React.useCallback(
        (message = "Terminal session is disconnected.") => {
            clearProbeTimer();
            probeInFlightRef.current = null;
            setSocketHealth({
                connectionState: "disconnected",
                socketReadyState: wsRef.current?.readyState ?? WebSocket.CLOSED,
                disconnectReason: message,
            });
        },
        [clearProbeTimer, setSocketHealth],
    );

    const closeSocket = React.useCallback(() => {
        clearProbeTimer();
        probeInFlightRef.current = null;

        if (wsRef.current) {
            wsRef.current.onopen = null;
            wsRef.current.onmessage = null;
            wsRef.current.onerror = null;
            wsRef.current.onclose = null;
            wsRef.current.close();
        }
        wsRef.current = null;
        pendingRef.current = [];
        setSocketHealth({
            connectionState: "idle",
            socketReadyState: null,
            disconnectReason: null,
        });
    }, [clearProbeTimer, setSocketHealth]);

    const cancelServerSession = React.useCallback(async (targetSessionId: string) => {
        const res = await fetch(
            `/api/run/pty/sessions/${encodeURIComponent(targetSessionId)}/cancel`,
            {
                method: "POST",
            },
        );

        const parsed = await parseJsonSafe<CancelSessionResult>(
            res,
            "Non-JSON PTY cancel response",
        );

        if (!parsed.ok) {
            throw new Error(parsed.error);
        }

        const data = parsed.data;
        if (!res.ok || !data.ok) {
            throw new Error(
                data.ok === false
                    ? data.error
                    : `Failed to cancel session (${res.status})`,
            );
        }
    }, []);

    const sendOrQueue = React.useCallback((payload: unknown) => {
        const encoded = JSON.stringify(payload);
        const ws = wsRef.current;

        if (!ws || ws.readyState === WebSocket.CONNECTING) {
            pendingRef.current.push(encoded);
            return;
        }

        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }

        ws.send(encoded);
    }, []);

    const probeConnection = React.useCallback(async () => {
        const ws = wsRef.current;

        if (!sessionIdRef.current || !ws || ws.readyState !== WebSocket.OPEN) {
            markDisconnected();
            return false;
        }

        if (probeInFlightRef.current) {
            return await probeInFlightRef.current;
        }

        const baseline = lastMessageAtRef.current ?? 0;

        const run = new Promise<boolean>((resolve) => {
            let settled = false;

            const finish = (ok: boolean) => {
                if (settled) return;
                settled = true;
                clearProbeTimer();
                if (probeInFlightRef.current === run) {
                    probeInFlightRef.current = null;
                }
                resolve(ok);
            };

            probeTimerRef.current = window.setTimeout(() => {
                const latest = lastMessageAtRef.current ?? 0;
                if (latest <= baseline) {
                    markDisconnected();
                    finish(false);
                    return;
                }

                finish(true);
            }, SOCKET_PROBE_TIMEOUT_MS);

            try {
                ws.send(JSON.stringify({ type: "ping" }));
            } catch {
                markDisconnected();
                finish(false);
            }
        });

        probeInFlightRef.current = run;
        return await run;
    }, [clearProbeTimer, markDisconnected]);

    const connect = React.useCallback(
        (nextSessionId: string, nextState: RunSessionState, rawWsUrl: string) => {
            closeSocket();

            setEvents([]);
            setSessionId(nextSessionId);
            sessionIdRef.current = nextSessionId;
            setState(nextState);
            stateRef.current = nextState;
            setSocketHealth({
                connectionState: "connecting",
                socketReadyState: WebSocket.CONNECTING,
                lastMessageAt: null,
                disconnectReason: null,
            });

            const finalWsUrl = toWebSocketUrl(rawWsUrl);
            const ws = new WebSocket(finalWsUrl);
            let socketOpened = false;

            ws.onopen = () => {
                socketOpened = true;
                const now = Date.now();
                setSocketHealth({
                    connectionState: "connected",
                    socketReadyState: ws.readyState,
                    lastMessageAt: now,
                    disconnectReason: null,
                });
                for (const msg of pendingRef.current.splice(0)) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(msg);
                    }
                }
            };

            ws.onmessage = (ev) => {
                const now = Date.now();
                setSocketHealth({
                    connectionState: "connected",
                    socketReadyState: ws.readyState,
                    lastMessageAt: now,
                    disconnectReason: null,
                });
                const msg = JSON.parse(ev.data) as ServerToClientMessage;

                if (msg.type === "ready") {
                    setState(msg.state);
                    stateRef.current = msg.state;
                    return;
                }

                if (msg.type === "event") {
                    const parsedEvent = msg.event;
                    setEvents((prev) => [...prev, parsedEvent]);

                    if (parsedEvent.type === "status") {
                        setState(parsedEvent.state);
                        stateRef.current = parsedEvent.state;

                        if (isFinalSessionState(parsedEvent.state)) {
                            expectedSocketClosuresRef.current.add(ws);
                            ws.close();
                            if (wsRef.current === ws) {
                                wsRef.current = null;
                            }
                            sessionIdRef.current = null;
                        }
                    }
                    return;
                }

                if (msg.type === "error") {
                    setState("failed");
                    stateRef.current = "failed";
                    markDisconnected(msg.message || "Terminal session is disconnected.");
                    console.error("PTY WS error:", msg.message);
                }
            };

            ws.onerror = () => {
                if (
                    expectedSocketClosuresRef.current.has(ws) ||
                    (wsRef.current !== ws && ws.readyState !== WebSocket.OPEN)
                ) {
                    return;
                }

                setSocketHealth({
                    socketReadyState: ws.readyState,
                });
                markDisconnected();
            };

            ws.onclose = () => {
                const expected = expectedSocketClosuresRef.current.has(ws);
                expectedSocketClosuresRef.current.delete(ws);

                if (wsRef.current === ws) {
                    wsRef.current = null;
                }

                if (expected || isFinalSessionState(stateRef.current)) {
                    setSocketHealth({
                        connectionState: "idle",
                        socketReadyState: null,
                    });
                    return;
                }

                /**
                 * A socket close is not the same as a dead PTY session.
                 *
                 * During refresh, route changes, HMR, or temporary network loss, the
                 * browser WebSocket can close while the backend session is still alive.
                 * Marking the run session as "failed" here made the workspace terminal
                 * controller auto-start repeatedly and eventually hit the runner rate
                 * limiter. Keep the session id/state intact and let the controller
                 * reconnect once on the next visible/input event.
                 */
                setSocketHealth({
                    connectionState: "disconnected",
                    socketReadyState: ws.readyState,
                    disconnectReason: "Terminal connection closed. Reconnecting…",
                });

                console.warn("PTY WS closed unexpectedly:", finalWsUrl, {
                    opened: socketOpened,
                    readyState: ws.readyState,
                });
            };


            wsRef.current = ws;
        },
        [closeSocket, markDisconnected, setSocketHealth],
    );

    const start = React.useCallback(
        async (req: InteractiveRunReq) => {
            const res = await fetch("/api/run/pty/sessions/ensure", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(req),
            });

            const parsed = await parseJsonSafe<StartBrowserSessionResult>(
                res,
                "Non-JSON PTY session response",
            );

            if (!parsed.ok) {
                throw new Error(parsed.error);
            }

            const data = parsed.data;

            if (!res.ok || !data.ok) {
                throw new Error(
                    data.ok === false
                        ? data.error
                        : `Failed to start session (${res.status})`,
                );
            }

            connect(data.sessionId, data.state, data.wsUrl);
            return data.sessionId;
        },
        [connect],
    );

    const sendInput = React.useCallback(async (input: string) => {
        sendOrQueue({ type: "input", data: input });
    }, [sendOrQueue]);

    const resize = React.useCallback(async (cols: number, rows: number) => {
        sendOrQueue({ type: "resize", cols, rows });
    }, [sendOrQueue]);

    const cancel = React.useCallback(async () => {
        const currentSessionId = sessionIdRef.current;
        if (!currentSessionId) return;

        const ws = wsRef.current;

        try {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "cancel" }));
            }
        } catch {
            // Ignore websocket send errors. The HTTP cancel below is authoritative.
        }

        closeSocket();

        sessionIdRef.current = null;
        setSessionId(null);
        setState("canceled");
        stateRef.current = "canceled";

        await cancelServerSession(currentSessionId);
    }, [cancelServerSession, closeSocket]);
    React.useEffect(() => {
        if (!sessionId) return;
        if (isFinalSessionState(state)) return;

        const beat = () => {
            void fetch("/api/run/pty/sessions/heartbeat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ sessionId }),
            }).catch(() => {});
        };

        beat();

        const timer = window.setInterval(beat, 25_000);

        return () => {
            window.clearInterval(timer);
        };
    }, [sessionId, state]);

    React.useEffect(() => {
        if (!sessionId) return;
        if (isFinalSessionState(state)) return;
        if (connectionState !== "connected") return;

        const beat = () => {
            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                markDisconnected();
                return;
            }

            if (
                lastMessageAtRef.current != null &&
                Date.now() - lastMessageAtRef.current > TERMINAL_SOCKET_STALE_MS
            ) {
                void probeConnection();
                return;
            }

            try {
                ws.send(JSON.stringify({ type: "ping" }));
            } catch {
                markDisconnected();
            }
        };

        const timer = window.setInterval(beat, SOCKET_PING_INTERVAL_MS);
        return () => {
            window.clearInterval(timer);
        };
    }, [connectionState, markDisconnected, probeConnection, sessionId, state]);



    /**
     * Do not cancel PTY sessions on pagehide/beforeunload.
     *
     * A browser refresh is a normal learner action. Canceling the backend session
     * during refresh creates a race where the next page paints an xterm surface,
     * then the first keypress discovers the old socket/session is gone and shows
     * the scary "Restart terminal" recovery banner. The runner heartbeat/TTL is
     * responsible for cleaning up abandoned sessions.
     */


    React.useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    React.useEffect(() => {
        return () => {
            clearProbeTimer();
            probeInFlightRef.current = null;
            closeSocket();
        };
    }, [clearProbeTimer, closeSocket]);

    return React.useMemo(
        () => ({
            sessionId,
            state,
            events,
            connectionState,
            socketReadyState,
            lastMessageAt,
            disconnectReason,
            start,
            connect,
            sendInput,
            resize,
            cancel,
            closeSocket,
            probeConnection,
        }),
        [
            sessionId,
            state,
            events,
            connectionState,
            socketReadyState,
            lastMessageAt,
            disconnectReason,
            start,
            connect,
            sendInput,
            resize,
            cancel,
            closeSocket,
            probeConnection,
        ],
    );
}
