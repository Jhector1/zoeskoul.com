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
    WorkspaceExplorerExecutorV6,
} from "@zoeskoul/learner-workspace/runner/runtime";
import {
    appendTerminalEvidenceCommand,
    appendTerminalEvidenceOutput,
    createDisconnectedTerminalRecovery,
    createTerminalEvidence,
    isTerminalActuallyInteractive,
    reuseInFlightPromise,
    shouldProbeTerminalOnVisibilityRestore,
} from "@zoeskoul/learner-workspace/runner/runtime";
import { isWorkspaceInternalPath } from "@zoeskoul/learner-workspace/lib/projects/workspaceInternalPaths";
import {
    normalizeWorkspaceSyncEntry,
    normalizeWorkspaceSyncPath,
    sortWorkspaceSyncEntries,
    workspaceSyncEntriesEqual,
    workspaceSyncEntryValue,
} from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";

import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";
import { pushWorkspaceFileDeltaV6 } from "./workspaceFileDeltaSyncV6";
import { V6AcknowledgedEditJournal } from "./v6AcknowledgedEditJournal";
import { verifyV6StartupSnapshot } from "./v6StartupSnapshotGuard";
import { WorkspaceStructuralActionsV6 } from "./workspaceFileStructuralActionsV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import { restoreDeletedWorkspaceFileV6, replaceHistoryWorkspaceFileV6 } from "./workspaceFileHistoryRestoreV6";
import { isBinaryWorkspaceEntry } from "@zoeskoul/learner-workspace/lib/ide/workspaceFileContent";
import { assertWorkspaceRelativePath, resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";

import { useRunSession } from "@zoeskoul/learner-workspace/runner/useRunSession";
import {
    deleteTerminalHistory,
    getTerminalHistory,
    putTerminalHistory,
} from "@zoeskoul/learner-workspace/runner/hooks/pty/terminalHistory.idb";

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
const useBrowserLayoutEffect =
    typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

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

export type WorkspaceTerminalOwnerSnapshot = {
    terminalFeed: TerminalChunk[];
    terminalEvidence: TerminalEvidence;
    lastHandledSeq: number;
    nextChunkId: number;
    currentCwd?: string;
    lastAuthoredCwdApplied?: string;
    pendingInputLine: string;
    escapeSequence: string;
    terminalHasVisibleOutput: boolean;
};

export function cloneWorkspaceTerminalOwnerSnapshot(
    snapshot: WorkspaceTerminalOwnerSnapshot,
): WorkspaceTerminalOwnerSnapshot {
    return {
        ...snapshot,
        terminalFeed: snapshot.terminalFeed.map((chunk) => ({ ...chunk })),
        terminalEvidence: {
            ...snapshot.terminalEvidence,
            commands: [...snapshot.terminalEvidence.commands],
        },
    };
}

export function resolveInitialWorkspaceTerminalCwd(args: {
    normalizedCwd: string | null;
    hasPreservedOwnerState: boolean;
}): string | null {
    return args.hasPreservedOwnerState ? null : args.normalizedCwd;
}

export function shouldEnableWorkspaceTerminalInput(args: {
    state: RunSessionState | "idle";
    workspaceReady: boolean;
    pendingStartupInput: string | null;
}): boolean {
    return Boolean(
        args.workspaceReady &&
            !args.pendingStartupInput &&
            (args.state === "running" || args.state === "waiting_for_input"),
    );
}

/**
 * A controller may render for the next tab before useRunSession has connected
 * that tab's socket. Never let the previous owner's stdout/status replay mutate
 * the newly selected terminal.
 */
export function shouldConsumeWorkspaceTerminalEventStream(args: {
    terminalOwnerKey: string;
    currentSessionId: string | null;
    eventsSessionId: string | null;
    eventsOwnerKey: string | null;
}): boolean {
    return Boolean(
        args.currentSessionId &&
            args.eventsSessionId === args.currentSessionId &&
            args.eventsOwnerKey === args.terminalOwnerKey,
    );
}

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

function clearScheduledUnmountCancelsForSession(sessionId: string) {
    for (const key of terminalUnmountCancelTimers.keys()) {
        if (key.endsWith(`::${sessionId}`)) {
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
    throwOnFailure?: boolean;
};

export async function settleWorkspaceTerminalOpenForCaller(
    promise: Promise<void>,
    throwOnFailure: boolean,
): Promise<void> {
    if (throwOnFailure) {
        return await promise;
    }

    try {
        await promise;
    } catch {
        // The controller already exposes the recovery state and message. Passive
        // auto-open callers stay quiet, but explicit tab activation can await the
        // same canonical promise and receive its rejection.
    }
}

export function shouldPrimeWorkspacePrompt(args: {
    sessionId: string | null;
    workspaceReady: boolean;
    terminalHasVisibleOutput: boolean;
    pendingStartupInput: string | null;
    startupOutputSuppressed: boolean;
    stopping: boolean;
    restarting: boolean;
    terminalProcessExited: boolean;
}) {
    return Boolean(
        args.sessionId &&
        args.workspaceReady &&
        !args.terminalHasVisibleOutput &&
        !args.pendingStartupInput &&
        !args.startupOutputSuppressed &&
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

function isActiveSessionCapacityMessage(message: string) {
    return /too many\s+active\s+sessions|active\s+session\s+limit/i.test(message);
}

function isStartRateLimitMessage(message: string) {
    return /too many\s+(session\s+starts|terminal\s+starts|start\s+attempts)/i.test(message);
}

function isTooManySessionsMessage(message: string) {
    return isActiveSessionCapacityMessage(message) || isStartRateLimitMessage(message);
}

function isTerminalStartContentionMessage(message: string) {
    return /terminal\s+is\s+(already|still)\s+starting/i.test(message);
}

function isStaleRunnerSessionMessage(message: string) {
    return /no such container|no such session|session not found|forbidden/i.test(message);
}

export function normalizeRecoverableTerminalError(message: string): TerminalRecovery {
    const text = String(message ?? "").trim() || "Terminal session stopped.";

    if (isActiveSessionCapacityMessage(text)) {
        const limit = text.match(/limit\s+is\s+(\d+)/i)?.[1];
        return {
            state: "blocked_too_many_sessions",
            message: limit
                ? `Terminal limit reached (${limit}). Close another terminal, then try again.`
                : "Terminal limit reached. Close another terminal, then try again.",
        };
    }

    if (isStartRateLimitMessage(text)) {
        return {
            state: "blocked_too_many_sessions",
            message: "Too many terminal start attempts. Wait a moment, then restart once.",
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
        return files.map(normalizeWorkspaceSyncEntry);
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
    enableLsColors?: boolean;
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

    return cwd === "/workspace" && !hasGitTrustBootstrap && !hasWorkspaceSetup &&
        !args.enableLsColors
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
    enableLsColors?: boolean;
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
    // Only the interactive GNU ls command changes: no profile files, PATH
    // overrides, or colorization of script/non-interactive command output.
    const lsColorStartup = args.enableLsColors
        ? "if command ls --color=auto -d / >/dev/null 2>&1; then alias ls='ls --color=auto'; fi"
        : null;
    const [markerPartA, markerPartB, markerPartC] = args.markerParts;
    const successMarkerCommand = `printf '%s%s%s\\n' ${shellQuotePosix(markerPartA)} ${shellQuotePosix(markerPartB)} ${shellQuotePosix(markerPartC)}`;
    const failureMarkerCommand = `printf '%s%s%s%s\\n' ${shellQuotePosix(`${STARTUP_CWD_FAILED_MARKER}_`)} ${shellQuotePosix(markerPartA)} ${shellQuotePosix(markerPartB)} ${shellQuotePosix(markerPartC)}`;

    if (!setupScriptPath && gitTrustCommands.length === 0) {
        return [
            `cd -- ${shellQuotePosix(cwd)}`,
            "export PS1='[zoeskoul]\\w\\$ '",
            ...(lsColorStartup ? [lsColorStartup] : []),
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
        ...(lsColorStartup ? [lsColorStartup] : []),
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
    return sortWorkspaceSyncEntries(entries);
}

function entriesEqual(a: WorkspaceSyncEntry[], b: WorkspaceSyncEntry[]) {
    return workspaceSyncEntriesEqual(a, b);
}

function diffDirtyUiPaths(
    currentUiEntries: WorkspaceSyncEntry[],
    baselineEntries: WorkspaceSyncEntry[],
) {
    const out = new Set<string>();

    const current = new Map(
        sortEntries(currentUiEntries).map((entry) => [
            entry.path,
            workspaceSyncEntryValue(entry),
        ]),
    );

    const baseline = new Map(
        sortEntries(baselineEntries).map((entry) => [
            entry.path,
            workspaceSyncEntryValue(entry),
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
        eventsSessionId,
        eventsOwnerKey,
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
    const terminalHostKey = React.useMemo(() => {
        const explicit = String(args.terminalHostKey ?? "").trim();
        if (explicit) return explicit;

        return `terminal-host:${args.projectId ?? args.historyScopeKey ?? "lesson"}`;
    }, [args.terminalHostKey, args.projectId, args.historyScopeKey]);
    const terminalOwnerKey = React.useMemo(() => {
        const explicit = String(args.terminalOwnerKey ?? "").trim();
        if (explicit) return explicit;

        return `${terminalHostKey}:owner:primary`;
    }, [args.terminalOwnerKey, terminalHostKey]);
    const terminalStartClaimKey = `${terminalOwnerKey}::${terminalLeaseKey}`;

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
    const [attachedOwnerKey, setAttachedOwnerKey] = React.useState<string | null>(null);
    const [displayedOwnerKey, setDisplayedOwnerKey] = React.useState<string | null>(
        terminalOwnerKey,
    );

    const ownerSnapshotsRef = React.useRef(
        new Map<string, WorkspaceTerminalOwnerSnapshot>(),
    );
    const displayedIdentityRef = React.useRef(
        `${terminalOwnerKey}\0${terminalLeaseKey}`,
    );
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
    const v6RevisionRef = React.useRef<{
        sessionId: string;
        coordinator: WorkspaceFileRevisionV6;
    } | null>(null);
    const v6PushInFlightRef = React.useRef<Promise<void> | null>(null);
    // The history journal follows actual acknowledged CAS writes, not the
    // editor snapshot captured before a read-only preflight. Enter, autosave,
    // and export can all commit edits before the history debounce runs.
    const v6CommittedEditsRef = React.useRef(new V6AcknowledgedEditJournal());

    const v6StructuralBusyRef = React.useRef(false);
    const v6StructuralNeedsReconcileRef = React.useRef(false);
    // Session-start mismatch cannot be cleared by a later ordinary snapshot.
    const v6StartupMismatchRef = React.useRef<string | null>(null);
    const v6StructuralSnapshotAllowedRef = React.useRef(false);
    const writerModeRef = React.useRef<{
        sessionId: string;
        mode: "v5" | "v6";
    } | null>(null);
    const assertSessionWriterMode = React.useCallback((activeSessionId: string) => {
        const mode = args.fileSyncMode === "v6" ? "v6" : "v5";
        const selected = writerModeRef.current;
        if (!selected || selected.sessionId !== activeSessionId) {
            writerModeRef.current = { sessionId: activeSessionId, mode };
        } else if (selected.mode !== mode) {
            // A prop change must not silently switch writers in a live shell.
            throw new Error("Workspace sync mode changed. Start a new terminal session before switching writers.");
        }
    }, [args.fileSyncMode]);
    React.useEffect(() => () => {
        v6RevisionRef.current?.coordinator.dispose();
        v6RevisionRef.current = null;
    }, []);
    React.useEffect(() => {
        const previous = v6RevisionRef.current;
        if (previous && previous.sessionId !== sessionId) {
            previous.coordinator.dispose();
            v6RevisionRef.current = null;
        }
        v6CommittedEditsRef.current.reset(sessionId);
    }, [sessionId]);
    const pushInFlightRef = React.useRef<Promise<boolean> | null>(null);
    const lastWorkspaceSyncErrorRef = React.useRef<string | null>(null);
    const openInFlightRef = React.useRef<Promise<void> | null>(null);
    const workspaceReadyRef = React.useRef(true);
    const openedLeaseKeyRef = React.useRef<string | null>(null);
    const openedOwnerKeyRef = React.useRef<string | null>(null);
    const previousTerminalIdentityRef = React.useRef<string | null>(null);
    const sessionIdRef = React.useRef<string | null>(sessionId);
    const startedRef = React.useRef(started);
    const startingRef = React.useRef(starting);
    const stoppingRef = React.useRef(stopping);
    const restartingRef = React.useRef(restarting);
    const stateRef = React.useRef<RunSessionState | "idle">(state);
    const setTerminalStateNow = React.useCallback(
        (nextState: RunSessionState | "idle") => {
            stateRef.current = nextState;
            setState(nextState);
        },
        [],
    );
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
                historyScopeKey: args.historyScopeKey
                    ? `${args.historyScopeKey}::${terminalOwnerKey}`
                    : terminalOwnerKey,
                projectId: args.projectId,
                cwd: args.cwd,
                title: args.title,
            }),
        [args.historyScopeKey, args.projectId, args.cwd, args.title, terminalOwnerKey],
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
        leaseMountGenerationRef.current = claimLeaseMountGeneration(terminalOwnerKey);

        return () => {
            mountedRef.current = false;
            if (promptPrimeTimerRef.current != null) {
                window.clearTimeout(promptPrimeTimerRef.current);
                promptPrimeTimerRef.current = null;
            }
        };
    }, [terminalOwnerKey, terminalLeaseKey]);

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
                    startupOutputSuppressed: Boolean(
                        startupCwdOutputSuppressionRef.current,
                    ),
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
                        startupOutputSuppressed: Boolean(
                            startupCwdOutputSuppressionRef.current,
                        ),
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

    const captureOwnerSnapshot = React.useCallback((identity: string) => {
        if (!identity) return;

        ownerSnapshotsRef.current.set(
            identity,
            cloneWorkspaceTerminalOwnerSnapshot({
                terminalFeed: terminalFeedRef.current,
                terminalEvidence: terminalEvidenceRef.current,
                lastHandledSeq: lastHandledSeqRef.current,
                nextChunkId: nextChunkIdRef.current,
                currentCwd: currentCwdRef.current,
                lastAuthoredCwdApplied: lastAuthoredCwdAppliedRef.current,
                pendingInputLine: pendingInputLineRef.current,
                escapeSequence: escapeSequenceRef.current,
                terminalHasVisibleOutput: terminalHasVisibleOutputRef.current,
            }),
        );
    }, []);

    const restoreOwnerSnapshot = React.useCallback(
        (identity: string, ownerKey: string): boolean => {
            const stored = ownerSnapshotsRef.current.get(identity);
            displayedIdentityRef.current = identity;
            setDisplayedOwnerKey(ownerKey);

            if (!stored) return false;

            const snapshot = cloneWorkspaceTerminalOwnerSnapshot(stored);
            terminalFeedRef.current = snapshot.terminalFeed;
            setTerminalFeed(snapshot.terminalFeed);
            setTerminalEvidenceNow(snapshot.terminalEvidence);
            lastHandledSeqRef.current = snapshot.lastHandledSeq;
            nextChunkIdRef.current = snapshot.nextChunkId;
            currentCwdRef.current = snapshot.currentCwd;
            lastAuthoredCwdAppliedRef.current = snapshot.lastAuthoredCwdApplied;
            pendingInputLineRef.current = snapshot.pendingInputLine;
            escapeSequenceRef.current = snapshot.escapeSequence;
            terminalHasVisibleOutputRef.current = snapshot.terminalHasVisibleOutput;
            return true;
        },
        [setTerminalEvidenceNow],
    );

    const discardCurrentOwnerSnapshot = React.useCallback(() => {
        const identity = `${terminalOwnerKey}\0${terminalLeaseKey}`;
        ownerSnapshotsRef.current.delete(identity);
        displayedIdentityRef.current = identity;
        setDisplayedOwnerKey(terminalOwnerKey);
    }, [terminalLeaseKey, terminalOwnerKey]);

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
        currentCwdRef.current = initialEvidenceCwd;
        lastAuthoredCwdAppliedRef.current =
            initialEvidenceCwd && initialEvidenceCwd !== "/workspace"
                ? undefined
                : initialEvidenceCwd;
        terminalFeedRef.current = [];
        setTerminalFeed([]);
        setTerminalEvidenceNow(createTerminalEvidence(initialEvidenceCwd));
        setAttachedOwnerKey(null);
        setInputEnabled(false);
        setBusy(false);
        setTerminalStateNow("idle");
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
        setTerminalStateNow,
    ]);

    const reset = React.useCallback(() => {
        clearQuietTimer();
        clearStaleStartingTimer();
        clearRecycleRestartTimer();
        void cancel().catch(() => {});
        closeSocket();
        discardCurrentOwnerSnapshot();
        clearLocalTerminalState();
    }, [
        cancel,
        clearLocalTerminalState,
        clearQuietTimer,
        clearRecycleRestartTimer,
        clearStaleStartingTimer,
        closeSocket,
        discardCurrentOwnerSnapshot,
    ]);

    const replaceFiles = React.useCallback(
        async (files: WorkspaceSyncEntry[]): Promise<boolean> => {
            if (!sessionId) return false;

            setSyncStatus("pushing");

            try {
                assertSessionWriterMode(sessionId);
                if (args.fileSyncMode === "v6" &&
                    (v6StructuralBusyRef.current || v6StructuralNeedsReconcileRef.current || v6StartupMismatchRef.current !== null)) {
                    throw new WorkspaceFileV6Error("RECONCILIATION_REQUIRED", 409);
                }
                const visible = sortEntries(files).filter(
                    (entry) => !isHiddenHistoryEntry(entry),
                );

                // Exactly one workspace writer per terminal session. In the
                // opt-in V6 mode never invoke /workspace/replace, including
                // when a V6 operation conflicts or its transport is unavailable.
                if (args.fileSyncMode === "v6") {
                    if (v6PushInFlightRef.current) {
                        await v6PushInFlightRef.current;
                    }
                    if (v6RevisionRef.current?.sessionId !== sessionId) {
                        v6RevisionRef.current?.coordinator.dispose();
                        v6RevisionRef.current = {
                            sessionId,
                            coordinator: new WorkspaceFileRevisionV6(sessionId),
                        };
                    }
                    const coordinator = v6RevisionRef.current.coordinator;
                    // A learner may type again during a READ-ONLY CAS preflight.
                    // One fresh attempt is safe only when zero writes were
                    // acknowledged. Never retry a transport failure, a remote
                    // conflict, or a partially committed batch.
                    for (let attempt = 0; attempt < 2; attempt++) {
                        let acknowledged = false;
                        const desired = attempt === 0 ? visible : sortEntries(
                            getWorkspaceEntries(),
                        ).filter(entry => !isHiddenHistoryEntry(entry));
                        const run = pushWorkspaceFileDeltaV6({
                            revision: coordinator,
                            baseline: lastPushedEntriesRef.current,
                            desired,
                            getLatestEntries: getWorkspaceEntries,
                            onCommitted: (path, next) => {
                                if (v6RevisionRef.current?.coordinator !== coordinator) {
                                    throw new Error("Terminal session changed during workspace save.");
                                }
                                acknowledged = true;
                                const updated = new Map(
                                    lastPushedEntriesRef.current.map((entry) => [entry.path, entry] as const),
                                );
                                const before = updated.get(path) ?? null;
                                v6CommittedEditsRef.current.append(sessionId, {path, before, after: next});
                                if (next) updated.set(path, next);
                                else updated.delete(path);
                                lastPushedEntriesRef.current = sortEntries([...updated.values()]);
                            },
                        });
                        v6PushInFlightRef.current = run;
                        try {
                            await run;
                            break;
                        } catch (error) {
                            if (attempt !== 0 || acknowledged ||
                                !(error instanceof WorkspaceFileV6Error) ||
                                error.code !== "LOCAL_DRAFT_CHANGED") throw error;
                        } finally {
                            if (v6PushInFlightRef.current === run) {
                                v6PushInFlightRef.current = null;
                            }
                        }
                    }
                    lastWorkspaceSyncErrorRef.current = null;
                    setSyncStatus("idle");
                    return true;
                }

                const historyContent = await ensureHistoryLoaded();
                const payload = augmentEntriesWithHistory(visible, historyContent);

                // Send the last acknowledged browser/terminal baseline. The
                // runner applies only edits made since this baseline, and
                // rejects conflicting terminal changes with HTTP 409.
                const baselineFiles = augmentEntriesWithHistory(
                    lastPushedEntriesRef.current,
                    historyContent,
                );
                await postJson<ReplaceResponse>(
                    `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/workspace/replace`,
                    { files: payload, baselineFiles },
                );

                lastPushedEntriesRef.current = visible;
                lastWorkspaceSyncErrorRef.current = null;
                setSyncStatus("idle");
                return true;
            } catch (e: any) {
                setSyncStatus("error");
                const message = e?.message ?? "Failed to sync workspace to terminal.";
                if (lastWorkspaceSyncErrorRef.current !== message) {
                    pushChunk("err", `\r\n${message}\r\n`);
                    lastWorkspaceSyncErrorRef.current = message;
                }
                return false;
            }
        },
        [sessionId, args.fileSyncMode, assertSessionWriterMode, getWorkspaceEntries, ensureHistoryLoaded, pushChunk],
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

            lastWorkspaceSyncErrorRef.current = null;
            setSyncStatus("idle");
            return sortEntries(visible);
        } catch (e: any) {
            setSyncStatus("error");
            const message = e?.message ?? "Failed to pull terminal workspace.";
            if (lastWorkspaceSyncErrorRef.current !== message) {
                pushChunk("err", `\r\n${message}\r\n`);
                lastWorkspaceSyncErrorRef.current = message;
            }
            throw e; // Never mistake a failed snapshot for an empty workspace.
        }
    }, [sessionId, persistHistoryContent, pushChunk]);

    const pushWorkspaceFromSource = React.useCallback(
        async (force = false): Promise<boolean> => {
            // Do not let two Enter/save handlers race and both send an obsolete
            // baseline. Read fresh editor entries after the earlier push settles.
            // Claim the queue slot BEFORE awaiting a prior writer. Otherwise
            // two waiters resume together, read the same baseline, and race.
            const previous = pushInFlightRef.current;
            const run = (async (): Promise<boolean> => {
                if (previous && !await previous) return false;
                if (sessionIdRef.current !== sessionId) return false;
                const entries = getWorkspaceEntries();
                if (!force && entriesEqual(entries, lastPushedEntriesRef.current)) {
                    return true;
                }
                return replaceFiles(entries);
            })();
            pushInFlightRef.current = run;
            try { return await run; }
            finally {
                if (pushInFlightRef.current === run) pushInFlightRef.current = null;
            }
        },
        [getWorkspaceEntries, replaceFiles],
    );

    const pullSnapshotIntoWorkspace = React.useCallback(async (
        onVerifiedSnapshot?: (files: WorkspaceSyncEntry[]) => void,
    ): Promise<boolean> => {
        if (!sessionId || (v6StructuralBusyRef.current && !v6StructuralSnapshotAllowedRef.current)) return false;
        if (snapshotInFlightRef.current) return await snapshotInFlightRef.current;

        const run = (async (): Promise<boolean> => {
            const terminalBaselineEntries = lastPushedEntriesRef.current;
            const snapshot = await snapshotFiles();
            const currentUiEntries = getWorkspaceEntries();
            const dirtyUiPaths = diffDirtyUiPaths(
                currentUiEntries,
                terminalBaselineEntries,
            );

            const nextBaseline = mergeWorkspaceSnapshotBaseline(
                snapshot,
                currentUiEntries,
                dirtyUiPaths,
            );

            awaitingPostEnterSnapshotRef.current = false;

            await args.onTerminalSnapshotFiles?.(snapshot, {
                dirtyUiPaths,
                baselinePaths: new Set(
                    terminalBaselineEntries.map((entry) => entry.path),
                ),
            });
            // Advance the baseline only after the IDE accepts the snapshot.
            lastPushedEntriesRef.current = nextBaseline;
            if (args.fileSyncMode === "v6" && dirtyUiPaths.size === 0 && !v6StartupMismatchRef.current) {
                v6StructuralNeedsReconcileRef.current = false;
            }
            // This is the exact authenticated Runner snapshot used for the
            // successful reconciliation. History must not perform another
            // export against a React tree that has not yet rendered the merge.
            onVerifiedSnapshot?.(snapshot);
            return true;
        })();

        snapshotInFlightRef.current = run;

        try {
            return await run;
        } catch {
            // Keep the last acknowledged baseline and retry on a later pull.
            return false;
        } finally {
            snapshotInFlightRef.current = null;
        }
    }, [
        sessionId,
        snapshotFiles,
        getWorkspaceEntries,
        args.onTerminalSnapshotFiles,
    ]);

    const executeExplorerIntentV6 = React.useCallback<WorkspaceExplorerExecutorV6>(async (intent) => {
        // Reading the session's recoverable trash never consumes a local draft
        // and remains available while a failed mutation awaits reconciliation.
        const isTrashList = intent.kind === "list_trash";
        const isExport = intent.kind === "export_snapshot";
        const isHistoryRead = intent.kind === "history_snapshot";
        const isEditorSync = intent.kind === "sync_editor";
        // A history/debounce or export is a barrier, not an independent writer.
        // Wait for the already-queued save before inspecting its acknowledgements.
        // Real conflicts still fail closed in the underlying CAS writer.
        if ((isEditorSync || isExport) && args.fileSyncMode === "v6") {
            const pendingPush = pushInFlightRef.current;
            if (pendingPush && !await pendingPush) {
                throw new WorkspaceFileV6Error("LOCAL_SYNC_FAILED", 409);
            }
            const pendingV6 = v6PushInFlightRef.current;
            if (pendingV6) await pendingV6;
            const pendingSnapshot = snapshotInFlightRef.current;
            if (pendingSnapshot && !await pendingSnapshot) {
                throw new WorkspaceFileV6Error("RECONCILIATION_REQUIRED", 409);
            }
        }
        if (args.fileSyncMode !== "v6" || !args.enabled || !sessionId || !interactiveReady ||
            v6StructuralBusyRef.current ||
            (!isTrashList && (v6StructuralNeedsReconcileRef.current || v6StartupMismatchRef.current !== null ||
                v6PushInFlightRef.current || pushInFlightRef.current || snapshotInFlightRef.current))) {
            throw new WorkspaceFileV6Error("SESSION_NOT_READY", 409);
        }
        assertSessionWriterMode(sessionId);
        if (isTrashList) {
            const reader = new WorkspaceStructuralActionsV6(sessionId, () => true);
            try {
                return {state:"read_only" as const, kind:"list_trash" as const,
                    path:"" as const, entries: await reader.listTrash()};
            } finally {
                reader.dispose();
            }
        }

        if (isHistoryRead) {
            // Undo/Redo must NEVER push stale browser state into the Runner.
            // A pending local edit (or React reconciliation lag) blocks history
            // until the view catches up; the read itself is strictly read-only.
            if (!entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current)) {
                throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
            }
            const files = await snapshotFiles();
            if (sessionIdRef.current !== sessionId ||
                !entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current) ||
                v6StructuralNeedsReconcileRef.current) {
                throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
            }
            return {state:"read_only" as const,kind:"history_snapshot" as const,
                path:"" as const, files};
        }

        if (isEditorSync) {
            // Collect exactly the browser paths that the existing per-file CAS
            // writer is about to commit. Do not mistake terminal-only changes
            // discovered by reconciliation for user-authored editor history.
            if (!entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current) &&
                !await pushWorkspaceFromSource(false)) {
                throw new WorkspaceFileV6Error("LOCAL_SYNC_FAILED", 409);
            }
            const verified = {files:null as WorkspaceSyncEntry[] | null};
            if (sessionIdRef.current !== sessionId ||
                !await pullSnapshotIntoWorkspace(files => {verified.files = files;}) ||
                !verified.files || v6StructuralNeedsReconcileRef.current) {
                throw new WorkspaceFileV6Error("RECONCILIATION_REQUIRED", 409);
            }
            // Only drain after a verified authenticated Runner snapshot.
            const committed = v6CommittedEditsRef.current.drain(sessionId);
            return {state:"reconciliation_required" as const,kind:"sync_editor" as const,path:"" as const,
                files:verified.files,committed};
        }

        if (isExport) {
            // The terminal snapshot is authoritative. Flush local edits via the same
            // V6 per-file CAS writer used by the explorer before exporting anything.
            // Never export a stale browser draft or silently fall back to V5.
            if (!entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current)) {
                if (!await pushWorkspaceFromSource(false)) {
                    throw new WorkspaceFileV6Error("LOCAL_SYNC_FAILED", 409);
                }
            }
            if (sessionIdRef.current !== sessionId ||
                !entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current) ||
                v6StructuralNeedsReconcileRef.current) {
                throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
            }
            const files = await snapshotFiles();
            if (sessionIdRef.current !== sessionId ||
                !entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current)) {
                throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
            }
            return {state:"read_only" as const, kind:"export_snapshot" as const,
                path:"" as const, files};
        }

        // Keep the unified history in actual Runner commit order. A structural
        // mutation cannot pass an unjournaled acknowledged content edit.
        if (v6CommittedEditsRef.current.hasPending(sessionId)) {
            throw new WorkspaceFileV6Error("EDITOR_HISTORY_PENDING", 409);
        }
        // An editor can be newer than the last acknowledged terminal snapshot
        // even when the project UI reports a cloud save. Before ANY structural
        // mutation, flush the current editor via the existing per-file CAS
        // writer. That writer checks both the remote revision and live editor
        // content. Never infer a rename from a delete+create and never fall back
        // to V5 whole-workspace replacement.
        if (!entriesEqual(getWorkspaceEntries(), lastPushedEntriesRef.current)) {
            if (!await pushWorkspaceFromSource(false)) {
                throw new WorkspaceFileV6Error("LOCAL_SYNC_FAILED", 409);
            }
        }
        const baseline = lastPushedEntriesRef.current;
        const clean = () => sessionIdRef.current === sessionId &&
            entriesEqual(getWorkspaceEntries(), baseline) &&
            !v6PushInFlightRef.current && !pushInFlightRef.current &&
            !snapshotInFlightRef.current;
        if (!clean()) throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
        v6StructuralBusyRef.current = true;
        const bridge = new WorkspaceStructuralActionsV6(sessionId, clean);
        try {
            let result;
            // File moves/deletes must match the bytes last acknowledged by the
            // editor, not merely whatever happens to be on disk right now.
            if (intent.kind === "move_file" || intent.kind === "delete_file") {
                const entry = baseline.find((item) => item.path === intent.path && item.kind === "file");
                if (!entry) throw new WorkspaceFileV6Error("CONFLICT", 409);
                const reader = new WorkspaceFileRevisionV6(sessionId);
                try {
                    const binary = isBinaryWorkspaceEntry(entry);
                    const remote = binary ? await reader.readBinary(intent.path) : await reader.readText(intent.path);
                    if (!remote.exists || (binary
                        ? !("data" in remote) || remote.data !== (entry as {data:string}).data
                        : !("content" in remote) || remote.content !== (entry as {content:string}).content)) {
                        throw new WorkspaceFileV6Error("CONFLICT", 409);
                    }
                    if (!clean()) throw new WorkspaceFileV6Error("LOCAL_DRAFT_CHANGED", 409);
                    if (intent.kind === "delete_file") {
                        reader.acknowledgeRead(intent.path, remote.revision);
                        // A transport failure may occur after the server commits:
                        // keep reconciliation required until a read-only snapshot.
                        v6StructuralNeedsReconcileRef.current = true;
                        await reader.deleteFile(intent.path);
                        result = {state:"reconciliation_required" as const,kind:intent.kind,path:intent.path};
                    } else {
                        v6StructuralNeedsReconcileRef.current = true;
                        result = await bridge.execute({...intent,expectedRevision:remote.revision});
                    }
                } finally {
                    reader.dispose();
                }
            } else if (intent.kind === "create_file") {
                // New files are server-first. Never stage a local-only tree node
                // and never overwrite a file concurrently created by a terminal.
                const path = assertWorkspaceRelativePath(intent.path);
                if (path !== intent.path || resolveWorkspaceFileCapability(path)?.storage !== "text" ||
                    baseline.some(item => item.path === path || item.path.startsWith(`${path}/`))) {
                    throw new WorkspaceFileV6Error("CONFLICT", 409);
                }
                const revision = new WorkspaceFileRevisionV6(sessionId);
                try {
                    const current = await revision.readText(path);
                    if (current.exists || !clean()) throw new WorkspaceFileV6Error("CONFLICT", 409);
                    revision.acknowledgeRead(path, null);
                    // Any ambiguous response requires reconciliation, never retry.
                    v6StructuralNeedsReconcileRef.current = true;
                    await revision.writeText(path, "");
                    result = {state:"reconciliation_required" as const,kind:intent.kind,path};
                } finally {
                    revision.dispose();
                }
            } else if (intent.kind === "replace_file") {
                const previous = baseline.find(item => item.path === intent.path && item.kind === "file");
                if (!previous) throw new WorkspaceFileV6Error("CONFLICT", 409);
                const revision = new WorkspaceFileRevisionV6(sessionId);
                try {
                    await replaceHistoryWorkspaceFileV6(intent.path, previous, intent.entry, revision, clean,
                        () => {v6StructuralNeedsReconcileRef.current = true;});
                    result = {state:"reconciliation_required" as const,kind:intent.kind,path:intent.path};
                } finally {
                    revision.dispose();
                }
            } else if (intent.kind === "restore_file" || intent.kind === "import_file") {
                // The inverse of a confirmed delete is an atomic, absent-only
                // write. Read the Runner first; never restore browser bytes over
                // an existing file or use V5 whole-workspace replacement.
                if (baseline.some(item => item.path === intent.path)) {
                    throw new WorkspaceFileV6Error("CONFLICT", 409);
                }
                const revision = new WorkspaceFileRevisionV6(sessionId);
                try {
                    await restoreDeletedWorkspaceFileV6(intent.path, intent.entry, revision, clean, () => {
                        v6StructuralNeedsReconcileRef.current = true;
                    });
                    result = {state:"reconciliation_required" as const,kind:intent.kind,path:intent.path};
                } finally {
                    revision.dispose();
                }
            } else {
                v6StructuralNeedsReconcileRef.current = true;
                result = await bridge.execute(intent);
            }
            // Capture the same server snapshot accepted by the workspace
            // reconciler. A second browser export immediately after mutation
            // can observe the pre-render UI and repush deleted content.
            const verified = {files: null as WorkspaceSyncEntry[] | null};
            v6StructuralSnapshotAllowedRef.current = true;
            try {
                if (sessionIdRef.current !== sessionId ||
                    !await pullSnapshotIntoWorkspace(files => { verified.files = files; }) ||
                    v6StructuralNeedsReconcileRef.current || !verified.files) {
                    throw new WorkspaceFileV6Error("RECONCILIATION_REQUIRED", 409);
                }
            } finally {
                v6StructuralSnapshotAllowedRef.current = false;
            }
            // Structural mutations invalidate cached paths/revisions.
            if (v6RevisionRef.current?.sessionId === sessionId) {
                v6RevisionRef.current.coordinator.dispose();
                v6RevisionRef.current = null;
            }
            return {...result,files:verified.files};
        } finally {
            bridge.dispose();
            v6StructuralBusyRef.current = false;
        }
    }, [args.enabled, args.fileSyncMode, assertSessionWriterMode, getWorkspaceEntries,
        interactiveReady, pullSnapshotIntoWorkspace, pushWorkspaceFromSource, snapshotFiles, sessionId]);

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
        if (args.fileSyncMode === "v6" && (v6StructuralBusyRef.current || v6StructuralNeedsReconcileRef.current || v6StartupMismatchRef.current !== null)) {
            throw new WorkspaceFileV6Error("RECONCILIATION_REQUIRED", 409);
        }
        if (sessionId) assertSessionWriterMode(sessionId);
        const ok = await pushWorkspaceFromSource(false);
        if (!ok) {
            throw new Error("Could not push local workspace to terminal.");
        }
    }, [sessionId, args.fileSyncMode, assertSessionWriterMode, pushWorkspaceFromSource]);

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
                enableLsColors: args.fileSyncMode === "v6",
            });
            if (!normalizedCwd) return;

            // A prompt-prime newline is only a fallback for a genuinely blank
            // interactive shell. Once authored startup begins, the shell will
            // emit its real prompt after the hidden bootstrap command finishes.
            // Cancel any previously scheduled prime so it cannot land between
            // the startup marker and that real prompt and create a duplicate.
            clearPromptPrimeTimer();

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
                enableLsColors: args.fileSyncMode === "v6",
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
        [
            clearPromptPrimeTimer,
            resolvedBootstrap,
            args.fileSyncMode,
            flushPendingStartupInput,
            scheduleStartupCwdFlush,
        ],
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
                if (!shouldAllowAutomaticTerminalStart(terminalStartClaimKey)) {
                    return;
                }
                lastStartAttemptAtRef.current = now;
            }

            if (openInFlightRef.current) {
                return await settleWorkspaceTerminalOpenForCaller(
                    openInFlightRef.current,
                    options.throwOnFailure === true,
                );
            }

            if (startingRef.current) return;

            if (
                startedRef.current &&
                openedOwnerKeyRef.current === terminalOwnerKey &&
                openedLeaseKeyRef.current === terminalLeaseKey &&
                !isFinalSessionState(stateRef.current)
            ) {
                return;
            }

            if (
                startedRef.current &&
                (openedOwnerKeyRef.current !== terminalOwnerKey ||
                    openedLeaseKeyRef.current !== terminalLeaseKey) &&
                !isFinalSessionState(stateRef.current)
            ) {
                // Detach from the previous owner/workspace without killing it.
                // The ensure route will reattach this owner or start a new owned PTY.
                closeSocket();
                openedLeaseKeyRef.current = null;
                openedOwnerKeyRef.current = null;
                setAttachedOwnerKey(null);
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
                const ownerIdentity = `${terminalOwnerKey}\0${terminalLeaseKey}`;
                const preservesExistingOwnerState =
                    displayedIdentityRef.current === ownerIdentity &&
                    ownerSnapshotsRef.current.has(ownerIdentity);

                workspaceReadyRef.current = fullEntries.length === 0;

                if (!preservesExistingOwnerState) {
                    lastHandledSeqRef.current = 0;
                    nextChunkIdRef.current = 1;
                    pendingInputLineRef.current = "";
                    escapeSequenceRef.current = "";
                    terminalHasVisibleOutputRef.current = false;
                    terminalFeedRef.current = [];
                    setTerminalFeed([]);
                    setTerminalEvidenceNow(createTerminalEvidence(initialEvidenceCwd));
                }

                awaitingPostEnterSnapshotRef.current = false;
                v6StartupMismatchRef.current = null;
                terminalProcessExitedRef.current = false;
                terminalExitCodeRef.current = null;
                promptPrimeAttemptsRef.current = 0;
                displayedIdentityRef.current = ownerIdentity;
                setDisplayedOwnerKey(terminalOwnerKey);
                setAttachedOwnerKey(null);
                setInputEnabled(false);
                setBusy(true);
                stateRef.current = "preparing";
                startingRef.current = true;
                startedRef.current = false;
                setTerminalStateNow("preparing");
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
                    setTerminalStateNow("failed");
                    setStarted(false);
                    setTerminalRecovery({
                        state: "restart_available",
                        message: "Terminal is still starting. Restart the terminal to try again.",
                    });
                }, STARTING_STALE_MS);

                const normalizedInitialCwd = resolveWorkspaceTerminalStartupCwd({
                    cwd: args.cwd,
                    bootstrap: resolvedBootstrap,
                    enableLsColors: args.fileSyncMode === "v6",
                });
                const initialCwdToQueue = resolveInitialWorkspaceTerminalCwd({
                    normalizedCwd: normalizedInitialCwd,
                    hasPreservedOwnerState: preservesExistingOwnerState,
                });
                if (initialCwdToQueue) {
                    queueAuthoredCwd(initialCwdToQueue);
                }

                try {
                    openedLeaseKeyRef.current = terminalLeaseKey;
                    openedOwnerKeyRef.current = terminalOwnerKey;

                    const startRequest = {
                        kind: "shell",
                        mode: "interactive",
                        language: "bash",
                        projectId: args.projectId,
                        cwd: args.cwd,
                        workspaceKey: terminalLeaseKey,
                        hostKey: terminalHostKey,
                        ownerKey: terminalOwnerKey,
                        forceNew: args.forceNewSession === true,
                        ...(fullEntries.length ? { files: fullEntries as any } : {}),
                    } as any;

                    let nextSessionId: string | null = null;

                    for (let attempt = 0; attempt <= CLIENT_START_CONTENTION_RETRY_ATTEMPTS; attempt += 1) {
                        try {
                            nextSessionId = await start(startRequest);

                            /**
                             * The ensure route can hand the same live shell from the
                             * previous exercise to this controller. Cancel the old
                             * controller's delayed unmount cleanup by session id, not
                             * only by its now-obsolete workspace key.
                             */
                            clearScheduledUnmountCancelsForSession(nextSessionId);
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
                        currentLeaseMountGeneration(terminalOwnerKey) !== attemptLeaseGeneration;
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

                    /**
                     * The runner returns from /sessions/start only after the shared
                     * workspace exists, is mounted, and the shell container has entered
                     * waiting_for_input. Replacing and snapshot-polling that same
                     * workspace here duplicated the full workspace transfer on every
                     * open/reattach, delayed the prompt, and could overwrite changes made
                     * by another terminal attached to the shared project.
                     */
                    // Do not mark a V6 workspace ready before its authoritative
                    // snapshot is verified below.
                    workspaceReadyRef.current = args.fileSyncMode !== "v6";

                    if (
                        !mountedRef.current ||
                        currentLeaseMountGeneration(terminalOwnerKey) !== attemptLeaseGeneration
                    ) {
                        return;
                    }

                    const normalizedStartCwd = resolveWorkspaceTerminalStartupCwd({
                        cwd: args.cwd,
                        bootstrap: resolvedBootstrap,
                        enableLsColors: args.fileSyncMode === "v6",
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

                    // A resumed shell can retain different bytes than the start
                    // request. Never assume the browser draft is the Runner's
                    // acknowledged baseline; verify the actual session first.
                    // On mismatch/read failure, preserve BOTH versions and block
                    // V6 writers. This does not reset the container or replay
                    // any user-supplied file contents.
                    if (args.fileSyncMode === "v6") {
                        const startupCheck = await (async () => {
                            try {
                                return verifyV6StartupSnapshot({
                                    expected: visibleEntries,
                                    actual: await snapshotWorkspaceForSession(nextSessionId),
                                });
                            } catch {
                                return {ok: false as const, reason: "snapshot_unavailable" as const,
                                    divergentPaths: [] as string[]};
                            }
                        })();
                        if (!mountedRef.current ||
                            currentLeaseMountGeneration(terminalOwnerKey) !== attemptLeaseGeneration) return;
                        if (!startupCheck.ok) {
                            // No independently persisted acknowledged ancestor exists for this
                            // resumed browser. Classify mismatches as unverified, not as
                            // automatically mergeable or safe-to-overwrite changes.
                            const detail = startupCheck.reason === "snapshot_unavailable"
                                ? "Runner snapshot could not be verified"
                                : `Runner and browser differ on ${startupCheck.divergentPaths.length} path(s); reconciliation requires a verified ancestor. Both versions preserved` ;
                            v6StartupMismatchRef.current = detail;
                            v6StructuralNeedsReconcileRef.current = true;
                            setSyncStatus("error");
                            pushChunk("err", `\r\nWorkspace synchronization blocked: ${detail}. Existing Runner and browser files have been preserved. Reconcile differences before editing through this terminal; do not force an overwrite.\r\n`);
                        } else {
                            lastPushedEntriesRef.current = visibleEntries;
                            v6StructuralNeedsReconcileRef.current = false;
                        }
                    } else {
                        lastPushedEntriesRef.current = visibleEntries;
                    }
                    workspaceReadyRef.current = true;
                    scheduleStartupCwdFlush();
                    setAttachedOwnerKey(terminalOwnerKey);
                    startedRef.current = true;
                    releaseAutomaticTerminalStart(terminalStartClaimKey);
                    setStarted(true);

                    if (
                        shouldEnableWorkspaceTerminalInput({
                            state: stateRef.current,
                            workspaceReady: workspaceReadyRef.current,
                            pendingStartupInput: pendingStartupInputRef.current,
                        })
                    ) {
                        setInputEnabled(true);
                        schedulePromptPrime();
                    } else if (pendingStartupInputRef.current) {
                        setInputEnabled(false);
                        await flushPendingStartupInput();
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
                        releaseAutomaticTerminalStart(terminalStartClaimKey);
                    }
                    setBusy(false);
                    setInputEnabled(false);
                    setTerminalStateNow("failed");
                    setStarted(false);
                    setStarting(false);

                    if (
                        openedOwnerKeyRef.current === terminalOwnerKey &&
                        openedLeaseKeyRef.current === terminalLeaseKey
                    ) {
                        openedLeaseKeyRef.current = null;
                        openedOwnerKeyRef.current = null;
                        setAttachedOwnerKey(null);
                    }

                    /**
                     * Keep one canonical rejected promise for this open transaction.
                     * Passive auto-open callers may suppress it at their call boundary,
                     * while explicit tab activation must observe it and roll back the
                     * pending tab instead of remaining stuck on “Opening…”.
                     */
                    throw e;
                } finally {
                    clearStaleStartingTimer();
                    startingRef.current = false;
                    setStarting(false);
                    openInFlightRef.current = null;
                }
            })();

            openInFlightRef.current = run;
            return await settleWorkspaceTerminalOpenForCaller(
                run,
                options.throwOnFailure === true,
            );
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
            terminalOwnerKey,
            terminalHostKey,
            terminalStartClaimKey,
            args.forceNewSession,
            cancel,
            closeSocket,
            clearStaleStartingTimer,
            clearTerminalRecovery,
            flushPendingStartupInput,
            scheduleStartupCwdFlush,
            queueAuthoredCwd,
            setTerminalRecovery,
            setTerminalEvidenceNow,
            setTerminalStateNow,
            initialEvidenceCwd,
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
            openedOwnerKeyRef.current = null;
            discardCurrentOwnerSnapshot();
            clearLocalTerminalState();
            setStopping(false);
        }
    }, [
        cancel,
        clearLocalTerminalState,
        clearQuietTimer,
        clearStaleStartingTimer,
        discardCurrentOwnerSnapshot,
    ]);

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
                openedOwnerKeyRef.current = null;
                discardCurrentOwnerSnapshot();
                clearLocalTerminalState();
                terminalProcessExitedRef.current = false;
                terminalExitCodeRef.current = null;
                releaseAutomaticTerminalStart(terminalStartClaimKey);

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
        discardCurrentOwnerSnapshot,
        open,
        sessionId,
        terminalLeaseKey,
    ]);

    useBrowserLayoutEffect(() => {
        const identity = `${terminalOwnerKey}\0${terminalLeaseKey}`;
        const previousIdentity = previousTerminalIdentityRef.current;
        previousTerminalIdentityRef.current = identity;

        if (!previousIdentity || previousIdentity === identity) {
            displayedIdentityRef.current = identity;
            setDisplayedOwnerKey(terminalOwnerKey);
            return;
        }

        /**
         * A terminal tab switch is a display/connection switch, not a terminal
         * reset. Preserve the exact transcript, command evidence, cwd, pending
         * line, and last processed runner sequence for the old owner before
         * detaching its socket. The backend shell stays alive.
         */
        captureOwnerSnapshot(previousIdentity);
        closeSocket();
        clearLocalTerminalState();
        restoreOwnerSnapshot(identity, terminalOwnerKey);
        workspaceReadyRef.current = false;
        openedLeaseKeyRef.current = null;
        openedOwnerKeyRef.current = null;
    }, [
        terminalLeaseKey,
        terminalOwnerKey,
        captureOwnerSnapshot,
        clearLocalTerminalState,
        closeSocket,
        restoreOwnerSnapshot,
    ]);

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
                !args.preserveSessionOnUnmount &&
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

            previousTerminalIdentityRef.current = null;
            openInFlightRef.current = null;
            recoverInFlightRef.current = null;
            pendingRecoveryInputRef.current = "";
            pendingStartupInputRef.current = null;
            pendingStartupCwdRef.current = undefined;
            openedLeaseKeyRef.current = null;
            openedOwnerKeyRef.current = null;
            clearQuietTimer();
            clearStaleStartingTimer();
            clearRecycleRestartTimer();
            closeSocket();
        };
    }, [
        args.preserveSessionOnUnmount,
        clearQuietTimer,
        clearRecycleRestartTimer,
        clearStaleStartingTimer,
        closeSocket,
    ]);
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
            releaseAutomaticTerminalStart(terminalStartClaimKey);

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
                    releaseAutomaticTerminalStart(terminalStartClaimKey);
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
        if (
            !shouldConsumeWorkspaceTerminalEventStream({
                terminalOwnerKey,
                currentSessionId: sessionId,
                eventsSessionId,
                eventsOwnerKey,
            })
        ) {
            return;
        }

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
                setTerminalStateNow(ev.state);

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
                    const canAcceptInput = shouldEnableWorkspaceTerminalInput({
                        state: ev.state,
                        workspaceReady: workspaceReadyRef.current,
                        pendingStartupInput: pendingStartupInputRef.current,
                    });
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
                setTerminalStateNow("waiting_for_input");
                setBusy(true);
                const canAcceptInput = shouldEnableWorkspaceTerminalInput({
                    state: "waiting_for_input",
                    workspaceReady: workspaceReadyRef.current,
                    pendingStartupInput: pendingStartupInputRef.current,
                });
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
                setTerminalStateNow("failed");
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
                setTerminalStateNow("failed");
                setStarted(false);
                openInFlightRef.current = null;

                if (awaitingPostEnterSnapshotRef.current) {
                    schedulePostEnterSnapshot(100);
                }
            }
        }
    }, [
        events,
        eventsSessionId,
        eventsOwnerKey,
        sessionId,
        terminalOwnerKey,
        pushChunk,
        schedulePostEnterSnapshot,
        flushPendingStartupInput,
        schedulePromptPrime,
        scheduleStartupCwdFlush,
        clearStaleStartingTimer,
        scheduleRestartAfterRunnerRecycle,
        setTerminalRecovery,
        setTerminalStateNow,
    ]);

    React.useEffect(() => {
        if (!args.enabled) return;
        if (
            !shouldConsumeWorkspaceTerminalEventStream({
                terminalOwnerKey,
                currentSessionId: sessionId,
                eventsSessionId,
                eventsOwnerKey,
            })
        ) {
            return;
        }
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
        setTerminalStateNow("failed");
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
        eventsSessionId,
        eventsOwnerKey,
        terminalOwnerKey,
        clearStaleStartingTimer,
        disconnectReason,
        setTerminalRecovery,
        setTerminalStateNow,
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


    return React.useMemo(
        () => ({
            available: args.enabled,
            started,
            starting,
            stopping,
            busy,
            inputEnabled,
            interactiveReady,
            disconnectedInputGuardActive,
            sessionId,
            attachedOwnerKey,
            displayedOwnerKey,
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
            executeExplorerIntentV6,
            beforeSubmitEnter,
            afterSubmitEnter,
        }),
        [
            args.enabled,
            attachedOwnerKey,
            beforeSubmitEnter,
            busy,
            connectionState,
            disconnectedInputGuardActive,
            displayedOwnerKey,
            getTerminalEvidenceNow,
            handleDisconnectedInputAttempt,
            inputEnabled,
            interactiveReady,
            lastMessageAt,
            open,
            pullSnapshotIntoWorkspace,
            executeExplorerIntentV6,
            recoverMessage,
            recoverState,
            replaceFiles,
            reset,
            resize,
            restart,
            restarting,
            sendData,
            sessionId,
            snapshotFiles,
            socketReadyState,
            started,
            starting,
            state,
            stop,
            stopping,
            syncStatus,
            terminalEvidence,
            terminalFeed,
        ],
    );
}
