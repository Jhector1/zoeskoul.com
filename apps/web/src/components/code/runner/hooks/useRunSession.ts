"use client";

import * as React from "react";
import type {
    InteractiveRunReq,
    RunEvent,
    RunSessionState,
} from "@zoeskoul/code-contracts";
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

export function useRunSession() {
    const [sessionId, setSessionId] = React.useState<string | null>(null);
    const [state, setState] = React.useState<RunSessionState>("queued");
    const [events, setEvents] = React.useState<RunEvent[]>([]);

    const wsRef = React.useRef<WebSocket | null>(null);
    const expectedSocketClosuresRef = React.useRef(new Set<WebSocket>());
    const pendingRef = React.useRef<string[]>([]);
    const sessionIdRef = React.useRef<string | null>(null);
    const stateRef = React.useRef<RunSessionState>("queued");

    const closeSocket = React.useCallback(() => {
        if (wsRef.current) {
            expectedSocketClosuresRef.current.add(wsRef.current);
            wsRef.current.close();
        }
        wsRef.current = null;
        pendingRef.current = [];
    }, []);

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

    const connect = React.useCallback(
        (nextSessionId: string, nextState: RunSessionState, rawWsUrl: string) => {
            closeSocket();

            setEvents([]);
            setSessionId(nextSessionId);
            sessionIdRef.current = nextSessionId;
            setState(nextState);
            stateRef.current = nextState;

            const finalWsUrl = toWebSocketUrl(rawWsUrl);
            const ws = new WebSocket(finalWsUrl);
            let socketOpened = false;



            ws.onopen = () => {
                socketOpened = true;
                for (const msg of pendingRef.current.splice(0)) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(msg);
                    }
                }
            };

            ws.onmessage = (ev) => {
                const msg = JSON.parse(ev.data) as ServerToClientMessage;

                if (msg.type === "ready") {
                    setState(msg.state);
                    return;
                }

                if (msg.type === "event") {
                    const parsedEvent = msg.event;
                    setEvents((prev) => [...prev, parsedEvent]);

                    if (parsedEvent.type === "status") {
                        setState(parsedEvent.state);

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
            };

            ws.onclose = () => {
                const expected = expectedSocketClosuresRef.current.has(ws);
                expectedSocketClosuresRef.current.delete(ws);

                if (wsRef.current === ws) {
                    wsRef.current = null;
                }

                if (expected || isFinalSessionState(stateRef.current)) {
                    return;
                }

                setState("failed");
                stateRef.current = "failed";

                console.warn("PTY WS closed unexpectedly:", finalWsUrl, {
                    opened: socketOpened,
                    readyState: ws.readyState,
                });
            };


            wsRef.current = ws;
        },
        [closeSocket],
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
        const cancelOnPageExit = () => {
            const currentSessionId = sessionIdRef.current;
            if (!currentSessionId) return;

            const url = `/api/run/pty/sessions/${encodeURIComponent(
                currentSessionId,
            )}/cancel`;

            try {
                if (navigator.sendBeacon) {
                    const body = new Blob(["{}"], {
                        type: "application/json",
                    });
                    navigator.sendBeacon(url, body);
                    return;
                }
            } catch {
                // Fall through to fetch keepalive.
            }

            try {
                void fetch(url, {
                    method: "POST",
                    keepalive: true,
                });
            } catch {
                // Browser is closing; nothing else to do.
            }
        };

        window.addEventListener("pagehide", cancelOnPageExit);
        window.addEventListener("beforeunload", cancelOnPageExit);

        return () => {
            window.removeEventListener("pagehide", cancelOnPageExit);
            window.removeEventListener("beforeunload", cancelOnPageExit);
        };
    }, []);


    React.useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    React.useEffect(() => {
        return () => {
            const currentSessionId = sessionIdRef.current;
            if (currentSessionId && !isFinalSessionState(stateRef.current)) {
                void cancelServerSession(currentSessionId).catch(() => {});
            }
            closeSocket();
        };
    }, [cancelServerSession, closeSocket]);

    return React.useMemo(
        () => ({
            sessionId,
            state,
            events,
            start,
            connect,
            sendInput,
            resize,
            cancel,
            closeSocket,
        }),
        [sessionId, state, events, start, connect, sendInput, resize, cancel, closeSocket],
    );
}
