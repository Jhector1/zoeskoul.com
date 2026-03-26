"use client";

import * as React from "react";
import type {
    RunEvent,
    RunSessionState,
    InteractiveRunReq,
} from "@/lib/code/types/session";

type StartResult =
    | { ok: true; sessionId: string; state: RunSessionState }
    | { ok: false; error: string };

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

function getWsBaseUrl() {
    const explicit = process.env.NEXT_PUBLIC_RUNNER_WS_BASE_URL?.trim();
    if (!explicit) {
        throw new Error("Missing NEXT_PUBLIC_RUNNER_WS_BASE_URL");
    }

    const normalized = explicit.replace(/\/+$/, "");
    if (!/^wss?:\/\//i.test(normalized)) {
        throw new Error(
            `NEXT_PUBLIC_RUNNER_WS_BASE_URL must start with ws:// or wss://. Got: ${normalized}`,
        );
    }

    return normalized;
}

export function useRunSession() {
    const [sessionId, setSessionId] = React.useState<string | null>(null);
    const [state, setState] = React.useState<RunSessionState>("queued");
    const [events, setEvents] = React.useState<RunEvent[]>([]);
    const wsRef = React.useRef<WebSocket | null>(null);

    const closeSocket = React.useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
    }, []);

    const connect = React.useCallback(
        (nextSessionId: string, nextState: RunSessionState = "queued") => {
            closeSocket();
            setEvents([]);
            setSessionId(nextSessionId);
            setState(nextState);

            const base = getWsBaseUrl();
            const wsUrl = `${base}/sessions/${encodeURIComponent(nextSessionId)}/ws`;

            const ws = new WebSocket(wsUrl);

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
                    console.error("Runner WS error:", msg.message);
                }
            };

            ws.onopen = () => {
                console.log("Runner WebSocket opened:", wsUrl);
            };

            ws.onerror = (ev) => {
                console.error("Runner WebSocket failed:", wsUrl, ev);
            };
            ws.onclose = (ev) => {
                const info = {
                    url: wsUrl,
                    code: ev.code,
                    reason: ev.reason,
                    wasClean: ev.wasClean,
                };

                const finalStates = new Set(["completed", "failed", "canceled", "timed_out"]);

                if (finalStates.has(state) || ev.wasClean || ev.code === 1000 || ev.code === 1005) {
                    console.log("Runner WebSocket closed:", info);
                    return;
                }

                console.error("Runner WebSocket closed unexpectedly:", info);
            };

            wsRef.current = ws;
        },
        [closeSocket],
    );

    const start = React.useCallback(
        async (req: InteractiveRunReq) => {
            const res = await fetch("/api/run/sessions/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req),
            });

            const parsed = await parseJsonSafe<StartResult>(
                res,
                "Non-JSON interactive session response",
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

            connect(data.sessionId, data.state);
            return data.sessionId;
        },
        [connect],
    );

    const sendInput = React.useCallback(async (input: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "input", data: input }));
    }, []);

    const resize = React.useCallback(async (cols: number, rows: number) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
    }, []);

    const cancel = React.useCallback(async () => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "cancel" }));
    }, []);

    React.useEffect(() => {
        return () => {
            closeSocket();
        };
    }, [closeSocket]);

    return {
        sessionId,
        state,
        events,
        start,
        connect,
        sendInput,
        resize,
        cancel,
        closeSocket,
    };
}