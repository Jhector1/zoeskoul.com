"use client";

import * as React from "react";
import type { TerminalChunk } from "@zoeskoul/learner-workspace/runner/runtime";
import type { RunSessionState } from "@zoeskoul/code-contracts";
import { useRunSession } from "@zoeskoul/learner-workspace/runner/useRunSession";
import XtermTerminal from "@zoeskoul/learner-workspace/runner/components/XtermTerminal";
import type { AdminLabTopicTarget } from "./adminLabTopicDisplayPolicy";

type AdminStartReply =
    | { ok: true; sessionId: string; state: RunSessionState; wsUrl: string }
    | { ok: false; error: string };

function isTerminalState(state: string) {
    return state === "completed" || state === "failed" || state === "canceled" || state === "timed_out";
}

/**
 * A manual admin launch using the SAME useRunSession transport and xterm
 * renderer as ordinary student terminals. Admin's tmpfs is not the IDE
 * workspace: never run standard workspace sync/snapshot or submit a grade.
 *
 * All meaningful authorization happens in the Web and Runner. This component
 * deliberately has no signing credential, admin switch secret or grant.
 */
export default function AdminLabTopicPanel({ target }: { target: AdminLabTopicTarget }) {
    const session = useRunSession();
    const [feed, setFeed] = React.useState<TerminalChunk[]>([]);
    const [pending, setPending] = React.useState(false);
    const [stopping, setStopping] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null);
    const activeIdRef = React.useRef<string | null>(null);
    const disposedRef = React.useRef(false);
    const inFlightRef = React.useRef(false);
    const lastSeqRef = React.useRef(0);
    const nextChunkIdRef = React.useRef(1);

    const addChunk = React.useCallback((kind: TerminalChunk["kind"], data: string) => {
        if (!data) return;
        const id = nextChunkIdRef.current++;
        setFeed((previous) => [...previous, { id, kind, data }]);
    }, []);

    const releaseSession = React.useCallback(async (id: string): Promise<boolean> => {
        // Actor-owned, idempotent cancel route; no browser-supplied actor key.
        try {
            const response = await fetch(`/api/run/pty/sessions/${encodeURIComponent(id)}/cancel`, {
                method: "POST",
                credentials: "same-origin",
                keepalive: true,
            });
            return response.ok;
        } catch {
            // The operator OFF switch and Runner TTL remain backstops.
            return false;
        }
    }, []);

    React.useEffect(() => {
        disposedRef.current = false;
        return () => {
            disposedRef.current = true;
            // Keep the start fetch alive. If it finishes after unmount, its
            // continuation cancels the newly created session by ID.
            const id = activeIdRef.current;
            activeIdRef.current = null;
            if (id) void releaseSession(id);
        };
    }, [releaseSession]);

    React.useEffect(() => {
        if (!activeSessionId || session.eventsSessionId !== activeSessionId) return;
        for (const ev of session.events) {
            if (ev.seq <= lastSeqRef.current) continue;
            lastSeqRef.current = ev.seq;
            if (ev.type === "stdout") addChunk("pty", ev.chunk);
            else if (ev.type === "stderr") addChunk("err", ev.chunk);
            else if (ev.type === "error") addChunk("err", `\r\n${ev.message}\r\n`);
            else if (ev.type === "exit") addChunk("sys", `\r\n[process exited with code ${ev.code}]\r\n`);
        }
    }, [activeSessionId, session.eventsSessionId, session.events, addChunk]);

    const launch = React.useCallback(async () => {
        if (inFlightRef.current || activeIdRef.current || disposedRef.current) return;
        inFlightRef.current = true;
        setPending(true);
        setError(null);
        setFeed([]);
        lastSeqRef.current = 0;
        nextChunkIdRef.current = 1;
        try {
            const response = await fetch("/api/run/pty/sessions/admin/start", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(target),
            });
            const reply = await response.json() as AdminStartReply;
            if (!response.ok || reply.ok !== true) {
                throw new Error(reply.ok === false ? reply.error : "Administrative lab unavailable.");
            }
            if (!reply.sessionId || !reply.wsUrl || !reply.state) {
                throw new Error("Administrative lab returned an invalid session.");
            }
            if (disposedRef.current) {
                await releaseSession(reply.sessionId);
                return;
            }
            activeIdRef.current = reply.sessionId;
            setActiveSessionId(reply.sessionId);
            // This is the canonical PTY transport, not a new socket protocol.
            session.connect(reply.sessionId, reply.state, reply.wsUrl);
        } catch (cause) {
            if (!disposedRef.current) {
                setError(cause instanceof Error ? cause.message : "Administrative lab unavailable.");
            }
        } finally {
            inFlightRef.current = false;
            if (!disposedRef.current) setPending(false);
        }
    }, [target, releaseSession, session]);

    const stop = React.useCallback(async () => {
        const id = activeIdRef.current;
        if (!id || stopping) return;
        setStopping(true);
        try {
            const stopped = await releaseSession(id);
            if (!stopped) {
                setError("Could not confirm sandbox cancellation. Retry or contact the operator.");
                return;
            }
            if (activeIdRef.current === id) activeIdRef.current = null;
            setActiveSessionId(null);
            setError(null);
            addChunk("sys", "\r\n[administrative sandbox stopped]\r\n");
        } finally {
            setStopping(false);
        }
    }, [releaseSession, stopping, addChunk]);

    const isActive = !!activeSessionId && !isTerminalState(session.state);
    const inputEnabled = isActive && (session.state === "running" || session.state === "waiting_for_input");

    return (
        <section aria-label="Administrative Linux sandbox" className="my-3 rounded-lg border border-neutral-200 bg-white/80 p-3 dark:border-white/15 dark:bg-black/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">Administrative Linux sandbox</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Isolated and disposable. Files here are not saved to your ordinary workspace.
                    </p>
                </div>
                {!activeSessionId ? (
                    <button type="button" disabled={pending} onClick={() => void launch()}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/25">
                        {pending ? "Starting…" : "Start admin sandbox"}
                    </button>
                ) : (
                    <button type="button" disabled={stopping} onClick={() => void stop()}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/25">
                        {stopping ? "Stopping…" : "Stop sandbox"}
                    </button>
                )}
            </div>
            {error ? <p role="alert" className="my-2 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
            {activeSessionId ? (
                <div className="mt-3 h-[330px] min-h-[260px] overflow-hidden rounded-md border border-neutral-200 dark:border-white/15">
                    <XtermTerminal
                        terminalFeed={feed}
                        inputEnabled={inputEnabled}
                        busy={isActive}
                        disabled={!isActive || stopping}
                        lastResult={null}
                        onSendData={(data) => { if (inputEnabled) void session.sendInput(data); }}
                        onResize={(cols, rows) => { if (isActive) void session.resize(cols, rows); }}
                        interactiveReady={inputEnabled}
                    />
                </div>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Practice environment only. A successful terminal command does not submit or grade the lesson.
            </p>
        </section>
    );
}
