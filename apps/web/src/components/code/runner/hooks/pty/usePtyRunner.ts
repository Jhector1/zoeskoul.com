"use client";

import * as React from "react";
import type {
    SharedRunnerArgs,
    CodeRunnerController,
    TerminalChunk,
    WorkspaceSyncEntry,
} from "../../runtime";
import type { RunnerState } from "../../types";
import { useRunSession } from "../useRunSession";
import { resolveRuntime } from "../controller/useResolvedRuntime";
import {
    RunEvent,
    RunSessionState,
    type InteractiveLanguage,
} from "@zoeskoul/code-contracts";
import { exportWorkspaceEntries } from "@/components/ide/fsTree";

type StartedInteractiveSession = {
    ok?: true;
    sessionId: string;
    state: RunSessionState;
    wsUrl: string;
};

type SnapshotWorkspaceResponse =
    | {
    ok: true;
    files: WorkspaceSyncEntry[];
}
    | {
    ok: false;
    error: string;
};

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

function isStartedInteractiveSession(
    value: unknown,
): value is StartedInteractiveSession {
    if (!value || typeof value !== "object") return false;

    const v = value as Record<string, unknown>;

    return (
        typeof v.sessionId === "string" &&
        typeof v.state === "string" &&
        typeof v.wsUrl === "string"
    );
}

function isInteractiveLanguage(lang: string): lang is InteractiveLanguage {
    return (
        lang === "python" ||
        lang === "java" ||
        lang === "javascript" ||
        lang === "c" ||
        lang === "cpp" ||
        lang === "bash"
    );
}

function normalizePath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function sortEntries(entries: WorkspaceSyncEntry[]): WorkspaceSyncEntry[] {
    return [...entries]
        .map((entry): WorkspaceSyncEntry => {
            if ((entry as any).kind === "directory") {
                return {
                    kind: "directory",
                    path: normalizePath((entry as any).path),
                };
            }

            return {
                kind: "file",
                path: normalizePath((entry as any).path),
                content: String((entry as any).content ?? ""),
            };
        })
        .filter((entry): entry is WorkspaceSyncEntry => !!entry.path)
        .sort((a, b) => {
            const pathCmp = a.path.localeCompare(b.path);
            if (pathCmp !== 0) return pathCmp;

            const ak = (a as any).kind ?? "file";
            const bk = (b as any).kind ?? "file";

            if (ak === bk) return 0;
            return ak === "directory" ? -1 : 1;
        });
}

function entryKey(entry: WorkspaceSyncEntry) {
    const kind = (entry as any).kind === "directory" ? "directory" : "file";
    return `${kind}:${normalizePath((entry as any).path)}`;
}

function entriesEqual(a: WorkspaceSyncEntry[], b: WorkspaceSyncEntry[]) {
    const aa = sortEntries(a);
    const bb = sortEntries(b);

    if (aa.length !== bb.length) return false;

    for (let i = 0; i < aa.length; i += 1) {
        const left = aa[i] as any;
        const right = bb[i] as any;

        if ((left.kind ?? "file") !== (right.kind ?? "file")) return false;
        if (left.path !== right.path) return false;

        if ((left.kind ?? "file") !== "directory") {
            if (String(left.content ?? "") !== String(right.content ?? "")) {
                return false;
            }
        }
    }

    return true;
}

function diffDirtyUiPaths(
    current: WorkspaceSyncEntry[],
    baseline: WorkspaceSyncEntry[],
): Set<string> {
    const dirty = new Set<string>();
    const currentMap = new Map(current.map((entry) => [entryKey(entry), entry]));
    const baselineMap = new Map(baseline.map((entry) => [entryKey(entry), entry]));

    for (const [key, currentEntry] of currentMap) {
        const baselineEntry = baselineMap.get(key);

        if (!baselineEntry) {
            dirty.add((currentEntry as any).path);
            continue;
        }

        if (!entriesEqual([currentEntry], [baselineEntry])) {
            dirty.add((currentEntry as any).path);
        }
    }

    for (const [key, baselineEntry] of baselineMap) {
        if (!currentMap.has(key)) {
            dirty.add((baselineEntry as any).path);
        }
    }

    return dirty;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
    });

    const text = await res.text();
    let data: any;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
    }

    if (!res.ok || data?.ok === false) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
    }

    return data as T;
}

async function snapshotSessionWorkspace(
    sessionId: string,
): Promise<WorkspaceSyncEntry[]> {
    const out = await postJson<SnapshotWorkspaceResponse>(
        `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/snapshot`,
        {},
    );

    if (!out.ok) {
        throw new Error(out.error || "Failed to snapshot workspace.");
    }

    return sortEntries(out.files ?? []);
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

        if (ev.state === "running" || ev.state === "waiting_for_input") {
            setBusy(true);
            setInputEnabled(true);
            setRunState("running");
            return;
        }

        if (isFinalSessionState(ev.state)) {
            setBusy(false);
            setInputEnabled(false);
            setRunState("idle");
            return;
        }

        return;
    }

    if (ev.type === "input_request") {
        setBusy(true);
        setInputEnabled(true);
        setRunState("running");
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

export function usePtyRunner(args: SharedRunnerArgs): CodeRunnerController {
    const {
        lang,
        code,
        workspace,
        exerciseStateKey,
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
    const [lastRunLanguage, setLastRunLanguage] = React.useState<typeof lang | null>(
        null,
    );

    const lastHandledSeqRef = React.useRef(0);
    const nextChunkIdRef = React.useRef(1);
    const runBaselineEntriesRef = React.useRef<WorkspaceSyncEntry[]>([]);
    const snapshottedSessionIdsRef = React.useRef<Set<string>>(new Set());
    const snapshotInFlightSessionIdsRef = React.useRef<Set<string>>(new Set());
    const getCurrentWorkspaceEntries = React.useCallback((): WorkspaceSyncEntry[] => {
        if (typeof args.getWorkspaceFiles === "function") {
            return sortEntries(args.getWorkspaceFiles());
        }

        if (
            workspace &&
            workspace.version === 2 &&
            Array.isArray((workspace as any).nodes)
        ) {
            return sortEntries(exportWorkspaceEntries((workspace as any).nodes));
        }

        return [];
    }, [args, workspace]);

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
        runBaselineEntriesRef.current = [];
        snapshottedSessionIdsRef.current = new Set();
        setTerminalFeed([]);
        setInputEnabled(false);
        setBusy(false);
        setRunState("idle");
        setLastRunLanguage(null);
    }, []);

    const sendTerminalData = React.useCallback(
        (data: string) => {
            if (!data) return;
            void session.sendInput(data);
        },
        [session],
    );

    const sendTerminalResize = React.useCallback(
        (cols: number, rows: number) => {
            void session.resize(cols, rows);
        },
        [session],
    );

    const applySnapshotForSession = React.useCallback(
        async (sessionId: string | null | undefined) => {
            if (!sessionId) return;

            if (typeof args.onTerminalSnapshotFiles !== "function") {
                return;
            }

            if (snapshottedSessionIdsRef.current.has(sessionId)) {
                return;
            }

            if (snapshotInFlightSessionIdsRef.current.has(sessionId)) {
                return;
            }

            snapshotInFlightSessionIdsRef.current.add(sessionId);

            try {
                const snapshot = await snapshotSessionWorkspace(sessionId);
                const currentEntries = getCurrentWorkspaceEntries();
                const dirtyUiPaths = diffDirtyUiPaths(
                    currentEntries,
                    runBaselineEntriesRef.current,
                );

                await args.onTerminalSnapshotFiles(snapshot, {
                    dirtyUiPaths,
                });

                runBaselineEntriesRef.current = snapshot;
                snapshottedSessionIdsRef.current.add(sessionId);
            } catch (e: any) {
                const message = String(e?.message ?? "");

                if (
                    message.includes("ENOENT") ||
                    message.includes("no such file or directory") ||
                    message.includes("Workspace expired")
                ) {
                    pushChunk(
                        "err",
                        "\r\n[workspace sync failed: the runner workspace expired before files could be pulled back]\r\n",
                    );
                    return;
                }

                pushChunk(
                    "err",
                    `\r\n${message || "Failed to sync created files back to Explorer."}\r\n`,
                );
            } finally {
                snapshotInFlightSessionIdsRef.current.delete(sessionId);
            }
        },
        [args, getCurrentWorkspaceEntries, pushChunk],
    );

    const startRun = React.useCallback(async () => {
        if (disabled || !allowRun || busy) return;

        if (!isInteractiveLanguage(lang)) {
            pushChunk(
                "err",
                "PTY runner does not support SQL. Use the SQL runner instead.\r\n",
            );
            setBusy(false);
            setRunState("idle");
            setInputEnabled(false);
            return;
        }

        if (resetTerminalOnRun) {
            resetTerminal();
        } else {
            lastHandledSeqRef.current = 0;
            setInputEnabled(false);
        }

        runBaselineEntriesRef.current = getCurrentWorkspaceEntries();

        setBusy(true);
        setRunState("starting");
        setLastRunLanguage(lang);

        try {
            if (onRun) {
                const started = await onRun({
                    language: lang,
                    code,
                    workspace,
                    exerciseStateKey,
                    stdin: "",
                } as any);

                if (isStartedInteractiveSession(started)) {
                    session.connect(
                        started.sessionId,
                        started.state,
                        started.wsUrl,
                    );
                    return;
                }
            }

            const sessionId = await session.start({
                kind: "code",
                mode: "interactive",
                language: lang,
                code,
                workspace,
                exerciseStateKey,
            } as any);

            // if (typeof sessionId === "string") {
            //     // useRunSession will also emit final events. This is only a fallback
            //     // in case a runner completes before a final status event is observed.
            //     setTimeout(() => {
            //         if (!busy) {
            //             void applySnapshotForSession(sessionId);
            //         }
            //     }, 0);
            // }
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
        workspace,
        exerciseStateKey,
        onRun,
        pushChunk,
        getCurrentWorkspaceEntries,
        applySnapshotForSession,
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

            if (ev.type === "status" && isFinalSessionState(ev.state)) {
                void applySnapshotForSession(session.sessionId);
            }

            if (ev.type === "exit" || ev.type === "error") {
                void applySnapshotForSession(session.sessionId);
            }
        }
    }, [session.events, session.sessionId, pushChunk, applySnapshotForSession]);

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