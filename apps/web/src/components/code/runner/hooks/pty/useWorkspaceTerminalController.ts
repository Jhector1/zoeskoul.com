"use client";

import * as React from "react";
import type {
    RunSessionState,
} from "@zoeskoul/code-contracts";
import type {
    TerminalChunk,
    WorkspaceSyncEntry,
    WorkspaceTerminalController,
    WorkspaceTerminalConfig,
} from "../../runtime";
import { useRunSession } from "../useRunSession";

type SyncStatus = "idle" | "pushing" | "pulling" | "error";

function isFinalSessionState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

function normalizeEntries(
    files: WorkspaceTerminalConfig["initialFiles"],
): WorkspaceSyncEntry[] | undefined {
    if (!files) return undefined;

    if (Array.isArray(files)) {
        return files.map((entry) => {
            if ((entry as any)?.kind === "directory") {
                return {
                    kind: "directory",
                    path: String((entry as any).path ?? ""),
                } satisfies WorkspaceSyncEntry;
            }

            return {
                kind: "file",
                path: String((entry as any).path ?? ""),
                content: String((entry as any).content ?? ""),
            } satisfies WorkspaceSyncEntry;
        });
    }

    return Object.entries(files).map(([path, content]) => ({
        kind: "file" as const,
        path,
        content,
    }));
}

function entryKind(entry: WorkspaceSyncEntry) {
    return entry.kind === "directory" ? "directory" : "file";
}

function normalizePath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function sortEntries(entries: WorkspaceSyncEntry[]) {
    return [...entries]
        .map((entry) => {
            if (entry.kind === "directory") {
                return {
                    kind: "directory" as const,
                    path: normalizePath(entry.path),
                };
            }

            return {
                kind: "file" as const,
                path: normalizePath(entry.path),
                content: String((entry as any).content ?? ""),
            };
        })
        .filter((entry) => !!entry.path)
        .sort((a, b) => {
            const pathCmp = a.path.localeCompare(b.path);
            if (pathCmp !== 0) return pathCmp;
            if (a.kind === b.kind) return 0;
            return a.kind === "directory" ? -1 : 1;
        });
}

function entriesEqual(a: WorkspaceSyncEntry[], b: WorkspaceSyncEntry[]) {
    const aa = sortEntries(a);
    const bb = sortEntries(b);

    if (aa.length !== bb.length) return false;

    for (let i = 0; i < aa.length; i++) {
        if (aa[i].kind !== bb[i].kind) return false;
        if (aa[i].path !== bb[i].path) return false;
        if (aa[i].kind === "file" && bb[i].kind === "file") {
            if (aa[i].content !== bb[i].content) return false;
        }
    }

    return true;
}

function diffDirtyUiPaths(
    currentUiEntries: WorkspaceSyncEntry[],
    baselineEntries: WorkspaceSyncEntry[],
) {
    const out = new Set<string>();

    const current = new Map(
        sortEntries(currentUiEntries).map((entry) => [
            entry.path,
            entry.kind === "directory" ? "__DIR__" : `__FILE__:${entry.content}`,
        ]),
    );

    const baseline = new Map(
        sortEntries(baselineEntries).map((entry) => [
            entry.path,
            entry.kind === "directory" ? "__DIR__" : `__FILE__:${entry.content}`,
        ]),
    );

    const allPaths = new Set([...current.keys(), ...baseline.keys()]);

    for (const path of allPaths) {
        if ((current.get(path) ?? null) !== (baseline.get(path) ?? null)) {
            out.add(path);
        }
    }

    return out;
}

function applyDirtyOverridesToSnapshot(
    snapshotEntries: WorkspaceSyncEntry[],
    currentUiEntries: WorkspaceSyncEntry[],
    dirtyUiPaths: Set<string>,
) {
    const merged = new Map<string, WorkspaceSyncEntry>();
    const current = new Map<string, WorkspaceSyncEntry>();

    for (const entry of sortEntries(snapshotEntries)) {
        merged.set(entry.path, entry);
    }

    for (const entry of sortEntries(currentUiEntries)) {
        current.set(entry.path, entry);
    }

    for (const path of dirtyUiPaths) {
        if (current.has(path)) {
            merged.set(path, current.get(path)!);
        } else {
            merged.delete(path);
        }
    }

    return sortEntries([...merged.values()]);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
    }

    return data as T;
}

type SnapshotResponse = {
    ok: true;
    files: WorkspaceSyncEntry[];
};

type ReplaceResponse = {
    ok: true;
    fileCount: number;
};

type UseWorkspaceTerminalArgs = WorkspaceTerminalConfig & {
    enabled: boolean;
};

export function useWorkspaceTerminalController(
    args: UseWorkspaceTerminalArgs,
): WorkspaceTerminalController {
    const {
        sessionId,
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
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>("idle");

    const nextChunkIdRef = React.useRef(1);
    const lastHandledSeqRef = React.useRef(0);

    const lastPushedEntriesRef = React.useRef<WorkspaceSyncEntry[]>(
        sortEntries(normalizeEntries(args.initialFiles) ?? []),
    );
    const quietTimerRef = React.useRef<number | null>(null);
    const awaitingPostEnterSnapshotRef = React.useRef(false);
    const snapshotInFlightRef = React.useRef<Promise<boolean> | null>(null);
    const openInFlightRef = React.useRef<Promise<void> | null>(null);

    const startedRef = React.useRef(started);
    const startingRef = React.useRef(starting);
    const stateRef = React.useRef<RunSessionState | "idle">(state);

    React.useEffect(() => {
        startedRef.current = started;
    }, [started]);

    React.useEffect(() => {
        startingRef.current = starting;
    }, [starting]);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const getWorkspaceEntries = React.useCallback(() => {
        const live = args.getWorkspaceFiles?.();
        if (live) return sortEntries(live);

        return sortEntries(normalizeEntries(args.initialFiles) ?? []);
    }, [args.getWorkspaceFiles, args.initialFiles]);

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

    const clearQuietTimer = React.useCallback(() => {
        if (quietTimerRef.current != null) {
            window.clearTimeout(quietTimerRef.current);
            quietTimerRef.current = null;
        }
    }, []);

    const reset = React.useCallback(() => {
        clearQuietTimer();
        closeSocket();
        lastHandledSeqRef.current = 0;
        nextChunkIdRef.current = 1;
        awaitingPostEnterSnapshotRef.current = false;
        snapshotInFlightRef.current = null;
        openInFlightRef.current = null;
        setTerminalFeed([]);
        setInputEnabled(false);
        setBusy(false);
        setState("idle");
        setStarted(false);
        setStarting(false);
        setSyncStatus("idle");
    }, [clearQuietTimer, closeSocket]);

    const replaceFiles = React.useCallback(
        async (files: WorkspaceSyncEntry[]) => {
            if (!sessionId) return false;

            setSyncStatus("pushing");

            try {
                const sorted = sortEntries(files);

                await postJson<ReplaceResponse>(
                    `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/replace`,
                    { files: sorted },
                );

                lastPushedEntriesRef.current = sorted;
                setSyncStatus("idle");
                return true;
            } catch (e: any) {
                setSyncStatus("error");
                pushChunk("err", `\r\n${e?.message ?? "Failed to sync workspace to terminal."}\r\n`);
                return false;
            }
        },
        [sessionId, pushChunk],
    );

    const snapshotFiles = React.useCallback(async () => {
        if (!sessionId) return [] as WorkspaceSyncEntry[];

        setSyncStatus("pulling");

        try {
            const out = await postJson<SnapshotResponse>(
                `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/snapshot`,
                {},
            );
            setSyncStatus("idle");
            return sortEntries(out.files ?? []);
        } catch (e: any) {
            setSyncStatus("error");
            pushChunk("err", `\r\n${e?.message ?? "Failed to pull terminal workspace."}\r\n`);
            return [];
        }
    }, [sessionId, pushChunk]);

    const pushWorkspaceFromSource = React.useCallback(
        async (force = false) => {
            const entries = getWorkspaceEntries();

            if (!force && entriesEqual(entries, lastPushedEntriesRef.current)) {
                return true;
            }

            return await replaceFiles(entries);
        },
        [getWorkspaceEntries, replaceFiles],
    );

    const pullSnapshotIntoWorkspace = React.useCallback(async () => {
        if (!sessionId) return false;
        if (snapshotInFlightRef.current) return await snapshotInFlightRef.current;

        const run = (async () => {
            const snapshot = await snapshotFiles();
            const currentUiEntries = getWorkspaceEntries();
            const dirtyUiPaths = diffDirtyUiPaths(
                currentUiEntries,
                lastPushedEntriesRef.current,
            );

            const nextBaseline = applyDirtyOverridesToSnapshot(
                snapshot,
                currentUiEntries,
                dirtyUiPaths,
            );

            awaitingPostEnterSnapshotRef.current = false;

            try {
                await args.onTerminalSnapshotFiles?.(snapshot, {
                    dirtyUiPaths,
                });
            } finally {
                lastPushedEntriesRef.current = nextBaseline;
            }

            return true;
        })();

        snapshotInFlightRef.current = run;

        try {
            return await run;
        } finally {
            snapshotInFlightRef.current = null;
        }
    }, [sessionId, snapshotFiles, getWorkspaceEntries, args]);

    const schedulePostEnterSnapshot = React.useCallback(
        (delayMs = 700) => {
            if (!awaitingPostEnterSnapshotRef.current) return;
            clearQuietTimer();

            quietTimerRef.current = window.setTimeout(() => {
                quietTimerRef.current = null;
                void pullSnapshotIntoWorkspace();
            }, delayMs);
        },
        [clearQuietTimer, pullSnapshotIntoWorkspace],
    );

    const beforeSubmitEnter = React.useCallback(async () => {
        const ok = await pushWorkspaceFromSource(true);
        if (!ok) {
            throw new Error("Could not push local workspace to terminal.");
        }
    }, [pushWorkspaceFromSource]);

    const afterSubmitEnter = React.useCallback(async () => {
        awaitingPostEnterSnapshotRef.current = true;
        schedulePostEnterSnapshot(700);
    }, [schedulePostEnterSnapshot]);

    const open = React.useCallback(async () => {
        if (!args.enabled) return;

        if (openInFlightRef.current) {
            return await openInFlightRef.current;
        }

        if (startingRef.current) return;

        if (startedRef.current && !isFinalSessionState(stateRef.current)) {
            return;
        }

        const run = (async () => {
            const entries = getWorkspaceEntries();

            lastHandledSeqRef.current = 0;
            nextChunkIdRef.current = 1;
            awaitingPostEnterSnapshotRef.current = false;
            setTerminalFeed([]);
            setInputEnabled(false);
            setBusy(true);
            setState("preparing");
            setStarting(true);
            setSyncStatus("idle");

            pushChunk("sys", "[starting workspace terminal]\r\n");

            try {
                await start({
                    kind: "shell",
                    mode: "interactive",
                    language: "bash",
                    projectId: args.projectId,
                    cwd: args.cwd,
                    ...(entries.length ? { files: entries as any } : {}),
                });

                lastPushedEntriesRef.current = sortEntries(entries);
                setStarted(true);
            } catch (e: any) {
                pushChunk("err", `${e?.message ?? "Failed to start workspace terminal."}\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setState("failed");
                setStarted(false);
                throw e;
            } finally {
                setStarting(false);
                openInFlightRef.current = null;
            }
        })();

        openInFlightRef.current = run;
        return await run;
    }, [
        args.enabled,
        args.projectId,
        args.cwd,
        getWorkspaceEntries,
        start,
        pushChunk,
    ]);

    const stop = React.useCallback(async () => {
        if (!startedRef.current && !startingRef.current) return;

        try {
            await cancel();
            pushChunk("sys", "\r\n[workspace terminal stopped]\r\n");
        } finally {
            clearQuietTimer();
            openInFlightRef.current = null;
            setBusy(false);
            setInputEnabled(false);
            setStarted(false);
            setStarting(false);
        }
    }, [cancel, pushChunk, clearQuietTimer]);

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
                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(700);
                }
                continue;
            }

            if (ev.type === "stderr") {
                pushChunk("err", ev.chunk);
                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(700);
                }
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

                    if (awaitingPostEnterSnapshotRef.current) {
                        schedulePostEnterSnapshot(450);
                    }
                    continue;
                }

                if (isFinalSessionState(ev.state)) {
                    setBusy(false);
                    setInputEnabled(false);
                    setStarted(false);
                    openInFlightRef.current = null;

                    if (awaitingPostEnterSnapshotRef.current) {
                        schedulePostEnterSnapshot(100);
                    }
                    continue;
                }

                continue;
            }

            if (ev.type === "input_request") {
                setState("waiting_for_input");
                setBusy(true);
                setInputEnabled(true);
                setStarted(true);

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(250);
                }
                continue;
            }

            if (ev.type === "compile_error") {
                if (ev.stdout) pushChunk("pty", ev.stdout);
                if (ev.stderr) pushChunk("err", ev.stderr);
                setBusy(false);
                setInputEnabled(false);
                setState("failed");
                setStarted(false);
                openInFlightRef.current = null;

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }
                continue;
            }

            if (ev.type === "exit") {
                pushChunk("sys", `\r\n[process exited with code ${ev.code}]\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setStarted(false);
                openInFlightRef.current = null;

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }
                continue;
            }

            if (ev.type === "error") {
                pushChunk("err", `\r\n${ev.message}\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setState("failed");
                setStarted(false);
                openInFlightRef.current = null;

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }
            }
        }
    }, [events, pushChunk, schedulePostEnterSnapshot]);

    React.useEffect(() => {
        return () => {
            clearQuietTimer();
        };
    }, [clearQuietTimer]);

    return {
        available: args.enabled,
        started,
        starting,
        busy,
        inputEnabled,
        sessionId,
        state,
        terminalFeed,
        syncStatus,

        open,
        stop,
        reset,

        sendData,
        resize,

        replaceFiles,
        snapshotFiles,
        beforeSubmitEnter,
        afterSubmitEnter,
    };
}