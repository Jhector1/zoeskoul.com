"use client";

import * as React from "react";
import type { RunSessionState } from "@zoeskoul/code-contracts";
import type {
    TerminalConnectionState,
    TerminalEvidence,
    TerminalChunk,
    TerminalRecoverState,
    WorkspaceSyncEntry,
    WorkspaceTerminalController,
    WorkspaceTerminalConfig,
} from "../../runtime";
import {
    appendTerminalEvidenceCommand,
    appendTerminalEvidenceOutput,
    createDisconnectedTerminalRecovery,
    createTerminalEvidence,
    isTerminalActuallyInteractive,
    reuseInFlightPromise,
    shouldProbeTerminalOnVisibilityRestore,
} from "../../runtime";
import { useRunSession } from "../useRunSession";
import {
    deleteTerminalHistory,
    getTerminalHistory,
    putTerminalHistory,
} from "./terminalHistory.idb";

type SyncStatus = "idle" | "pushing" | "pulling" | "error";

type TerminalRecovery = {
    state: TerminalRecoverState;
    message: string | null;
};

const NO_TERMINAL_RECOVERY: TerminalRecovery = { state: "none", message: null };
const STARTING_STALE_MS = 12_000;
const PROMPT_FALLBACK_DELAY_MS = 250;
const LOCAL_SHELL_PROMPT = "[zoeskoul]~$ ";

function terminalFeedText(feed: TerminalChunk[]) {
    return feed.map((chunk) => String(chunk.data ?? "")).join("");
}

function feedEndsWithPrompt(feed: TerminalChunk[]) {
    const text = terminalFeedText(feed).replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
    if (!text) return false;
    if (text.endsWith(LOCAL_SHELL_PROMPT.trimEnd())) return true;
    return /(?:^|\r?\n)\[[^\]]+\].*[$#]\s*$/.test(text);
}
const SOCKET_OPEN_READY_STATE = 1;
const CLIENT_START_COOLDOWN_MS = 2_500;
const CLIENT_AUTO_START_RETRY_COOLDOWN_MS = 60_000;
const CLIENT_RECOVERY_RETRY_COOLDOWN_MS = 6_000;
const MAX_PENDING_RECOVERY_INPUT_CHARS = 4096;
const terminalAutoStartAttempts = new Map<string, number>();

const CLIENT_UNMOUNT_CANCEL_GRACE_MS = 4_000;
const terminalUnmountCancelTimers = new Map<string, number>();

function unmountCancelKey(workspaceKey: string, sessionId: string) {
    return `${workspaceKey}::${sessionId}`;
}

function clearScheduledUnmountCancel(key: string) {
    const timer = terminalUnmountCancelTimers.get(key);
    if (timer != null) {
        window.clearTimeout(timer);
        terminalUnmountCancelTimers.delete(key);
    }
}

function clearScheduledUnmountCancelsForWorkspace(workspaceKey: string) {
    for (const key of terminalUnmountCancelTimers.keys()) {
        if (key.startsWith(`${workspaceKey}::`)) {
            clearScheduledUnmountCancel(key);
        }
    }
}

function scheduleUnmountCancel(args: { workspaceKey: string; sessionId: string }) {
    const key = unmountCancelKey(args.workspaceKey, args.sessionId);
    clearScheduledUnmountCancel(key);

    const timer = window.setTimeout(() => {
        terminalUnmountCancelTimers.delete(key);

        void fetch(`/api/run/pty/sessions/${encodeURIComponent(args.sessionId)}/cancel`, {
            method: "POST",
        }).catch(() => {});
    }, CLIENT_UNMOUNT_CANCEL_GRACE_MS);

    terminalUnmountCancelTimers.set(key, timer);
}

type OpenWorkspaceTerminalOptions = {
    userInitiated?: boolean;
};

function shouldAllowAutomaticTerminalStart(key: string) {
    const now = Date.now();
    const previous = terminalAutoStartAttempts.get(key) ?? 0;

    for (const [claimKey, at] of terminalAutoStartAttempts) {
        if (now - at > CLIENT_AUTO_START_RETRY_COOLDOWN_MS * 2) {
            terminalAutoStartAttempts.delete(claimKey);
        }
    }

    if (now - previous < CLIENT_AUTO_START_RETRY_COOLDOWN_MS) {
        return false;
    }

    terminalAutoStartAttempts.set(key, now);
    return true;
}

function releaseAutomaticTerminalStart(key: string) {
    terminalAutoStartAttempts.delete(key);
}

function isTooManySessionsMessage(message: string) {
    return /too many\s+(active\s+sessions|session\s+starts|sessions)/i.test(message);
}

function isStaleRunnerSessionMessage(message: string) {
    return /no such container|no such session|session not found|forbidden/i.test(message);
}

function normalizeRecoverableTerminalError(message: string): TerminalRecovery {
    const text = String(message ?? "").trim() || "Terminal session stopped.";

    if (isTooManySessionsMessage(text)) {
        return {
            state: "blocked_too_many_sessions",
            message: "Too many terminal starts. Wait about one minute, then click Restart terminal once.",
        };
    }

    return { state: "restart_available", message: text };
}

const HISTORY_FILE_PATH = ".bash_history";
const HISTORY_STORAGE_PREFIX = "zoeskoul:terminal-history:v3";
const HISTORY_MAX_LINES = 500;
const HISTORY_MAX_BYTES = 32 * 1024;

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
        return files.map((entry): WorkspaceSyncEntry => {
            if ((entry as any)?.kind === "directory") {
                return {
                    kind: "directory",
                    path: String((entry as any).path ?? ""),
                };
            }

            return {
                kind: "file",
                path: String((entry as any).path ?? ""),
                content: String((entry as any).content ?? ""),
            };
        });
    }

    return Object.entries(files).map(
        ([path, content]): WorkspaceSyncEntry => ({
            kind: "file",
            path,
            content,
        }),
    );
}

function normalizePath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function sortEntries(entries: WorkspaceSyncEntry[]): WorkspaceSyncEntry[] {
    return [...entries]
        .map((entry): WorkspaceSyncEntry => {
            if (entry.kind === "directory") {
                return {
                    kind: "directory",
                    path: normalizePath(entry.path),
                };
            }

            return {
                kind: "file",
                path: normalizePath(entry.path),
                content: String((entry as any).content ?? ""),
            };
        })
        .filter((entry): entry is WorkspaceSyncEntry => !!entry.path)
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
        const left = aa[i];
        const right = bb[i];

        if (left.kind !== right.kind) return false;
        if (left.path !== right.path) return false;

        if (left.kind !== "directory" && right.kind !== "directory") {
            if (left.content !== right.content) return false;
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
): WorkspaceSyncEntry[] {
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

function buildHistoryStorageKey(args: {
    historyScopeKey?: string;
    projectId?: string;
    cwd?: string;
    title?: string;
}) {
    const scope =
        args.historyScopeKey?.trim() ||
        (args.projectId?.trim() ? `project:${args.projectId.trim()}` : "workspace:default");

    const cwd = normalizePath(args.cwd || "/workspace") || "/workspace";
    const title = (args.title?.trim() || "terminal").replace(/\s+/g, "-").toLowerCase();

    return `${HISTORY_STORAGE_PREFIX}:${scope}:${cwd}:${title}`;
}

function capHistoryContent(input: string) {
    const encoder = new TextEncoder();

    let lines = String(input ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\0/g, "")
        .split("\n");

    while (lines.length && lines[lines.length - 1] === "") {
        lines.pop();
    }

    if (lines.length > HISTORY_MAX_LINES) {
        lines = lines.slice(-HISTORY_MAX_LINES);
    }

    let text = lines.join("\n");

    while (lines.length > 1 && encoder.encode(text).length > HISTORY_MAX_BYTES) {
        lines.shift();
        text = lines.join("\n");
    }

    if (!text.trim()) return "";
    return text.endsWith("\n") ? text : `${text}\n`;
}

function appendHistoryLine(existing: string, line: string) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) return capHistoryContent(existing);
    return capHistoryContent(`${existing}${trimmed}\n`);
}

function isHiddenHistoryEntry(entry: WorkspaceSyncEntry) {
    if (entry.kind === "directory") return false;
    const parts = normalizePath(entry.path).split("/").filter(Boolean);
    return parts[parts.length - 1] === HISTORY_FILE_PATH;
}

function augmentEntriesWithHistory(
    entries: WorkspaceSyncEntry[],
    historyContent: string,
): WorkspaceSyncEntry[] {
    const visible = sortEntries(entries).filter((entry) => !isHiddenHistoryEntry(entry));

    if (!historyContent) return visible;

    return sortEntries([
        ...visible,
        {
            kind: "file",
            path: HISTORY_FILE_PATH,
            content: historyContent,
        },
    ]);
}

function stripHiddenHistoryEntry(
    entries: WorkspaceSyncEntry[],
): { visible: WorkspaceSyncEntry[]; historyContent: string | null } {
    let historyContent: string | null = null;
    const visible: WorkspaceSyncEntry[] = [];

    for (const entry of sortEntries(entries)) {
        if (isHiddenHistoryEntry(entry)) {
            historyContent = String((entry as any).content ?? "");
            continue;
        }
        visible.push(entry);
    }

    return { visible, historyContent };
}

function isPersistentHistoryClearCommand(line: string) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed) return false;

    const segments = trimmed
        .split(/&&|;/g)
        .map((part) => part.trim())
        .filter(Boolean);

    if (!segments.length) return false;

    let sawClear = false;
    let sawWrite = false;

    for (const segment of segments) {
        const match = segment.match(/^history(?:\s+(.*))?$/);
        if (!match) return false;

        const tail = (match[1] ?? "").trim();
        const tokens = tail ? tail.split(/\s+/) : [];

        for (const token of tokens) {
            if (!token.startsWith("-")) continue;
            if (token.includes("c")) sawClear = true;
            if (token.includes("w")) sawWrite = true;
        }
    }

    return sawClear && sawWrite;
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
    const initialEvidenceCwd = React.useMemo(() => {
        const cwd = normalizePath(args.cwd ?? "");
        return cwd || undefined;
    }, [args.cwd]);
    const {
        sessionId,
        state: runSessionState,
        events,
        connectionState,
        socketReadyState,
        lastMessageAt,
        disconnectReason,
        start,
        sendInput,
        resize: sessionResize,
        cancel,
        closeSocket,
        probeConnection,
    } = useRunSession();
    const terminalLeaseKey = React.useMemo(() => {
        const explicit = String((args as any).workspaceKey ?? "").trim();
        if (explicit) return explicit;

        const exerciseKey = String(args.exerciseStateKey ?? "").trim();
        if (exerciseKey) return exerciseKey;

        return [
            args.projectId ?? "lesson",
            args.cwd ?? "/workspace",
            args.historyScopeKey ?? "terminal",
        ].join(":");
    }, [
        (args as any).workspaceKey,
        args.exerciseStateKey,
        args.projectId,
        args.cwd,
        args.historyScopeKey,
    ]);
    const [terminalFeed, setTerminalFeed] = React.useState<TerminalChunk[]>([]);
    const terminalFeedRef = React.useRef<TerminalChunk[]>([]);
    const promptFallbackTimerRef = React.useRef<number | null>(null);
    const [terminalEvidence, setTerminalEvidence] = React.useState<TerminalEvidence>(
        () => createTerminalEvidence(initialEvidenceCwd),
    );
    const [inputEnabled, setInputEnabled] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [state, setState] = React.useState<RunSessionState | "idle">("idle");
    const [started, setStarted] = React.useState(false);
    const [starting, setStarting] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>("idle");
    const [recoverState, setRecoverState] = React.useState<TerminalRecoverState>("none");
    const [recoverMessage, setRecoverMessage] = React.useState<string | null>(null);
    const [restarting, setRestarting] = React.useState(false);
    const [stopping, setStopping] = React.useState(false);

    const nextChunkIdRef = React.useRef(1);
    const lastHandledSeqRef = React.useRef(0);

    const lastPushedEntriesRef = React.useRef<WorkspaceSyncEntry[]>(
        sortEntries(normalizeEntries(args.initialFiles) ?? []).filter(
            (entry) => !isHiddenHistoryEntry(entry),
        ),
    );
    const quietTimerRef = React.useRef<number | null>(null);
    const awaitingPostEnterSnapshotRef = React.useRef(false);
    const snapshotInFlightRef = React.useRef<Promise<boolean> | null>(null);
    const openInFlightRef = React.useRef<Promise<void> | null>(null);
    const openedLeaseKeyRef = React.useRef<string | null>(null);
    const previousLeaseKeyRef = React.useRef<string | null>(null);
    const sessionIdRef = React.useRef<string | null>(sessionId);
    const startedRef = React.useRef(started);
    const startingRef = React.useRef(starting);
    const stoppingRef = React.useRef(stopping);
    const restartingRef = React.useRef(restarting);
    const stateRef = React.useRef<RunSessionState | "idle">(state);
    const restartInFlightRef = React.useRef<Promise<void> | null>(null);
    const staleStartingTimerRef = React.useRef<number | null>(null);
    const interactiveReadyRef = React.useRef(false);
    const recoverStateRef = React.useRef<TerminalRecoverState>("none");
    const lastStartAttemptAtRef = React.useRef(0);
    const recoverInFlightRef = React.useRef<Promise<void> | null>(null);
    const lastRecoverAttemptAtRef = React.useRef(0);
    const terminalProcessExitedRef = React.useRef(false);
    const terminalExitCodeRef = React.useRef<number | null>(null);
    const pendingRecoveryInputRef = React.useRef("");
    const historyStorageKey = React.useMemo(
        () =>
            buildHistoryStorageKey({
                historyScopeKey: args.historyScopeKey,
                projectId: args.projectId,
                cwd: args.cwd,
                title: args.title,
            }),
        [args.historyScopeKey, args.projectId, args.cwd, args.title],
    );

    const historyContentRef = React.useRef("");
    const historyLoadPromiseRef = React.useRef<Promise<string> | null>(null);
    const pendingInputLineRef = React.useRef("");
    const escapeSequenceRef = React.useRef("");
    const currentCwdRef = React.useRef<string | undefined>(initialEvidenceCwd);

    const ensureHistoryLoaded = React.useCallback(async (): Promise<string> => {
        if (historyLoadPromiseRef.current) {
            return await historyLoadPromiseRef.current;
        }

        const run = (async (): Promise<string> => {
            try {
                const content = capHistoryContent(
                    (await getTerminalHistory(historyStorageKey)) ?? "",
                );
                historyContentRef.current = content;
                return content;
            } catch {
                return historyContentRef.current;
            } finally {
                historyLoadPromiseRef.current = null;
            }
        })();

        historyLoadPromiseRef.current = run;
        return await run;
    }, [historyStorageKey]);

    const persistHistoryContent = React.useCallback(
        async (content: string | null): Promise<void> => {
            const capped = capHistoryContent(content ?? "");
            historyContentRef.current = capped;

            try {
                if (!capped) {
                    await deleteTerminalHistory(historyStorageKey);
                } else {
                    await putTerminalHistory(historyStorageKey, capped);
                }
            } catch {}
        },
        [historyStorageKey],
    );

    const appendHistoryLineNow = React.useCallback(
        async (line: string): Promise<void> => {
            const next = appendHistoryLine(historyContentRef.current, line);
            historyContentRef.current = next;

            try {
                if (!next) {
                    await deleteTerminalHistory(historyStorageKey);
                } else {
                    await putTerminalHistory(historyStorageKey, next);
                }
            } catch {}
        },
        [historyStorageKey],
    );

    const commitPendingInputLine = React.useCallback(async (): Promise<void> => {
        const line = pendingInputLineRef.current;
        pendingInputLineRef.current = "";

        const trimmed = line.trim();
        if (!trimmed) return;

        setTerminalEvidence((prev) =>
            appendTerminalEvidenceCommand(prev, trimmed, currentCwdRef.current),
        );

        if (isPersistentHistoryClearCommand(trimmed)) {
            await persistHistoryContent("");
            return;
        }

        await appendHistoryLineNow(trimmed);
    }, [appendHistoryLineNow, persistHistoryContent]);

    const mirrorOutgoingInput = React.useCallback(
        (data: string) => {
            if (!data) return;

            for (let i = 0; i < data.length; i += 1) {
                const ch = data[i];

                if (escapeSequenceRef.current) {
                    escapeSequenceRef.current += ch;

                    if (/[A-Za-z~]$/.test(escapeSequenceRef.current)) {
                        escapeSequenceRef.current = "";
                    }
                    continue;
                }

                if (ch === "\u001b") {
                    escapeSequenceRef.current = ch;
                    continue;
                }

                if (ch === "\r" || ch === "\n") {
                    void commitPendingInputLine();

                    if (ch === "\r" && data[i + 1] === "\n") {
                        i += 1;
                    }
                    continue;
                }

                if (ch === "\u007f" || ch === "\b") {
                    pendingInputLineRef.current = pendingInputLineRef.current.slice(0, -1);
                    continue;
                }

                if (ch === "\u0003" || ch === "\u0015") {
                    pendingInputLineRef.current = "";
                    continue;
                }

                if (ch === "\u0017") {
                    pendingInputLineRef.current = pendingInputLineRef.current.replace(
                        /(?:\s+)?[^\s]*$/,
                        "",
                    );
                    continue;
                }

                if (ch < " " && ch !== "\t") {
                    continue;
                }

                pendingInputLineRef.current += ch;
            }
        },
        [commitPendingInputLine],
    );

    React.useEffect(() => {
        historyContentRef.current = "";
        historyLoadPromiseRef.current = null;
        pendingInputLineRef.current = "";
        escapeSequenceRef.current = "";
        terminalProcessExitedRef.current = false;
        terminalExitCodeRef.current = null;
        currentCwdRef.current = initialEvidenceCwd;
        setTerminalEvidence(createTerminalEvidence(initialEvidenceCwd));
        void ensureHistoryLoaded();
    }, [ensureHistoryLoaded, initialEvidenceCwd]);

    React.useEffect(() => {
        startedRef.current = started;
    }, [started]);

    React.useEffect(() => {
        startingRef.current = starting;
    }, [starting]);

    React.useEffect(() => {
        stoppingRef.current = stopping;
    }, [stopping]);

    React.useEffect(() => {
        restartingRef.current = restarting;
    }, [restarting]);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    React.useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    const interactiveReady = isTerminalActuallyInteractive({
        inputEnabled,
        sessionId,
        socketReadyState,
        connectionState: connectionState as TerminalConnectionState,
        restarting,
        stopping,
        recoverState,
    });

    React.useEffect(() => {
        interactiveReadyRef.current = interactiveReady;
    }, [interactiveReady]);

    const disconnectedInputGuardActive =
        recoverState !== "none" ||
        restarting ||
        stopping ||
        (!sessionId && !starting);

    const getWorkspaceEntries = React.useCallback((): WorkspaceSyncEntry[] => {
        const live = args.getWorkspaceFiles?.();
        if (live) {
            return sortEntries(live).filter((entry) => !isHiddenHistoryEntry(entry));
        }

        return sortEntries(normalizeEntries(args.initialFiles) ?? []).filter(
            (entry) => !isHiddenHistoryEntry(entry),
        );
    }, [args.getWorkspaceFiles, args.initialFiles]);

    const pushChunk = React.useCallback(
        (kind: TerminalChunk["kind"], data: string) => {
            if (!data) return;

            setTerminalEvidence((prev) => appendTerminalEvidenceOutput(prev, data));
            setTerminalFeed((prev) => {
                const next = [
                    ...prev,
                    { id: nextChunkIdRef.current++, kind, data },
                ];
                terminalFeedRef.current = next;
                return next;
            });
        },
        [],
    );

    const clearQuietTimer = React.useCallback(() => {
        if (quietTimerRef.current != null) {
            window.clearTimeout(quietTimerRef.current);
            quietTimerRef.current = null;
        }
    }, []);

    const clearStaleStartingTimer = React.useCallback(() => {
        if (staleStartingTimerRef.current != null) {
            window.clearTimeout(staleStartingTimerRef.current);
            staleStartingTimerRef.current = null;
        }
    }, []);

    const clearPromptFallbackTimer = React.useCallback(() => {
        if (promptFallbackTimerRef.current != null) {
            window.clearTimeout(promptFallbackTimerRef.current);
            promptFallbackTimerRef.current = null;
        }
    }, []);

    const schedulePromptFallback = React.useCallback(() => {
        clearPromptFallbackTimer();

        promptFallbackTimerRef.current = window.setTimeout(() => {
            promptFallbackTimerRef.current = null;

            if (terminalProcessExitedRef.current) return;
            if (recoverStateRef.current !== "none") return;
            if (feedEndsWithPrompt(terminalFeedRef.current)) return;

            pushChunk("pty", LOCAL_SHELL_PROMPT);
        }, PROMPT_FALLBACK_DELAY_MS);
    }, [clearPromptFallbackTimer, pushChunk]);

    const setTerminalRecovery = React.useCallback((recovery: TerminalRecovery) => {
        recoverStateRef.current = recovery.state;
        setRecoverState(recovery.state);
        setRecoverMessage(recovery.message);
    }, []);

    const clearTerminalRecovery = React.useCallback(() => {
        setTerminalRecovery(NO_TERMINAL_RECOVERY);
    }, [setTerminalRecovery]);

    const clearLocalTerminalState = React.useCallback(() => {
        lastHandledSeqRef.current = 0;
        nextChunkIdRef.current = 1;
        awaitingPostEnterSnapshotRef.current = false;
        snapshotInFlightRef.current = null;
        openInFlightRef.current = null;
        pendingInputLineRef.current = "";
        escapeSequenceRef.current = "";
        terminalProcessExitedRef.current = false;
        terminalExitCodeRef.current = null;
        currentCwdRef.current = initialEvidenceCwd;
        terminalFeedRef.current = [];
        setTerminalFeed([]);
        setTerminalEvidence(createTerminalEvidence(initialEvidenceCwd));
        setInputEnabled(false);
        setBusy(false);
        setState("idle");
        setStarted(false);
        setStarting(false);
        setSyncStatus("idle");
        clearTerminalRecovery();
        setRestarting(false);
        setStopping(false);
    }, [clearTerminalRecovery, initialEvidenceCwd]);

    const reset = React.useCallback(() => {
        clearQuietTimer();
        clearStaleStartingTimer();
        clearPromptFallbackTimer();
        void cancel().catch(() => {});
        closeSocket();
        clearLocalTerminalState();
    }, [cancel, clearLocalTerminalState, clearQuietTimer, clearStaleStartingTimer, clearPromptFallbackTimer, closeSocket]);

    const replaceFiles = React.useCallback(
        async (files: WorkspaceSyncEntry[]): Promise<boolean> => {
            if (!sessionId) return false;

            setSyncStatus("pushing");

            try {
                const visible = sortEntries(files).filter(
                    (entry) => !isHiddenHistoryEntry(entry),
                );
                const historyContent = await ensureHistoryLoaded();
                const payload = augmentEntriesWithHistory(visible, historyContent);

                await postJson<ReplaceResponse>(
                    `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/replace`,
                    { files: payload },
                );

                lastPushedEntriesRef.current = visible;
                setSyncStatus("idle");
                return true;
            } catch (e: any) {
                setSyncStatus("error");
                pushChunk("err", `\r\n${e?.message ?? "Failed to sync workspace to terminal."}\r\n`);
                return false;
            }
        },
        [sessionId, ensureHistoryLoaded, pushChunk],
    );

    const snapshotFiles = React.useCallback(async (): Promise<WorkspaceSyncEntry[]> => {
        if (!sessionId) return [];

        setSyncStatus("pulling");

        try {
            const out = await postJson<SnapshotResponse>(
                `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/snapshot`,
                {},
            );

            const { visible, historyContent } = stripHiddenHistoryEntry(out.files ?? []);

            if (historyContent !== null) {
                void persistHistoryContent(historyContent);
            }

            setSyncStatus("idle");
            return sortEntries(visible);
        } catch (e: any) {
            setSyncStatus("error");
            pushChunk("err", `\r\n${e?.message ?? "Failed to pull terminal workspace."}\r\n`);
            return [];
        }
    }, [sessionId, persistHistoryContent, pushChunk]);

    const pushWorkspaceFromSource = React.useCallback(
        async (force = false): Promise<boolean> => {
            const entries = getWorkspaceEntries();

            if (!force && entriesEqual(entries, lastPushedEntriesRef.current)) {
                return true;
            }

            return await replaceFiles(entries);
        },
        [getWorkspaceEntries, replaceFiles],
    );

    const pullSnapshotIntoWorkspace = React.useCallback(async (): Promise<boolean> => {
        if (!sessionId) return false;
        if (snapshotInFlightRef.current) return await snapshotInFlightRef.current;

        const run = (async (): Promise<boolean> => {
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

    const beforeSubmitEnter = React.useCallback(async (): Promise<void> => {
        const ok = await pushWorkspaceFromSource(false);
        if (!ok) {
            throw new Error("Could not push local workspace to terminal.");
        }
    }, [pushWorkspaceFromSource]);

    const afterSubmitEnter = React.useCallback(async (): Promise<void> => {
        awaitingPostEnterSnapshotRef.current = true;
        schedulePostEnterSnapshot(700);
    }, [schedulePostEnterSnapshot]);

    const open = React.useCallback(
        async (options: OpenWorkspaceTerminalOptions = {}): Promise<void> => {
            const userInitiated = options.userInitiated === true;

            if (!args.enabled) return;

            clearScheduledUnmountCancelsForWorkspace(terminalLeaseKey);

            /**
             * Normal refresh/socket recovery should be quiet. Only a real runner
             * rate-limit blocks automatic recovery; other recovery states are
             * cleared so the terminal can reconnect/start again.
             */
            if (!userInitiated && recoverStateRef.current === "blocked_too_many_sessions") {
                return;
            }

            if (recoverStateRef.current !== "none" && recoverStateRef.current !== "blocked_too_many_sessions") {
                clearTerminalRecovery();
            }

            /**
             * Client-side safety brake. The runner already has a rate limiter, but the
             * browser should not hammer /sessions/start if React effects remount quickly.
             */
            if (!userInitiated && terminalProcessExitedRef.current) {
                return;
            }

            if (!userInitiated) {
                const now = Date.now();
                if (now - lastStartAttemptAtRef.current < CLIENT_START_COOLDOWN_MS) {
                    return;
                }
                if (!shouldAllowAutomaticTerminalStart(terminalLeaseKey)) {
                    return;
                }
                lastStartAttemptAtRef.current = now;
            }

            if (openInFlightRef.current) {
                return await openInFlightRef.current;
            }

            if (startingRef.current) return;

            if (
                startedRef.current &&
                openedLeaseKeyRef.current === terminalLeaseKey &&
                !isFinalSessionState(stateRef.current)
            ) {
                return;
            }

            if (
                startedRef.current &&
                openedLeaseKeyRef.current !== terminalLeaseKey &&
                !isFinalSessionState(stateRef.current)
            ) {
                try {
                    await cancel();
                } catch {
                    // Ignore stale cancel failures; the next start is authoritative.
                }

                closeSocket();
                openedLeaseKeyRef.current = null;
                setStarted(false);
                setStarting(false);
                setBusy(false);
                setInputEnabled(false);
            }

            const run = (async (): Promise<void> => {
                const visibleEntries = getWorkspaceEntries();
                const historyContent = await ensureHistoryLoaded();
                const fullEntries = augmentEntriesWithHistory(visibleEntries, historyContent);

                lastHandledSeqRef.current = 0;
                nextChunkIdRef.current = 1;
                awaitingPostEnterSnapshotRef.current = false;
                pendingInputLineRef.current = "";
                escapeSequenceRef.current = "";
                terminalProcessExitedRef.current = false;
                terminalExitCodeRef.current = null;
                terminalFeedRef.current = [];
                setTerminalFeed([]);
                setInputEnabled(false);
                setBusy(true);
                setState("preparing");
                setStarting(true);
                setSyncStatus("idle");
                clearTerminalRecovery();
                clearStaleStartingTimer();
                clearPromptFallbackTimer();

                staleStartingTimerRef.current = window.setTimeout(() => {
                    staleStartingTimerRef.current = null;

                    if (!startingRef.current) return;

                    openInFlightRef.current = null;
                    setStarting(false);
                    setBusy(false);
                    setInputEnabled(false);
                    setState("failed");
                    setStarted(false);
                    setTerminalRecovery({
                        state: "restart_available",
                        message: "Terminal is still starting. Restart the terminal to try again.",
                    });
                }, STARTING_STALE_MS);

                pushChunk("sys", "[starting workspace terminal]\r\n");

                try {
                    openedLeaseKeyRef.current = terminalLeaseKey;

                    await start({
                        kind: "shell",
                        mode: "interactive",
                        language: "bash",
                        projectId: args.projectId,
                        cwd: args.cwd,
                        workspaceKey: terminalLeaseKey,
                        ...(fullEntries.length ? { files: fullEntries as any } : {}),
                    } as any);

                    lastPushedEntriesRef.current = visibleEntries;
                    setStarted(true);
                } catch (e: any) {
                    const message = e?.message ?? "Failed to start workspace terminal.";
                    const tooManySessions = isTooManySessionsMessage(message);

                    clearPromptFallbackTimer();
                    pushChunk("err", `${message}\r\n`);
                    setTerminalRecovery(normalizeRecoverableTerminalError(message));

                    if (tooManySessions) {
                        pendingRecoveryInputRef.current = "";
                    }
                    setBusy(false);
                    setInputEnabled(false);
                    setState("failed");
                    setStarted(false);
                    setStarting(false);

                    if (openedLeaseKeyRef.current === terminalLeaseKey) {
                        openedLeaseKeyRef.current = null;
                    }

                    /**
                     * Do not throw here.
                     *
                     * If open() throws, the auto-open caller may clear its guard and retry,
                     * which causes "Too many session starts. Limit is 5 per minute."
                     */
                    return;
                } finally {
                    clearStaleStartingTimer();
                    setStarting(false);
                    openInFlightRef.current = null;
                }
            })();

            openInFlightRef.current = run;
            return await run;
        },
        [
            args.enabled,
            args.projectId,
            args.cwd,
            getWorkspaceEntries,
            ensureHistoryLoaded,
            start,
            pushChunk,
            terminalLeaseKey,
            cancel,
            closeSocket,
            clearStaleStartingTimer,
            clearPromptFallbackTimer,
            clearTerminalRecovery,
            setTerminalRecovery,
        ],
    );

    const stop = React.useCallback(async (): Promise<void> => {
        if (!startedRef.current && !startingRef.current) return;
        setStopping(true);

        try {
            await cancel();
        } finally {
            clearQuietTimer();
            clearStaleStartingTimer();
            openedLeaseKeyRef.current = null;
            clearLocalTerminalState();
            setStopping(false);
        }
    }, [cancel, clearLocalTerminalState, clearQuietTimer, clearStaleStartingTimer]);

    const restart = React.useCallback(async (): Promise<void> => {
        if (!args.enabled) return;

        return await reuseInFlightPromise(restartInFlightRef, async () => {
            setRestarting(true);
            setStopping(true);
            clearScheduledUnmountCancelsForWorkspace(terminalLeaseKey);
            clearQuietTimer();
            clearStaleStartingTimer();
            openInFlightRef.current = null;

            try {
                const hadSession =
                    Boolean(sessionId) ||
                    startedRef.current ||
                    startingRef.current ||
                    openedLeaseKeyRef.current !== null;

                if (hadSession) {
                    try {
                        await cancel();
                    } catch {
                        // Stale/expired backend session may already be gone.
                    }
                }

                closeSocket();
                openedLeaseKeyRef.current = null;
                clearLocalTerminalState();
                terminalProcessExitedRef.current = false;
                terminalExitCodeRef.current = null;
                releaseAutomaticTerminalStart(terminalLeaseKey);

                setRestarting(true);

                /**
                 * User clicked Restart, so this is allowed to bypass recovery.
                 * Automatic open is still blocked while recoverState !== "none".
                 */
                await open({ userInitiated: true });
            } finally {
                setStopping(false);
                setRestarting(false);
            }
        });
    }, [
        args.enabled,
        cancel,
        clearLocalTerminalState,
        clearQuietTimer,
        clearStaleStartingTimer,
        closeSocket,
        open,
        sessionId,
        terminalLeaseKey,
    ]);

    React.useEffect(() => {
        const previousLeaseKey = previousLeaseKeyRef.current;
        previousLeaseKeyRef.current = terminalLeaseKey;

        if (!previousLeaseKey || previousLeaseKey === terminalLeaseKey) {
            return;
        }

        const hadSessionForPreviousLease =
            openedLeaseKeyRef.current === previousLeaseKey &&
            (startedRef.current ||
                startingRef.current ||
                openInFlightRef.current !== null);

        clearQuietTimer();
        clearStaleStartingTimer();
        clearTerminalRecovery();
        openInFlightRef.current = null;
        pendingInputLineRef.current = "";
        escapeSequenceRef.current = "";
        setBusy(false);
        setInputEnabled(false);
        setStarted(false);
        setStarting(false);

        if (openedLeaseKeyRef.current === previousLeaseKey) {
            openedLeaseKeyRef.current = null;
        }

        if (hadSessionForPreviousLease) {
            void cancel().catch(() => {});
        }

        closeSocket();
    }, [terminalLeaseKey, cancel, clearQuietTimer, clearStaleStartingTimer, clearTerminalRecovery, closeSocket]);

    React.useEffect(() => {
        return () => {
            const currentSessionId = sessionIdRef.current;
            const currentLeaseKey = openedLeaseKeyRef.current;
            const currentState = stateRef.current;

            /**
             * Route changes in the SPA unmount this controller even though the browser
             * tab stays open. If we never cancel that old PTY, the runner still counts
             * it as active, so the next visible terminal can hit "Limit is 2 per user"
             * even when the learner sees only one terminal.
             *
             * Do not cancel synchronously: React remounts and terminal-only layout
             * switches can unmount/remount the same lease during normal rendering. A
             * short grace window lets the same workspace reclaim the session. Browser
             * refresh is safe because page JS is destroyed before this timer can fire.
             */
            if (
                currentSessionId &&
                currentLeaseKey &&
                !isFinalSessionState(currentState) &&
                !stoppingRef.current &&
                !restartingRef.current
            ) {
                scheduleUnmountCancel({
                    workspaceKey: currentLeaseKey,
                    sessionId: currentSessionId,
                });
            }

            previousLeaseKeyRef.current = null;
            openInFlightRef.current = null;
            recoverInFlightRef.current = null;
            pendingRecoveryInputRef.current = "";
            openedLeaseKeyRef.current = null;
            clearQuietTimer();
            clearStaleStartingTimer();
            closeSocket();
        };
    }, [clearQuietTimer, clearStaleStartingTimer, closeSocket]);
    const recoverTerminalAfterInactiveInput = React.useCallback(async (): Promise<void> => {
        if (!args.enabled) return;
        if (restarting || stopping) return;
        if (terminalProcessExitedRef.current || isFinalSessionState(stateRef.current)) return;
        if (recoverStateRef.current === "restart_available") return;
        if (recoverStateRef.current === "blocked_too_many_sessions") return;

        if (recoverInFlightRef.current) {
            return await recoverInFlightRef.current;
        }

        const now = Date.now();
        if (now - lastRecoverAttemptAtRef.current < CLIENT_RECOVERY_RETRY_COOLDOWN_MS) {
            return;
        }
        lastRecoverAttemptAtRef.current = now;

        const run = (async (): Promise<void> => {
            clearTerminalRecovery();
            setBusy(false);
            setInputEnabled(false);
            setStarted(false);
            setStarting(false);
            openInFlightRef.current = null;
            releaseAutomaticTerminalStart(terminalLeaseKey);

            if (socketReadyState === SOCKET_OPEN_READY_STATE && sessionId) {
                const ok = await probeConnection().catch(() => false);
                if (ok) {
                    setStarted(true);
                    setInputEnabled(true);
                    return;
                }
            }

            try {
                await open({ userInitiated: true });

                const pending = pendingRecoveryInputRef.current;
                pendingRecoveryInputRef.current = "";

                if (pending) {
                    void sendInput(pending).catch(() => {
                        pendingRecoveryInputRef.current = (pending + pendingRecoveryInputRef.current).slice(
                            -MAX_PENDING_RECOVERY_INPUT_CHARS,
                        );
                    });
                }
            } catch (e: any) {
                setTerminalRecovery(
                    normalizeRecoverableTerminalError(
                        e?.message || disconnectReason || "Terminal session could not reconnect.",
                    ),
                );
            }
        })();

        recoverInFlightRef.current = run;

        try {
            await run;
        } finally {
            if (recoverInFlightRef.current === run) {
                recoverInFlightRef.current = null;
            }
        }
    }, [
        args.enabled,
        clearTerminalRecovery,
        disconnectReason,
        open,
        probeConnection,
        restarting,
        sendInput,
        sessionId,
        setTerminalRecovery,
        socketReadyState,
        stopping,
        terminalLeaseKey,
    ]);

    const sendData = React.useCallback(
        (data: string) => {
            if (!data) return;

            if (
                terminalProcessExitedRef.current ||
                isFinalSessionState(stateRef.current) ||
                recoverStateRef.current === "restart_available" ||
                recoverStateRef.current === "blocked_too_many_sessions"
            ) {
                return;
            }

            if (
                recoverStateRef.current !== "none" ||
                restarting ||
                stopping ||
                !sessionId ||
                !inputEnabled ||
                socketReadyState !== SOCKET_OPEN_READY_STATE
            ) {
                pendingRecoveryInputRef.current = (pendingRecoveryInputRef.current + data).slice(
                    -MAX_PENDING_RECOVERY_INPUT_CHARS,
                );
                mirrorOutgoingInput(data);
                void recoverTerminalAfterInactiveInput();
                return;
            }

            mirrorOutgoingInput(data);

            void sendInput(data).catch((e: any) => {
                setTerminalRecovery(
                    createDisconnectedTerminalRecovery(
                        e?.message || disconnectReason || "Terminal session is disconnected.",
                    ),
                );
                setBusy(false);
                setInputEnabled(false);
                setStarted(false);
                setStarting(false);
                openInFlightRef.current = null;
            });
        },
        [
            disconnectReason,
            inputEnabled,
            mirrorOutgoingInput,
            recoverTerminalAfterInactiveInput,
            restarting,
            sendInput,
            sessionId,
            setTerminalRecovery,
            socketReadyState,
            stopping,
        ],
    );
    const handleDisconnectedInputAttempt = React.useCallback(async () => {
        await recoverTerminalAfterInactiveInput();
    }, [recoverTerminalAfterInactiveInput]);

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
        if (!args.enabled) return;

        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;

            const shouldProbe = shouldProbeTerminalOnVisibilityRestore({
                sessionId,
                socketReadyState,
                lastSocketMessageAt: lastMessageAt,
                started,
                starting,
                now: Date.now(),
            });

            if (!shouldProbe && openedLeaseKeyRef.current === null) {
                return;
            }

            if (socketReadyState !== SOCKET_OPEN_READY_STATE) {
                void recoverTerminalAfterInactiveInput();
                return;
            }

            if (shouldProbe) {
                void probeConnection();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [
        args.enabled,
        lastMessageAt,
        probeConnection,
        recoverTerminalAfterInactiveInput,
        sessionId,
        socketReadyState,
        started,
        starting,
    ]);


    // React.useEffect(() => {
    //     if (!args.enabled) return;
    //     if (stopping || restarting) return;
    //     if (recoverState !== "none") return;
    //     if (!sessionId && !started && !starting) return;
    //
    //     const socketClosed =
    //         Boolean(sessionId) &&
    //         socketReadyState !== null &&
    //         socketReadyState !== SOCKET_OPEN_READY_STATE;
    //
    //     const connectionClosed = connectionState === "disconnected";
    //
    //     if (!socketClosed && !connectionClosed) return;
    //
    //     setTerminalRecovery(
    //         createDisconnectedTerminalRecovery(
    //             disconnectReason || "Terminal session is disconnected.",
    //         ),
    //     );
    //     setBusy(false);
    //     setInputEnabled(false);
    //     setStarted(false);
    //     setStarting(false);
    //     openInFlightRef.current = null;
    // }, [
    //     args.enabled,
    //     connectionState,
    //     disconnectReason,
    //     recoverState,
    //     restarting,
    //     sessionId,
    //     socketReadyState,
    //     started,
    //     starting,
    //     stopping,
    //     setTerminalRecovery,
    // ]);

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
                    terminalProcessExitedRef.current = false;
                    terminalExitCodeRef.current = null;
                    clearTerminalRecovery();
                    setBusy(true);
                    setInputEnabled(true);
                    setStarted(true);
                    setStarting(false);

                    schedulePromptFallback();

                    if (awaitingPostEnterSnapshotRef.current) {
                        schedulePostEnterSnapshot(450);
                    }
                    continue;
                }

                if (isFinalSessionState(ev.state)) {
                    terminalProcessExitedRef.current = true;
                    terminalExitCodeRef.current = null;
                    pendingRecoveryInputRef.current = "";
                    clearPromptFallbackTimer();
                    setBusy(false);
                    setInputEnabled(false);
                    setStarted(false);
                    openInFlightRef.current = null;
                    clearStaleStartingTimer();

                    if (ev.state === "timed_out") {
                        setTerminalRecovery({
                            state: "restart_available",
                            message: "Session timed out from inactivity.",
                        });
                    } else if (ev.state === "failed") {
                        setTerminalRecovery({
                            state: "restart_available",
                            message: "Terminal session failed. Restart the terminal to try again.",
                        });
                    }

                    if (awaitingPostEnterSnapshotRef.current) {
                        schedulePostEnterSnapshot(100);
                    }
                    continue;
                }

                continue;
            }

            if (ev.type === "input_request") {
                terminalProcessExitedRef.current = false;
                terminalExitCodeRef.current = null;
                clearTerminalRecovery();
                setState("waiting_for_input");
                setBusy(true);
                setInputEnabled(true);
                setStarted(true);
                setStarting(false);
                schedulePromptFallback();

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(250);
                }
                continue;
            }

            if (ev.type === "compile_error") {
                terminalProcessExitedRef.current = true;
                terminalExitCodeRef.current = null;
                pendingRecoveryInputRef.current = "";
                clearPromptFallbackTimer();
                if (ev.stdout) pushChunk("pty", ev.stdout);
                if (ev.stderr) pushChunk("err", ev.stderr);
                setBusy(false);
                setInputEnabled(false);
                setState("failed");
                setStarted(false);
                openInFlightRef.current = null;
                setTerminalRecovery({
                    state: "restart_available",
                    message: "Terminal session failed. Restart the terminal to try again.",
                });

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }
                continue;
            }

            if (ev.type === "exit") {
                terminalProcessExitedRef.current = true;
                terminalExitCodeRef.current = ev.code;
                pendingRecoveryInputRef.current = "";
                clearPromptFallbackTimer();
                pushChunk("sys", `\r\n[process exited with code ${ev.code}]\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setStarted(false);
                openInFlightRef.current = null;
                setTerminalRecovery({
                    state: "restart_available",
                    message: "Terminal session closed. Restart the terminal to continue.",
                });

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }
                continue;
            }

            if (ev.type === "error") {
                const staleRunnerSession = isStaleRunnerSessionMessage(ev.message);

                if (staleRunnerSession) {
                    terminalProcessExitedRef.current = true;
                    terminalExitCodeRef.current = null;
                    pendingRecoveryInputRef.current = "";
                }

                clearPromptFallbackTimer();
                pushChunk("err", `\r\n${ev.message}\r\n`);
                setTerminalRecovery(
                    staleRunnerSession
                        ? {
                            state: "restart_available",
                            message: "Terminal session ended. Restart the terminal to continue.",
                        }
                        : normalizeRecoverableTerminalError(ev.message),
                );
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
    }, [events, pushChunk, schedulePostEnterSnapshot, clearStaleStartingTimer, clearPromptFallbackTimer, schedulePromptFallback, setTerminalRecovery]);

    React.useEffect(() => {
        if (!args.enabled) return;
        if (runSessionState !== "failed") return;
        if (!startedRef.current && !startingRef.current && !sessionId) return;
        if (recoverStateRef.current === "blocked_too_many_sessions") return;

        /**
         * Do not auto-start from this effect.
         *
         * A low-level run session failure means the backend rejected or ended the
         * session. If the message is a stale container/session error, repeatedly
         * auto-starting creates the visible "process exited 137" loop. Treat it
         * as a hard stop and require an explicit Restart click.
         */
        terminalProcessExitedRef.current = true;
        terminalExitCodeRef.current = null;
        pendingRecoveryInputRef.current = "";
        setBusy(false);
        setInputEnabled(false);
        setState("failed");
        setStarted(false);
        setStarting(false);
        openInFlightRef.current = null;
        clearStaleStartingTimer();
        clearPromptFallbackTimer();
        setTerminalRecovery({
            state: "restart_available",
            message: isStaleRunnerSessionMessage(disconnectReason ?? "")
                ? "Terminal session ended. Restart the terminal to continue."
                : "Terminal session failed. Restart the terminal to try again.",
        });
    }, [
        args.enabled,
        runSessionState,
        sessionId,
        clearStaleStartingTimer,
        clearPromptFallbackTimer,
        disconnectReason,
        setTerminalRecovery,
    ]);

    React.useEffect(() => {
        return () => {
            clearQuietTimer();
            clearStaleStartingTimer();
            clearPromptFallbackTimer();
        };
    }, [clearQuietTimer, clearStaleStartingTimer, clearPromptFallbackTimer]);

    return {
        available: args.enabled,
        started,
        starting,
        stopping,
        busy,
        inputEnabled,
        interactiveReady,
        disconnectedInputGuardActive,
        sessionId,
        state,
        terminalFeed,
        terminalEvidence,
        syncStatus,
        recoverState,
        recoverMessage,
        restarting,
        connectionState,
        socketReadyState,
        lastSocketMessageAt: lastMessageAt,

        open,
        stop,
        reset,
        restart,
        handleDisconnectedInputAttempt,

        sendData,
        resize,

        replaceFiles,
        snapshotFiles,
        syncWorkspaceNow: pullSnapshotIntoWorkspace,
        beforeSubmitEnter,
        afterSubmitEnter,
    };
}
