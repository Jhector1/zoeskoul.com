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

type SyncStatus = "idle" | "pushing" | "pulling" | "error";

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

function normalizePath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function sortFiles(files: FileEntry[]) {
    return [...files]
        .map((f) => ({
            path: normalizePath(f.path),
            content: String(f.content ?? ""),
        }))
        .filter((f) => !!f.path)
        .sort((a, b) => a.path.localeCompare(b.path));
}

function filesEqual(a: FileEntry[], b: FileEntry[]) {
    const aa = sortFiles(a);
    const bb = sortFiles(b);

    if (aa.length !== bb.length) return false;

    for (let i = 0; i < aa.length; i++) {
        if (aa[i].path !== bb[i].path) return false;
        if (aa[i].content !== bb[i].content) return false;
    }

    return true;
}

function diffDirtyUiPaths(currentUiFiles: FileEntry[], baselineFiles: FileEntry[]) {
    const out = new Set<string>();

    const current = new Map(sortFiles(currentUiFiles).map((f) => [f.path, f.content]));
    const baseline = new Map(sortFiles(baselineFiles).map((f) => [f.path, f.content]));

    const allPaths = new Set([...current.keys(), ...baseline.keys()]);

    for (const path of allPaths) {
        if ((current.get(path) ?? null) !== (baseline.get(path) ?? null)) {
            out.add(path);
        }
    }

    return out;
}

function applyDirtyOverridesToSnapshot(
    snapshotFiles: FileEntry[],
    currentUiFiles: FileEntry[],
    dirtyUiPaths: Set<string>,
) {
    const merged = new Map(sortFiles(snapshotFiles).map((f) => [f.path, f.content]));
    const current = new Map(sortFiles(currentUiFiles).map((f) => [f.path, f.content]));

    for (const path of dirtyUiPaths) {
        if (current.has(path)) {
            merged.set(path, current.get(path) ?? "");
        } else {
            merged.delete(path);
        }
    }

    return sortFiles(
        [...merged.entries()].map(([path, content]) => ({ path, content })),
    );
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
    files: FileEntry[];
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

    const lastPushedFilesRef = React.useRef<FileEntry[]>(
        sortFiles(normalizeFiles(args.initialFiles) ?? []),
    );
    const quietTimerRef = React.useRef<number | null>(null);
    const awaitingPostEnterSnapshotRef = React.useRef(false);
    const snapshotInFlightRef = React.useRef<Promise<boolean> | null>(null);

    const getWorkspaceFiles = React.useCallback(() => {
        const live = args.getWorkspaceFiles?.();
        if (live) return sortFiles(live);

        return sortFiles(normalizeFiles(args.initialFiles) ?? []);
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
        setTerminalFeed([]);
        setInputEnabled(false);
        setBusy(false);
        setState("idle");
        setStarted(false);
        setStarting(false);
        setSyncStatus("idle");
    }, [clearQuietTimer, closeSocket]);

    const replaceFiles = React.useCallback(
        async (files: FileEntry[]) => {
            if (!sessionId) return false;

            setSyncStatus("pushing");

            try {
                await postJson<ReplaceResponse>(
                    `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/replace`,
                    { files: sortFiles(files) },
                );
                lastPushedFilesRef.current = sortFiles(files);
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
        if (!sessionId) return [] as FileEntry[];

        setSyncStatus("pulling");

        try {
            const out = await postJson<SnapshotResponse>(
                `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/snapshot`,
                {},
            );
            setSyncStatus("idle");
            return sortFiles(out.files ?? []);
        } catch (e: any) {
            setSyncStatus("error");
            pushChunk("err", `\r\n${e?.message ?? "Failed to pull terminal workspace."}\r\n`);
            return [];
        }
    }, [sessionId, pushChunk]);

    const pushWorkspaceFromSource = React.useCallback(
        async (force = false) => {
            const files = getWorkspaceFiles();

            if (!force && filesEqual(files, lastPushedFilesRef.current)) {
                return true;
            }

            return await replaceFiles(files);
        },
        [getWorkspaceFiles, replaceFiles],
    );

    const pullSnapshotIntoWorkspace = React.useCallback(async () => {
        if (!sessionId) return false;
        if (snapshotInFlightRef.current) return await snapshotInFlightRef.current;

        const run = (async () => {
            const snapshot = await snapshotFiles();
            const currentUiFiles = getWorkspaceFiles();
            const dirtyUiPaths = diffDirtyUiPaths(
                currentUiFiles,
                lastPushedFilesRef.current,
            );

            const nextBaseline = applyDirtyOverridesToSnapshot(
                snapshot,
                currentUiFiles,
                dirtyUiPaths,
            );

            awaitingPostEnterSnapshotRef.current = false;

            try {
                await args.onTerminalSnapshotFiles?.(snapshot, {
                    dirtyUiPaths,
                });
            } finally {
                lastPushedFilesRef.current = nextBaseline;
            }

            return true;
        })();

        snapshotInFlightRef.current = run;

        try {
            return await run;
        } finally {
            snapshotInFlightRef.current = null;
        }
    }, [sessionId, snapshotFiles, getWorkspaceFiles, args]);

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
        if (starting) return;
        if (started && !isFinalSessionState(state)) return;

        const files = getWorkspaceFiles();

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
                ...(files.length ? { files } : {}),
            });

            lastPushedFilesRef.current = sortFiles(files);
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
        args.projectId,
        args.cwd,
        getWorkspaceFiles,
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
            clearQuietTimer();
            setBusy(false);
            setInputEnabled(false);
            setStarted(false);
            setStarting(false);
        }
    }, [cancel, started, starting, pushChunk, clearQuietTimer]);

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