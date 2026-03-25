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

export function useRunSession() {
    const [sessionId, setSessionId] = React.useState<string | null>(null);
    const [state, setState] = React.useState<RunSessionState>("queued");
    const [events, setEvents] = React.useState<RunEvent[]>([]);
    const esRef = React.useRef<EventSource | null>(null);

    const closeStream = React.useCallback(() => {
        esRef.current?.close();
        esRef.current = null;
    }, []);

    const connect = React.useCallback(
        (nextSessionId: string, nextState: RunSessionState = "queued") => {
            closeStream();
            setEvents([]);
            setSessionId(nextSessionId);
            setState(nextState);

            const es = new EventSource(
                `/api/run/sessions/${encodeURIComponent(nextSessionId)}/stream`,
            );

            es.onmessage = (ev) => {
                const parsedEvent = JSON.parse(ev.data) as RunEvent;

                setEvents((prev) => [...prev, parsedEvent]);

                if (parsedEvent.type === "status") {
                    setState(parsedEvent.state);
                } else if (parsedEvent.type === "input_request") {
                    setState("waiting_for_input");
                } else if (parsedEvent.type === "exit") {
                    setState("completed");
                } else if (parsedEvent.type === "error") {
                    setState("failed");
                }
            };

            es.onerror = () => {
                es.close();
                if (esRef.current === es) {
                    esRef.current = null;
                }
            };

            esRef.current = es;
        },
        [closeStream],
    );

    const start = React.useCallback(async (req: InteractiveRunReq) => {
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
    }, [connect]);

    const sendInput = React.useCallback(
        async (input: string) => {
            if (!sessionId) return;

            await fetch(`/api/run/sessions/${encodeURIComponent(sessionId)}/input`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input }),
            });
        },
        [sessionId],
    );

    const cancel = React.useCallback(async () => {
        if (!sessionId) return;

        await fetch(`/api/run/sessions/${encodeURIComponent(sessionId)}/cancel`, {
            method: "POST",
        });
    }, [sessionId]);

    React.useEffect(() => {
        return () => {
            closeStream();
        };
    }, [closeStream]);

    return {
        sessionId,
        state,
        events,
        start,
        connect,
        sendInput,
        cancel,
        closeStream,
    };
}