"use client";

import * as React from "react";
import type { RunSessionState } from "@zoeskoul/code-contracts";
import { deriveManifestTerminalBootstrap } from "@zoeskoul/curriculum-contracts";
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
import { isWorkspaceInternalPath } from "@/lib/projects/workspaceInternalPaths";
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
const STARTING_STALE_MS = 30_000;
const SOCKET_OPEN_READY_STATE = 1;
const CLIENT_START_COOLDOWN_MS = 2_500;
const CLIENT_START_CONTENTION_RETRY_ATTEMPTS = 2;
const CLIENT_START_CONTENTION_RETRY_DELAY_MS = 900;
const CLIENT_AUTO_START_RETRY_COOLDOWN_MS = 1_000;
const CLIENT_RECOVERY_RETRY_COOLDOWN_MS = 6_000;
const TERMINAL_AUTO_REVIVE_STALE_MS = 60_000;
const TERMINAL_INPUT_STALE_MS = 60_000;
const TERMINAL_REVIVE_WATCHDOG_INTERVAL_MS = 15_000;
const TERMINAL_PROMPT_PRIME_DELAY_MS = 700;
const TERMINAL_PROMPT_PRIME_MAX_ATTEMPTS = 3;

const STARTUP_CWD_READY_MARKER = "__ZOESKOUL_STARTUP_CWD_READY__";
const STARTUP_CWD_OUTPUT_SUPPRESSION_MS = 30_000;
const STARTUP_CWD_FAILED_MARKER = "__ZOESKOUL_STARTUP_CWD_FAILED__";

type StartupCwdOutputSuppression = {
    marker: string;
    failureMarker: string;
    buffer: string;
    deadline: number;
    clearLineBeforeRelease?: boolean;
};

/**
 * Docker/runner recycle often appears to the browser as a shell exit 137
 * (SIGKILL) or 143 (SIGTERM). Treat those as recoverable infrastructure
 * events for the long-lived workspace terminal instead of leaving the learner
 * on a scary dead prompt.
 */
const TERMINAL_RECYCLE_EXIT_CODES = new Set([137, 143]);
const TERMINAL_RECYCLE_AUTORESTART_DELAY_MS = 900;
const TERMINAL_RECYCLE_AUTORESTART_COOLDOWN_MS = 30_000;

const MAX_PENDING_RECOVERY_INPUT_CHARS = 4096;
const WORKSPACE_READY_TIMEOUT_MS = 8_000;
const WORKSPACE_READY_POLL_MS = 150;
const terminalAutoStartAttempts = new Map<string, number>();

const CLIENT_UNMOUNT_CANCEL_GRACE_MS = 5_000;
const terminalUnmountCancelTimers = new Map<string, number>();
const terminalLeaseMountGenerations = new Map<string, number>();

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

function claimLeaseMountGeneration(workspaceKey: string) {
    const next = (terminalLeaseMountGenerations.get(workspaceKey) ?? 0) + 1;
    terminalLeaseMountGenerations.set(workspaceKey, next);
    return next;
}

function currentLeaseMountGeneration(workspaceKey: string) {
    return terminalLeaseMountGenerations.get(workspaceKey) ?? 0;
}

type OpenWorkspaceTerminalOptions = {
    userInitiated?: boolean;
};

export function shouldPrimeWorkspacePrompt(args: {
    sessionId: string | null;
    workspaceReady: boolean;
    terminalHasVisibleOutput: boolean;
    pendingStartupInput: string | null;
    stopping: boolean;
    restarting: boolean;
    terminalProcessExited: boolean;
}) {
    return Boolean(
        args.sessionId &&
        args.workspaceReady &&
        !args.terminalHasVisibleOutput &&
        !args.pendingStartupInput &&
        !args.stopping &&
        !args.restarting &&
        !args.terminalProcessExited,
    );
}

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


type WorkspaceSnapshotResponse =
    | { ok: true; files: WorkspaceSyncEntry[] }
    | { ok: false; error: string };

type WorkspaceReplaceResponse =
    | { ok: true; fileCount: number }
    | { ok: false; error: string };

function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeWorkspacePathForCompare(path: string) {
    return String(path ?? "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+/g, "/")
        .replace(/\/$/, "");
}

function workspaceSnapshotHasEntries(
    snapshotEntries: WorkspaceSyncEntry[],
    expectedEntries: WorkspaceSyncEntry[],
) {
    const snapshot = new Map(
        snapshotEntries.map((entry) => [
            normalizeWorkspacePathForCompare(entry.path),
            entry,
        ]),
    );

    return expectedEntries.every((expected) => {
        const expectedPath = normalizeWorkspacePathForCompare(expected.path);
        if (!expectedPath) return true;

        if ((expected as any).kind === "directory") {
            if (snapshot.has(expectedPath)) return true;

            const prefix = `${expectedPath}/`;
            return snapshotEntries.some((entry) =>
                normalizeWorkspacePathForCompare(entry.path).startsWith(prefix),
            );
        }

        const actual = snapshot.get(expectedPath);
        if (!actual) return false;

        if ((actual as any).kind === "directory") return false;

        return String((actual as any).content ?? "") ===
            String((expected as any).content ?? "");
    });
}

async function replaceWorkspaceForSession(
    sessionId: string,
    files: WorkspaceSyncEntry[],
) {
    if (!files.length) return;

    const res = await fetch(
        `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/replace`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ files }),
        },
    );

    const data = (await res.json().catch(() => null)) as WorkspaceReplaceResponse | null;

    if (!res.ok || !data?.ok) {
        throw new Error(
            data && "error" in data
                ? data.error
                : `Failed to prepare terminal workspace (${res.status})`,
        );
    }
}

async function snapshotWorkspaceForSession(sessionId: string) {
    const res = await fetch(
        `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/snapshot`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        },
    );

    const data = (await res.json().catch(() => null)) as WorkspaceSnapshotResponse | null;

    if (!res.ok || !data?.ok) {
        throw new Error(
            data && "error" in data
                ? data.error
                : `Failed to read terminal workspace (${res.status})`,
        );
    }

    return data.files;
}

export function resolveWorkspacePreparationEntries(
    entries: WorkspaceSyncEntry[],
): {
    replacementEntries: WorkspaceSyncEntry[];
    snapshotExpectedEntries: WorkspaceSyncEntry[];
} {
    const replacementEntries = entries.filter(
        (entry) => !isHiddenHistoryEntry(entry),
    );

    return {
        replacementEntries,
        snapshotExpectedEntries: replacementEntries.filter(
            (entry) => !isWorkspaceInternalPath(entry.path),
        ),
    };
}

async function ensureWorkspaceReadyForInput(args: {
    sessionId: string;
    files: WorkspaceSyncEntry[];
}) {
    const { replacementEntries, snapshotExpectedEntries } =
        resolveWorkspacePreparationEntries(args.files);

    if (!replacementEntries.length) return;

    // Push the complete authored workspace, including hidden bootstrap files.
    await replaceWorkspaceForSession(args.sessionId, replacementEntries);

    // Runner snapshots intentionally omit runtime-managed paths such as
    // `.zoeskoul/` and `.git/`. The completed replace request is sufficient
    // evidence for those files; poll only paths the snapshot API can return.
    if (!snapshotExpectedEntries.length) return;

    const deadline = Date.now() + WORKSPACE_READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const snapshot = await snapshotWorkspaceForSession(args.sessionId);

        if (workspaceSnapshotHasEntries(snapshot, snapshotExpectedEntries)) {
            return;
        }

        await sleep(WORKSPACE_READY_POLL_MS);
    }

    throw new Error("Terminal workspace did not finish preparing. Restart the terminal to try again.");
}


function isTooManySessionsMessage(message: string) {
    return /too many\s+(active\s+sessions|session\s+starts|sessions)/i.test(message);
}

function isTerminalStartContentionMessage(message: string) {
    return /terminal\s+is\s+(already|still)\s+starting/i.test(message);
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

function shellQuotePosix(value: string) {
    return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

function normalizeWorkspaceSetupScriptPath(value: string): string | null {
    const normalized = String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/{2,}/g, "/")
        .trim();

    if (!normalized || normalized.startsWith("/") || /[\r\n\0]/.test(normalized)) {
        return null;
    }

    const parts = normalized.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) {
        return null;
    }

    return normalized;
}

function normalizeGitSafeDirectory(value: string): string | null {
    const normalized = normalizePath(value).replace(/\/+/g, "/").replace(/\/$/, "");
    if (!normalized || /[\r\n\0]/.test(normalized)) return null;

    if (normalized !== "/workspace" && !normalized.startsWith("/workspace/")) {
        return null;
    }

    const relativeParts = normalized
        .slice("/workspace".length)
        .split("/")
        .filter(Boolean);

    if (relativeParts.some((part) => part === "." || part === "..")) {
        return null;
    }

    if (
        relativeParts.some(
            (part, index) =>
                part.includes("*") &&
                !(part === "*" && index === relativeParts.length - 1),
        )
    ) {
        return null;
    }

    if (relativeParts.some((part) => /[?\[\]]/.test(part))) {
        return null;
    }

    return normalized || "/workspace";
}

export function resolveWorkspaceTerminalStartupCwd(args: {
    cwd?: string | null;
    bootstrap?: WorkspaceTerminalConfig["bootstrap"];
}): string | null {
    const cwd = normalizePath(args.cwd ?? "") || "/workspace";
    const hasGitTrustBootstrap = (args.bootstrap?.gitSafeDirectories ?? []).some(
        (directory) => normalizeGitSafeDirectory(directory) != null,
    );
    const hasWorkspaceSetup =
        normalizeWorkspaceSetupScriptPath(
            String(args.bootstrap?.setupScriptPath ?? ""),
        ) != null;

    return cwd === "/workspace" && !hasGitTrustBootstrap && !hasWorkspaceSetup
        ? null
        : cwd;
}

function resolveGitSafeDirectoriesForShell(args: {
    cwd: string;
    bootstrap?: WorkspaceTerminalConfig["bootstrap"];
}): string[] {
    const cwd = normalizePath(args.cwd) || "/workspace";

    return Array.from(
        new Set(
            (args.bootstrap?.gitSafeDirectories ?? [])
                .map(normalizeGitSafeDirectory)
                .filter((value): value is string => Boolean(value))
                .map((directory) => {
                    if (!directory.endsWith("/*")) return directory;

                    const root = directory.slice(0, -2) || "/workspace";
                    return cwd === root || cwd.startsWith(`${root}/`) ? cwd : root;
                }),
        ),
    ).sort();
}

export function buildWorkspaceTerminalStartupInput(args: {
    cwd: string;
    bootstrap?: WorkspaceTerminalConfig["bootstrap"];
    markerParts: [string, string, string];
}): string {
    const cwd = normalizePath(args.cwd) || "/workspace";
    const setupScriptPath = normalizeWorkspaceSetupScriptPath(
        String(args.bootstrap?.setupScriptPath ?? ""),
    );
    const workspaceStateKey = String(
        args.bootstrap?.workspaceStateKey ?? "",
    ).trim();
    const gitSafeDirectories = resolveGitSafeDirectoriesForShell({
        cwd,
        bootstrap: args.bootstrap,
    });
    const gitTrustCommands =
        gitSafeDirectories.length > 0
            ? [
                `export GIT_CONFIG_COUNT=${gitSafeDirectories.length}`,
                ...gitSafeDirectories.flatMap((directory, index) => [
                    `export GIT_CONFIG_KEY_${index}='safe.directory'`,
                    `export GIT_CONFIG_VALUE_${index}=${shellQuotePosix(directory)}`,
                ]),
            ]
            : [];
    const [markerPartA, markerPartB, markerPartC] = args.markerParts;
    const successMarkerCommand = `printf '%s%s%s\\n' ${shellQuotePosix(markerPartA)} ${shellQuotePosix(markerPartB)} ${shellQuotePosix(markerPartC)}`;
    const failureMarkerCommand = `printf '%s%s%s%s\\n' ${shellQuotePosix(`${STARTUP_CWD_FAILED_MARKER}_`)} ${shellQuotePosix(markerPartA)} ${shellQuotePosix(markerPartB)} ${shellQuotePosix(markerPartC)}`;

    if (!setupScriptPath && gitTrustCommands.length === 0) {
        return [
            `cd -- ${shellQuotePosix(cwd)}`,
            "export PS1='[zoeskoul]\\w\\$ '",
            successMarkerCommand,
        ].join(" && ") + "\n";
    }

    const setupSignatureCommand = workspaceStateKey
        ? `__zoe_setup_signature=${shellQuotePosix(workspaceStateKey)}`
        : `__zoe_setup_signature=$(cksum "$__zoe_setup" | awk '{print $1 ":" $2}')`;
    const runSetupWhenNeeded = [
        'if [ "$__zoe_setup_signature" != "$__zoe_setup_completed" ]; then',
        'rm -f -- "$__zoe_setup_marker";',
        '(cd -- /workspace && /bin/bash "$__zoe_setup") >"$__zoe_setup_log" 2>&1 || __zoe_setup_status=$?;',
        'if [ "$__zoe_setup_status" -eq 0 ]; then printf "%s\\n" "$__zoe_setup_signature" >"$__zoe_setup_marker"; fi;',
        "fi",
    ].join(" ");
    const setupCondition = [
        'if [ ! -f "$__zoe_setup" ]; then',
        'printf "%s\\n" "The authored terminal setup file is missing." >"$__zoe_setup_log";',
        "__zoe_setup_status=66;",
        "else",
        `${setupSignatureCommand};`,
        '__zoe_setup_completed=$(cat "$__zoe_setup_marker" 2>/dev/null || true);',
        `${runSetupWhenNeeded};`,
        "fi",
    ].join(" ");
    const setupScript = setupScriptPath
        ? [
            `__zoe_setup=${shellQuotePosix(`/workspace/${setupScriptPath}`)}`,
            "__zoe_setup_marker='/workspace/.zoeskoul/.setup-complete'",
            "__zoe_setup_log='/workspace/.zoeskoul/setup.log'",
            "__zoe_setup_status=0",
            "mkdir -p -- '/workspace/.zoeskoul'",
            setupCondition,
        ].join("; ")
        : "__zoe_setup_log=''; __zoe_setup_status=0";
    const bootstrapEnvironment =
        gitTrustCommands.length > 0 ? gitTrustCommands.join(" && ") : ":";
    const prepareInteractiveShell = [
        `cd -- ${shellQuotePosix(cwd)}`,
        "export PS1='[zoeskoul]\\w\\$ '",
    ].join(" && ");
    const startupScript = [
        bootstrapEnvironment,
        setupScript,
        `if [ "$__zoe_setup_status" -eq 0 ]; then { ${prepareInteractiveShell}; } || __zoe_setup_status=$?; fi`,
        `if [ "$__zoe_setup_status" -eq 0 ]; then ${successMarkerCommand}; else ${failureMarkerCommand}; [ -n "$__zoe_setup_log" ] && [ -f "$__zoe_setup_log" ] && cat "$__zoe_setup_log" >&2; fi`,
        "unset __zoe_setup __zoe_setup_marker __zoe_setup_log __zoe_setup_signature __zoe_setup_completed __zoe_setup_status",
    ].join("; ");

    return ` ${startupScript}\n`;
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

export function mergeWorkspaceSnapshotBaseline(
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

        /**
         * The snapshot endpoint intentionally omits runtime control-plane paths.
         * Keep them in the local synchronization baseline so every subsequent
         * Enter does not look like a workspace mismatch and trigger another
         * replace cycle.
         */
        if (isWorkspaceInternalPath(entry.path)) {
            merged.set(entry.path, entry);
        }
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

async function cancelWorkspaceSessionSilently(sessionId: string): Promise<void> {
    try {
        await fetch(`/api/run/pty/sessions/${encodeURIComponent(sessionId)}/cancel`, {
            method: "POST",
        });
    } catch {
        // Best effort only. This cleanup runs when a controller unmounts mid-start.
    }
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
    const resolvedBootstrap = React.useMemo(
        () =>
            deriveManifestTerminalBootstrap({
                bootstrap: args.bootstrap,
                terminalCwd: args.cwd ?? "/workspace",
                files: normalizeEntries(args.initialFiles) ?? [],
            }),
        [args.bootstrap, args.cwd, args.initialFiles],
    );
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
    const [terminalEvidence, setTerminalEvidence] = React.useState<TerminalEvidence>(
        () => createTerminalEvidence(initialEvidenceCwd),
    );
    const terminalEvidenceRef = React.useRef<TerminalEvidence>(
        createTerminalEvidence(initialEvidenceCwd),
    );
    const setTerminalEvidenceNow = React.useCallback(
        (
            nextOrUpdater:
                | TerminalEvidence
                | ((previous: TerminalEvidence) => TerminalEvidence),
        ): TerminalEvidence => {
            const previous = terminalEvidenceRef.current;
            const next =
                typeof nextOrUpdater === "function"
                    ? nextOrUpdater(previous)
                    : nextOrUpdater;

            terminalEvidenceRef.current = next;
            setTerminalEvidence(next);

            return next;
        },
        [],
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
    const workspaceReadyRef = React.useRef(true);
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
    const recycleRestartTimerRef = React.useRef<number | null>(null);
    const startupCwdFlushTimerRef = React.useRef<number | null>(null);
    const promptPrimeTimerRef = React.useRef<number | null>(null);
    const promptPrimeAttemptsRef = React.useRef(0);
    const lastRecycleRestartAtRef = React.useRef(0);
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
    const pendingStartupInputRef = React.useRef<string | null>(null);
    const pendingStartupCwdRef = React.useRef<string | undefined>(undefined);
    const startupCwdOutputSuppressionRef = React.useRef<StartupCwdOutputSuppression | null>(null);
    const lastAuthoredCwdAppliedRef = React.useRef<string | undefined>(initialEvidenceCwd);
    const terminalHasVisibleOutputRef = React.useRef(false);
    const mountedRef = React.useRef(false);
    const leaseMountGenerationRef = React.useRef(0);

    React.useEffect(() => {
        mountedRef.current = true;
        leaseMountGenerationRef.current = claimLeaseMountGeneration(terminalLeaseKey);

        return () => {
            mountedRef.current = false;
            if (promptPrimeTimerRef.current != null) {
                window.clearTimeout(promptPrimeTimerRef.current);
                promptPrimeTimerRef.current = null;
            }
        };
    }, [terminalLeaseKey]);

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

        setTerminalEvidenceNow((prev) =>
            appendTerminalEvidenceCommand(prev, trimmed, currentCwdRef.current),
        );

        if (isPersistentHistoryClearCommand(trimmed)) {
            await persistHistoryContent("");
            return;
        }

        await appendHistoryLineNow(trimmed);
    }, [appendHistoryLineNow, persistHistoryContent, setTerminalEvidenceNow]);

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
        lastAuthoredCwdAppliedRef.current =
            initialEvidenceCwd && initialEvidenceCwd !== "/workspace"
                ? undefined
                : initialEvidenceCwd;
        setTerminalEvidenceNow(createTerminalEvidence(initialEvidenceCwd));
        void ensureHistoryLoaded();
    }, [ensureHistoryLoaded, initialEvidenceCwd, setTerminalEvidenceNow]);

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

    const clearPromptPrimeTimer = React.useCallback(() => {
        if (promptPrimeTimerRef.current != null) {
            window.clearTimeout(promptPrimeTimerRef.current);
            promptPrimeTimerRef.current = null;
        }
    }, []);

    const pushChunk = React.useCallback(
        (kind: TerminalChunk["kind"], data: string) => {
            if (!data) return;

            let outputKind = kind;
            const startupSuppression = startupCwdOutputSuppressionRef.current;
            if (startupSuppression && kind !== "sys") {
                const combined = startupSuppression.buffer + data;
                const successIndex = combined.indexOf(startupSuppression.marker);
                const failureIndex = combined.indexOf(
                    startupSuppression.failureMarker,
                );
                const failed =
                    failureIndex >= 0 &&
                    (successIndex < 0 || failureIndex <= successIndex);
                const markerIndex = failed ? failureIndex : successIndex;
                const matchedMarker = failed
                    ? startupSuppression.failureMarker
                    : startupSuppression.marker;

                if (markerIndex >= 0) {
                    startupCwdOutputSuppressionRef.current = null;
                    const shouldClearStalePrompt =
                        startupSuppression.clearLineBeforeRelease === true;
                    data = combined.slice(markerIndex + matchedMarker.length);
                    data = data.replace(/^(?:\r?\n)+/, "");

                    if (shouldClearStalePrompt) {
                        const clearPromptChunk: TerminalChunk = {
                            id: nextChunkIdRef.current++,
                            kind: "pty",
                            data: "\r\x1b[2K",
                        };
                        setTerminalFeed((prev) => {
                            const next = [...prev, clearPromptChunk];
                            terminalFeedRef.current = next;
                            return next;
                        });
                    }

                    if (failed) {
                        const message =
                            "Terminal workspace setup failed. Restart the terminal to try again.";
                        recoverStateRef.current = "restart_available";
                        setRecoverState("restart_available");
                        setRecoverMessage(message);
                        setInputEnabled(false);
                        setBusy(false);
                        outputKind = "err";
                        data = data.trim()
                            ? `\r\n${message}\r\n${data}`
                            : `\r\n${message}\r\n`;
                    } else {
                        setInputEnabled(true);
                    }

                    if (!data) {
                        terminalHasVisibleOutputRef.current = true;
                        clearPromptPrimeTimer();
                        return;
                    }
                } else if (Date.now() <= startupSuppression.deadline) {
                    startupCwdOutputSuppressionRef.current = {
                        ...startupSuppression,
                        buffer: combined.slice(-16_384),
                    };
                    return;
                } else {
                    startupCwdOutputSuppressionRef.current = null;
                    const message =
                        "Terminal workspace setup timed out. Restart the terminal to try again.";
                    recoverStateRef.current = "restart_available";
                    setRecoverState("restart_available");
                    setRecoverMessage(message);
                    setInputEnabled(false);
                    setBusy(false);
                    outputKind = "err";
                    data = `\r\n${message}\r\n`;
                }
            }

            terminalHasVisibleOutputRef.current = true;
            clearPromptPrimeTimer();

            setTerminalEvidenceNow((prev) => appendTerminalEvidenceOutput(prev, data));
            setTerminalFeed((prev) => {
                const next = [
                    ...prev,
                    { id: nextChunkIdRef.current++, kind: outputKind, data },
                ];
                terminalFeedRef.current = next;
                return next;
            });
        },
        [clearPromptPrimeTimer, setTerminalEvidenceNow],
    );

    const clearQuietTimer = React.useCallback(() => {
        if (quietTimerRef.current != null) {
            window.clearTimeout(quietTimerRef.current);
            quietTimerRef.current = null;
        }
    }, []);

    const schedulePromptPrime = React.useCallback(
        (delayMs = TERMINAL_PROMPT_PRIME_DELAY_MS) => {
            if (
                !shouldPrimeWorkspacePrompt({
                    sessionId: sessionIdRef.current,
                    workspaceReady: workspaceReadyRef.current,
                    terminalHasVisibleOutput: terminalHasVisibleOutputRef.current,
                    pendingStartupInput: pendingStartupInputRef.current,
                    stopping: stoppingRef.current,
                    restarting: restartingRef.current,
                    terminalProcessExited: terminalProcessExitedRef.current,
                })
            ) {
                clearPromptPrimeTimer();
                return;
            }

            if (promptPrimeAttemptsRef.current >= TERMINAL_PROMPT_PRIME_MAX_ATTEMPTS) {
                clearPromptPrimeTimer();
                return;
            }

            clearPromptPrimeTimer();
            promptPrimeTimerRef.current = window.setTimeout(() => {
                promptPrimeTimerRef.current = null;

                if (
                    !shouldPrimeWorkspacePrompt({
                        sessionId: sessionIdRef.current,
                        workspaceReady: workspaceReadyRef.current,
                        terminalHasVisibleOutput: terminalHasVisibleOutputRef.current,
                        pendingStartupInput: pendingStartupInputRef.current,
                        stopping: stoppingRef.current,
                        restarting: restartingRef.current,
                        terminalProcessExited: terminalProcessExitedRef.current,
                    })
                ) {
                    return;
                }

                promptPrimeAttemptsRef.current += 1;

                void sendInput("\n").catch(() => {
                    schedulePromptPrime(Math.min(delayMs + 250, 1400));
                });
            }, delayMs);
        },
        [clearPromptPrimeTimer, sendInput],
    );

    const clearStaleStartingTimer = React.useCallback(() => {
        if (staleStartingTimerRef.current != null) {
            window.clearTimeout(staleStartingTimerRef.current);
            staleStartingTimerRef.current = null;
        }
    }, []);

    const clearRecycleRestartTimer = React.useCallback(() => {
        if (recycleRestartTimerRef.current != null) {
            window.clearTimeout(recycleRestartTimerRef.current);
            recycleRestartTimerRef.current = null;
        }
    }, []);

    const clearStartupCwdFlushTimer = React.useCallback(() => {
        if (startupCwdFlushTimerRef.current != null) {
            window.clearTimeout(startupCwdFlushTimerRef.current);
            startupCwdFlushTimerRef.current = null;
        }
    }, []);

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
        clearRecycleRestartTimer();
        clearPromptPrimeTimer();
        clearStartupCwdFlushTimer();
        pendingInputLineRef.current = "";
        escapeSequenceRef.current = "";
        terminalProcessExitedRef.current = false;
        terminalExitCodeRef.current = null;
        terminalHasVisibleOutputRef.current = false;
        promptPrimeAttemptsRef.current = 0;
        pendingStartupInputRef.current = null;
        pendingStartupCwdRef.current = undefined;
        startupCwdOutputSuppressionRef.current = null;
        startedRef.current = false;
        startingRef.current = false;
        stateRef.current = "idle";
        currentCwdRef.current = initialEvidenceCwd;
        lastAuthoredCwdAppliedRef.current =
            initialEvidenceCwd && initialEvidenceCwd !== "/workspace"
                ? undefined
                : initialEvidenceCwd;
        terminalFeedRef.current = [];
        setTerminalFeed([]);
        setTerminalEvidenceNow(createTerminalEvidence(initialEvidenceCwd));
        setInputEnabled(false);
        setBusy(false);
        setState("idle");
        setStarted(false);
        setStarting(false);
        setSyncStatus("idle");
        clearTerminalRecovery();
        setRestarting(false);
        setStopping(false);
    }, [
        clearRecycleRestartTimer,
        clearPromptPrimeTimer,
        clearStartupCwdFlushTimer,
        clearTerminalRecovery,
        initialEvidenceCwd,
        setTerminalEvidenceNow,
    ]);

    const reset = React.useCallback(() => {
        clearQuietTimer();
        clearStaleStartingTimer();
        clearRecycleRestartTimer();
        void cancel().catch(() => {});
        closeSocket();
        clearLocalTerminalState();
    }, [cancel, clearLocalTerminalState, clearQuietTimer, clearRecycleRestartTimer, clearStaleStartingTimer, closeSocket]);

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

            const nextBaseline = mergeWorkspaceSnapshotBaseline(
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

    const flushPendingStartupInput = React.useCallback(async (): Promise<void> => {
        const pending = pendingStartupInputRef.current;
        if (!pending) return;

        const nextCwd = pendingStartupCwdRef.current;
        pendingStartupInputRef.current = null;
        pendingStartupCwdRef.current = undefined;
        clearStartupCwdFlushTimer();
        await sendInput(pending);

        if (nextCwd) {
            currentCwdRef.current = nextCwd;
            lastAuthoredCwdAppliedRef.current = nextCwd;
            setTerminalEvidenceNow((prev) => ({
                ...prev,
                cwd: nextCwd,
            }));
        }

        if (
            mountedRef.current &&
            sessionIdRef.current &&
            !stoppingRef.current &&
            !restartingRef.current &&
            !terminalProcessExitedRef.current &&
            !startupCwdOutputSuppressionRef.current &&
            recoverStateRef.current === "none"
        ) {
            setInputEnabled(true);
            schedulePromptPrime();
        }
    }, [clearStartupCwdFlushTimer, schedulePromptPrime, sendInput, setTerminalEvidenceNow]);

    const scheduleStartupCwdFlush = React.useCallback(
        (delayMs = 175): void => {
            if (!pendingStartupInputRef.current) return;
            clearStartupCwdFlushTimer();

            startupCwdFlushTimerRef.current = window.setTimeout(() => {
                startupCwdFlushTimerRef.current = null;

                if (!pendingStartupInputRef.current) return;

                if (
                    !sessionIdRef.current ||
                    !workspaceReadyRef.current ||
                    terminalProcessExitedRef.current ||
                    stoppingRef.current ||
                    restartingRef.current
                ) {
                    scheduleStartupCwdFlush(Math.min(delayMs + 150, 900));
                    return;
                }

                void flushPendingStartupInput();
            }, delayMs);
        },
        [clearStartupCwdFlushTimer, flushPendingStartupInput],
    );

    const queueAuthoredCwd = React.useCallback(
        (cwd: string) => {
            const normalizedCwd = resolveWorkspaceTerminalStartupCwd({
                cwd,
                bootstrap: resolvedBootstrap,
            });
            if (!normalizedCwd) return;

            const startupMarker = `${STARTUP_CWD_READY_MARKER}_${Date.now().toString(36)}_${Math.random()
                .toString(36)
                .slice(2)}`;

            const markerPartA = startupMarker.slice(0, Math.ceil(startupMarker.length / 3));
            const markerPartB = startupMarker.slice(
                markerPartA.length,
                Math.ceil((startupMarker.length * 2) / 3),
            );
            const markerPartC = startupMarker.slice(markerPartA.length + markerPartB.length);

            startupCwdOutputSuppressionRef.current = {
                marker: startupMarker,
                failureMarker: `${STARTUP_CWD_FAILED_MARKER}_${startupMarker}`,
                buffer: "",
                deadline: Date.now() + STARTUP_CWD_OUTPUT_SUPPRESSION_MS,
                clearLineBeforeRelease: true,
            };
            pendingStartupInputRef.current = buildWorkspaceTerminalStartupInput({
                cwd: normalizedCwd,
                bootstrap: resolvedBootstrap,
                markerParts: [markerPartA, markerPartB, markerPartC],
            });
            pendingStartupCwdRef.current = normalizedCwd;

            if (
                sessionIdRef.current &&
                workspaceReadyRef.current &&
                !terminalProcessExitedRef.current &&
                !stoppingRef.current &&
                !restartingRef.current &&
                interactiveReadyRef.current
            ) {
                setInputEnabled(false);
                void flushPendingStartupInput();
                return;
            }

            scheduleStartupCwdFlush();
        },
        [resolvedBootstrap, flushPendingStartupInput, scheduleStartupCwdFlush],
    );

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
                const attemptLeaseGeneration = leaseMountGenerationRef.current;
                const visibleEntries = getWorkspaceEntries();
                const historyContent = await ensureHistoryLoaded();
                const fullEntries = augmentEntriesWithHistory(visibleEntries, historyContent);

                workspaceReadyRef.current = fullEntries.length === 0;

                lastHandledSeqRef.current = 0;
                nextChunkIdRef.current = 1;
                awaitingPostEnterSnapshotRef.current = false;
                pendingInputLineRef.current = "";
                escapeSequenceRef.current = "";
                terminalProcessExitedRef.current = false;
                terminalExitCodeRef.current = null;
                terminalHasVisibleOutputRef.current = false;
                promptPrimeAttemptsRef.current = 0;
                terminalFeedRef.current = [];
                setTerminalFeed([]);
                setInputEnabled(false);
                setBusy(true);
                stateRef.current = "preparing";
                startingRef.current = true;
                startedRef.current = false;
                setState("preparing");
                setStarting(true);
                setSyncStatus("idle");
                clearTerminalRecovery();
                clearPromptPrimeTimer();
                clearStaleStartingTimer();

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

                const normalizedInitialCwd = resolveWorkspaceTerminalStartupCwd({
                    cwd: args.cwd,
                    bootstrap: resolvedBootstrap,
                });
                if (normalizedInitialCwd) {
                    queueAuthoredCwd(normalizedInitialCwd);
                }

                try {
                    openedLeaseKeyRef.current = terminalLeaseKey;

                    const startRequest = {
                        kind: "shell",
                        mode: "interactive",
                        language: "bash",
                        projectId: args.projectId,
                        cwd: args.cwd,
                        workspaceKey: terminalLeaseKey,
                        ...(fullEntries.length ? { files: fullEntries as any } : {}),
                    } as any;

                    let nextSessionId: string | null = null;

                    for (let attempt = 0; attempt <= CLIENT_START_CONTENTION_RETRY_ATTEMPTS; attempt += 1) {
                        try {
                            nextSessionId = await start(startRequest);
                            break;
                        } catch (error: any) {
                            const message = error?.message ?? String(error ?? "");

                            if (
                                attempt < CLIENT_START_CONTENTION_RETRY_ATTEMPTS &&
                                isTerminalStartContentionMessage(message)
                            ) {
                                await sleep(CLIENT_START_CONTENTION_RETRY_DELAY_MS * (attempt + 1));
                                continue;
                            }

                            throw error;
                        }
                    }

                    if (!nextSessionId) {
                        throw new Error("Terminal session did not finish starting. Restart the terminal to try again.");
                    }

                    const newerLeaseOwnerMounted =
                        currentLeaseMountGeneration(terminalLeaseKey) !== attemptLeaseGeneration;
                    if (!mountedRef.current || newerLeaseOwnerMounted) {
                        /**
                         * React can unmount this controller while an automatic terminal
                         * start is still in flight. If no newer controller for the same
                         * lease mounted, cancel the orphan session immediately so it does
                         * not count against the runner limit.
                         */
                        if (!newerLeaseOwnerMounted) {
                            await cancelWorkspaceSessionSilently(nextSessionId);
                        }
                        return;
                    }

                    await ensureWorkspaceReadyForInput({
                        sessionId: nextSessionId,
                        files: fullEntries,
                    });

                    if (
                        !mountedRef.current ||
                        currentLeaseMountGeneration(terminalLeaseKey) !== attemptLeaseGeneration
                    ) {
                        return;
                    }

                    const normalizedStartCwd = resolveWorkspaceTerminalStartupCwd({
                        cwd: args.cwd,
                        bootstrap: resolvedBootstrap,
                    });
                    if (
                        normalizedStartCwd &&
                        pendingStartupCwdRef.current !== normalizedStartCwd &&
                        lastAuthoredCwdAppliedRef.current !== normalizedStartCwd
                    ) {
                        /**
                         * The runner starts the shell before the synced workspace is
                         * guaranteed to exist, and some PTY backends can drop input
                         * that arrives before the shell reaches its interactive
                         * state. Queue the authored startup cd and flush it only
                         * after the terminal is ready.
                         */
                        queueAuthoredCwd(normalizedStartCwd);
                    }

                    workspaceReadyRef.current = true;
                    scheduleStartupCwdFlush();
                    lastPushedEntriesRef.current = visibleEntries;
                    startedRef.current = true;
                    releaseAutomaticTerminalStart(terminalLeaseKey);
                    setStarted(true);

                    const latestTerminalState = stateRef.current as string;
                    if (
                        latestTerminalState === "running" ||
                        latestTerminalState === "waiting_for_input"
                    ) {
                        if (pendingStartupInputRef.current) {
                            setInputEnabled(false);
                            await flushPendingStartupInput();
                        } else {
                            setInputEnabled(true);
                            schedulePromptPrime();
                        }
                    }
                } catch (e: any) {
                    const message = e?.message ?? "Failed to start workspace terminal.";
                    const tooManySessions = isTooManySessionsMessage(message);
                    pendingStartupInputRef.current = null;
                    pendingStartupCwdRef.current = undefined;
                    startupCwdOutputSuppressionRef.current = null;

                        pushChunk("err", `${message}\r\n`);
                    setTerminalRecovery(normalizeRecoverableTerminalError(message));

                    if (tooManySessions) {
                        pendingRecoveryInputRef.current = "";
                    }
                    if (!tooManySessions) {
                        releaseAutomaticTerminalStart(terminalLeaseKey);
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
                     * which causes runner session-start rate limiting.
                     */
                    return;
                } finally {
                    clearStaleStartingTimer();
                    startingRef.current = false;
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
            clearTerminalRecovery,
            flushPendingStartupInput,
            scheduleStartupCwdFlush,
            queueAuthoredCwd,
            setTerminalRecovery,
            setTerminalEvidenceNow,
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
            clearRecycleRestartTimer();
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
                 * This is automatic recovery, not an explicit learner click.
                 * It must respect normal start-rate guards so one blocked start
                 * does not fan out into repeated /sessions/start attempts.
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
        clearRecycleRestartTimer();
        clearStartupCwdFlushTimer();
        clearTerminalRecovery();
        openInFlightRef.current = null;
        pendingInputLineRef.current = "";
        escapeSequenceRef.current = "";
        pendingStartupInputRef.current = null;
        pendingStartupCwdRef.current = undefined;
        terminalProcessExitedRef.current = false;
        terminalExitCodeRef.current = null;
        workspaceReadyRef.current = false;
        stateRef.current = "idle";
        startedRef.current = false;
        startingRef.current = false;
        releaseAutomaticTerminalStart(previousLeaseKey);
        releaseAutomaticTerminalStart(terminalLeaseKey);
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
    }, [terminalLeaseKey, cancel, clearQuietTimer, clearRecycleRestartTimer, clearStartupCwdFlushTimer, clearStaleStartingTimer, clearTerminalRecovery, closeSocket]);

    React.useEffect(() => {
        const desiredCwd = resolveWorkspaceTerminalStartupCwd({
            cwd: args.cwd,
            bootstrap: resolvedBootstrap,
        });
        if (!desiredCwd) {
            return;
        }

        if (lastAuthoredCwdAppliedRef.current === desiredCwd) {
            return;
        }

        if (desiredCwd && lastAuthoredCwdAppliedRef.current !== desiredCwd) {
            setInputEnabled(false);
        }

        if (pendingStartupCwdRef.current === desiredCwd) {
            scheduleStartupCwdFlush(125);
            return;
        }

        if (
            !sessionIdRef.current ||
            !openedLeaseKeyRef.current ||
            openedLeaseKeyRef.current !== terminalLeaseKey ||
            startingRef.current ||
            stoppingRef.current ||
            restartingRef.current ||
            terminalProcessExitedRef.current ||
            isFinalSessionState(stateRef.current)
        ) {
            return;
        }

        queueAuthoredCwd(desiredCwd);
    }, [
        resolvedBootstrap,
        args.cwd,
        queueAuthoredCwd,
        scheduleStartupCwdFlush,
        terminalLeaseKey,
    ]);

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
            pendingStartupInputRef.current = null;
            pendingStartupCwdRef.current = undefined;
            openedLeaseKeyRef.current = null;
            clearQuietTimer();
            clearStaleStartingTimer();
            clearRecycleRestartTimer();
            closeSocket();
        };
    }, [clearQuietTimer, clearRecycleRestartTimer, clearStaleStartingTimer, closeSocket]);
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

                    const pending = pendingRecoveryInputRef.current;
                    pendingRecoveryInputRef.current = "";

                    if (pending) {
                        void sendInput(pending).catch(() => {
                            pendingRecoveryInputRef.current = (
                                pending + pendingRecoveryInputRef.current
                            ).slice(-MAX_PENDING_RECOVERY_INPUT_CHARS);
                        });
                    }

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
                recoverStateRef.current === "blocked_too_many_sessions" ||
                !workspaceReadyRef.current
            ) {
                return;
            }

            const socketLooksStale =
                lastMessageAt != null &&
                Date.now() - lastMessageAt > TERMINAL_INPUT_STALE_MS;

            if (
                recoverStateRef.current !== "none" ||
                restarting ||
                stopping ||
                !sessionId ||
                !inputEnabled ||
                socketReadyState !== SOCKET_OPEN_READY_STATE ||
                socketLooksStale
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
            lastMessageAt,
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

    const scheduleRestartAfterRunnerRecycle = React.useCallback(
        (exitCode: number) => {
            if (!args.enabled) return false;
            if (!TERMINAL_RECYCLE_EXIT_CODES.has(exitCode)) return false;
            if (stoppingRef.current || restartingRef.current) return false;
            if (recycleRestartTimerRef.current != null) return true;

            const now = Date.now();
            if (
                now - lastRecycleRestartAtRef.current <
                TERMINAL_RECYCLE_AUTORESTART_COOLDOWN_MS
            ) {
                return false;
            }

            lastRecycleRestartAtRef.current = now;
            setTerminalRecovery({
                state: "starting",
                message: "Terminal session was recycled by the runner. Reopening it now…",
            });

            recycleRestartTimerRef.current = window.setTimeout(() => {
                recycleRestartTimerRef.current = null;

                void (async () => {
                    if (!args.enabled) return;
                    if (stoppingRef.current || restartingRef.current) return;

                    openInFlightRef.current = null;
                    releaseAutomaticTerminalStart(terminalLeaseKey);
                    await open();
                })().catch((error: any) => {
                    setTerminalRecovery({
                        state: "restart_available",
                        message:
                            error?.message ??
                            "Terminal session closed. Restart the terminal to continue.",
                    });
                });
            }, TERMINAL_RECYCLE_AUTORESTART_DELAY_MS);

            return true;
        },
        [args.enabled, open, setTerminalRecovery, terminalLeaseKey],
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
                    const canAcceptInput =
                        workspaceReadyRef.current && !pendingStartupInputRef.current;
                    setInputEnabled(canAcceptInput);
                    setStarted(true);
                    setStarting(false);

                    if (workspaceReadyRef.current) {
                        void flushPendingStartupInput();
                        scheduleStartupCwdFlush(125);
                    }

                    if (canAcceptInput) {
                        schedulePromptPrime();
                    }


                    if (awaitingPostEnterSnapshotRef.current) {
                        schedulePostEnterSnapshot(450);
                    }
                    continue;
                }

                if (isFinalSessionState(ev.state)) {
                    terminalProcessExitedRef.current = true;
                    terminalExitCodeRef.current = null;
                    pendingRecoveryInputRef.current = "";
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
                const canAcceptInput = !pendingStartupInputRef.current;
                setInputEnabled(canAcceptInput);
                setStarted(true);
                setStarting(false);

                if (workspaceReadyRef.current) {
                    void flushPendingStartupInput();
                    scheduleStartupCwdFlush(125);
                }

                if (canAcceptInput) {
                    schedulePromptPrime();
                }

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(250);
                }
                continue;
            }

            if (ev.type === "compile_error") {
                terminalProcessExitedRef.current = true;
                terminalExitCodeRef.current = null;
                pendingRecoveryInputRef.current = "";
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
                pushChunk("sys", `\r\n[process exited with code ${ev.code}]\r\n`);
                setBusy(false);
                setInputEnabled(false);
                setStarted(false);
                openInFlightRef.current = null;

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }

                if (scheduleRestartAfterRunnerRecycle(ev.code)) {
                    continue;
                }

                setTerminalRecovery({
                    state: "restart_available",
                    message: "Terminal session closed. Restart the terminal to continue.",
                });
                continue;
            }

            if (ev.type === "error") {
                const staleRunnerSession = isStaleRunnerSessionMessage(ev.message);

                if (staleRunnerSession) {
                    terminalProcessExitedRef.current = true;
                    terminalExitCodeRef.current = null;
                    pendingRecoveryInputRef.current = "";
                }

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
    }, [
        events,
        pushChunk,
        schedulePostEnterSnapshot,
        flushPendingStartupInput,
        schedulePromptPrime,
        scheduleStartupCwdFlush,
        clearStaleStartingTimer,
        scheduleRestartAfterRunnerRecycle,
        setTerminalRecovery,
    ]);

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
        disconnectReason,
        setTerminalRecovery,
    ]);

    React.useEffect(() => {
        return () => {
            clearQuietTimer();
            clearStaleStartingTimer();
            clearRecycleRestartTimer();
            clearStartupCwdFlushTimer();
        };
    }, [clearQuietTimer, clearRecycleRestartTimer, clearStartupCwdFlushTimer, clearStaleStartingTimer]);

    const getTerminalEvidenceNow = React.useCallback((): TerminalEvidence => {
        const pendingCommand = pendingInputLineRef.current.trim();

        if (!pendingCommand) {
            return terminalEvidenceRef.current;
        }

        return appendTerminalEvidenceCommand(
            terminalEvidenceRef.current,
            pendingCommand,
            currentCwdRef.current,
        );
    }, []);


    React.useEffect(() => {
        if (!args.enabled || typeof window === "undefined") return;

        const shouldSkipRevive = () =>
            stoppingRef.current ||
            restartingRef.current ||
            terminalProcessExitedRef.current ||
            recoverStateRef.current === "restart_available" ||
            recoverStateRef.current === "blocked_too_many_sessions";

        const reviveIfStale = () => {
            if (
                typeof document !== "undefined" &&
                document.visibilityState === "hidden"
            ) {
                return;
            }

            if (shouldSkipRevive()) return;

            const hasSession = Boolean(sessionIdRef.current);
            const socketClosed =
                hasSession &&
                socketReadyState !== null &&
                socketReadyState !== SOCKET_OPEN_READY_STATE;

            const socketStale =
                hasSession &&
                lastMessageAt != null &&
                Date.now() - lastMessageAt > TERMINAL_AUTO_REVIVE_STALE_MS;

            if (socketClosed || socketStale) {
                void recoverTerminalAfterInactiveInput();
            }
        };

        const timer = window.setInterval(
            reviveIfStale,
            TERMINAL_REVIVE_WATCHDOG_INTERVAL_MS,
        );

        window.addEventListener("focus", reviveIfStale);
        window.addEventListener("pageshow", reviveIfStale);
        window.addEventListener("online", reviveIfStale);

        reviveIfStale();

        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", reviveIfStale);
            window.removeEventListener("pageshow", reviveIfStale);
            window.removeEventListener("online", reviveIfStale);
        };
    }, [
        args.enabled,
        lastMessageAt,
        recoverTerminalAfterInactiveInput,
        socketReadyState,
    ]);


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
        getTerminalEvidenceNow,
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
