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
    const pendingRef = React.useRef<string[]>([]);

    const closeSocket = React.useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        pendingRef.current = [];
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
            setState(nextState);

            const finalWsUrl = toWebSocketUrl(rawWsUrl);
            const ws = new WebSocket(finalWsUrl);



            ws.onopen = () => {
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
                            ws.close();
                            if (wsRef.current === ws) {
                                wsRef.current = null;
                            }
                        }
                    }
                    return;
                }

                if (msg.type === "error") {
                    setState("failed");
                    console.error("PTY WS error:", msg.message);
                }
            };

            ws.onerror = (ev) => {
                console.error("PTY WS failed:", finalWsUrl, ev);
            };


            wsRef.current = ws;
        },
        [closeSocket],
    );

    const start = React.useCallback(
        async (req: InteractiveRunReq) => {
            const res = await fetch("/api/run/pty/sessions/start", {
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
        sendOrQueue({ type: "cancel" });
    }, [sendOrQueue]);

    React.useEffect(() => {
        return () => {
            closeSocket();
        };
    }, [closeSocket]);

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