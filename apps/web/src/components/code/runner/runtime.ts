import type { RefObject } from "react";
import type {
    RunSessionState,
    RunnerLanguage,
    WorkspaceSyncEntry,
} from "@zoeskoul/code-contracts";
import type { RunResult } from "@/lib/code/types";
import type { BatchRunResult } from "@/lib/code/types/batch";
import type { SqlDialect, TerminalEvidence } from "@/lib/practice/types";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { OnRun, RunnerState, TermLine } from "./types";

export type { WorkspaceSyncEntry };
export type { TerminalEvidence };

export type ExecutionBackend = "pty" | "judge0";
export type TerminalView = "plain" | "xterm" | "auto";
export type TerminalSessionScope = "exercise" | "topic" | "module" | "project";

export type CodeRunnerRuntime = {
    backend: ExecutionBackend;
    terminalView?: TerminalView;
};

export type ResolvedCodeRunnerRuntime = {
    backend: ExecutionBackend;
    terminalView: Exclude<TerminalView, "auto">;
};

export type RunnerBackend = "pty" | "judge0" | "sql";
export type SurfaceKind = "terminal-pane" | "plain" | "xterm" | "sql";

export type TerminalChunk = {
    id: number;
    kind: "pty" | "err" | "sys";
    data: string;
};

export type TerminalRecoverState =
    | "none"
    | "restart_available"
    | "starting"
    | "blocked_too_many_sessions";

export type TerminalConnectionState =
    | "idle"
    | "connecting"
    | "connected"
    | "disconnected";

export const TERMINAL_SOCKET_STALE_MS = 45_000;

const MAX_TERMINAL_EVIDENCE_COMMANDS = 50;
const MAX_TERMINAL_EVIDENCE_OUTPUT_CHARS = 20_000;

export type RunnerLastResult = RunResult | BatchRunResult | null;

export type SharedRunnerArgs = {
    runtime?: CodeRunnerRuntime | ResolvedCodeRunnerRuntime;
    lang: RunnerLanguage;
    code: string;
    getLatestCode?: () => string;
    sqlDialect?: SqlDialect;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    workspace?: WorkspaceStateV2 | null;
    exerciseStateKey?: string;
    disabled: boolean;
    allowRun: boolean;
    resetTerminalOnRun: boolean;
    onRun?: OnRun;
    isAuthenticated?: boolean;

    getWorkspaceFiles?: () => WorkspaceSyncEntry[];
    onTerminalSnapshotFiles?: (
        files: WorkspaceSyncEntry[],
        meta: { dirtyUiPaths: Set<string> },
    ) => void | Promise<void>;
};

export type WorkspaceTerminalConfig = {
    enabled?: boolean;
    projectId?: string;
    cwd?: string;
    terminalSessionScope?: TerminalSessionScope;

    /**
     * Stable PTY lease key. This can intentionally be broader than the current
     * exercise binding so terminal_workspace lessons can reuse one shell across
     * multiple practice cards in the same topic.
     */
    workspaceKey?: string;
    initialFiles?: WorkspaceSyncEntry[] | Record<string, string>;
    lazy?: boolean;
    title?: string;
    historyScopeKey?: string;
    exerciseStateKey?: string;

    getWorkspaceFiles?: () => WorkspaceSyncEntry[];
    onTerminalSnapshotFiles?: (
        files: WorkspaceSyncEntry[],
        meta: { dirtyUiPaths: Set<string> },
    ) => void | Promise<void>;
};

export type TranscriptState = {
    terminal: TermLine[];
    stdinBuffer: string;
    awaitingInput: boolean;
    inputPrompt: string;
    inputLine: string;
    setInputLine: (v: string) => void;
    inputRef: RefObject<HTMLTextAreaElement | null>;
    submitInput: () => Promise<void> | void;
    typedLines: string[];
};

export type StreamState = {
    terminalFeed: TerminalChunk[];
    inputEnabled: boolean;
    sendTerminalData: (data: string) => void;
    sendTerminalResize: (cols: number, rows: number) => void;
    beforeSubmitEnter?: () => Promise<void>;
    afterSubmitEnter?: () => Promise<void>;
};

export type WorkspaceTerminalController = {
    available: boolean;
    started: boolean;
    starting: boolean;
    stopping: boolean;
    busy: boolean;
    inputEnabled: boolean;
    interactiveReady: boolean;
    disconnectedInputGuardActive: boolean;
    sessionId: string | null;
    state: RunSessionState | "idle";
    terminalFeed: TerminalChunk[];
    terminalEvidence: TerminalEvidence;
    /**
     * Synchronous terminal evidence getter.
     *
     * React state can lag behind a just-entered command. Submit-time checks use
     * this getter so the visible terminal transcript, not a stale render, is the
     * source of truth.
     */
    getTerminalEvidenceNow: () => TerminalEvidence;
    syncStatus: "idle" | "pushing" | "pulling" | "error";
    recoverState: TerminalRecoverState;
    recoverMessage: string | null;
    restarting: boolean;
    connectionState: TerminalConnectionState;
    socketReadyState: number | null;
    lastSocketMessageAt: number | null;

    open: (options?: { userInitiated?: boolean }) => Promise<void>;
    stop: () => Promise<void>;
    reset: () => void;
    restart: () => Promise<void>;
    handleDisconnectedInputAttempt: () => Promise<void>;

    sendData: (data: string) => void;
    resize: (cols: number, rows: number) => void;

    replaceFiles: (files: WorkspaceSyncEntry[]) => Promise<boolean>;
    snapshotFiles: () => Promise<WorkspaceSyncEntry[]>;
    syncWorkspaceNow: () => Promise<boolean>;
    beforeSubmitEnter: () => Promise<void>;
    afterSubmitEnter: () => Promise<void>;
};

export function createTerminalEvidence(cwd?: string): TerminalEvidence {
    return {
        commands: [],
        outputText: "",
        ...(typeof cwd === "string" && cwd.trim() ? { cwd: cwd.trim() } : {}),
    };
}

export function appendTerminalEvidenceCommand(
    evidence: TerminalEvidence,
    command: string,
    cwd?: string,
): TerminalEvidence {
    const trimmed = String(command ?? "").trim();
    const commands = trimmed
        ? [...(evidence.commands ?? []), trimmed].slice(-MAX_TERMINAL_EVIDENCE_COMMANDS)
        : [...(evidence.commands ?? [])];

    return {
        ...evidence,
        commands,
        ...(typeof cwd === "string" && cwd.trim()
            ? { cwd: cwd.trim() }
            : evidence.cwd
                ? { cwd: evidence.cwd }
                : {}),
    };
}

export function appendTerminalEvidenceOutput(
    evidence: TerminalEvidence,
    chunk: string,
): TerminalEvidence {
    const combined = `${evidence.outputText ?? ""}${String(chunk ?? "")}`;
    const outputText =
        combined.length > MAX_TERMINAL_EVIDENCE_OUTPUT_CHARS
            ? combined.slice(-MAX_TERMINAL_EVIDENCE_OUTPUT_CHARS)
            : combined;

    return {
        ...evidence,
        outputText,
    };
}

export function createDisconnectedTerminalRecovery(
    message = "Terminal session is disconnected.",
): {
    state: TerminalRecoverState;
    message: string;
} {
    return {
        state: "restart_available",
        message,
    };
}
export function isTerminalActuallyInteractive(args: {
    inputEnabled: boolean;
    sessionId: string | null;
    socketReadyState?: number | null;
    connectionState?: TerminalConnectionState;
    restarting?: boolean;
    stopping?: boolean;
    recoverState?: TerminalRecoverState;
}) {
    /**
     * Do not require socketReadyState === OPEN here.
     *
     * In practice the PTY can already be running and accepting input while
     * React/useRunSession socket bookkeeping is briefly stale. If we require
     * socket OPEN, the UI shows a live prompt but blocks typing forever.
     *
     * Real disconnects are handled by:
     * - start failure events
     * - timeout/final session events
     * - exit/error events
     * - sendInput() failure
     */
    return Boolean(
        args.inputEnabled &&
        args.sessionId &&
        !args.restarting &&
        !args.stopping &&
        args.recoverState === "none",
    );
}

export function shouldProbeTerminalOnVisibilityRestore(args: {
    sessionId: string | null;
    socketReadyState: number | null;
    lastSocketMessageAt: number | null;
    started?: boolean;
    starting?: boolean;
    now: number;
}) {
    const hasActiveTerminal =
        Boolean(args.sessionId) || args.started === true || args.starting === true;

    if (!hasActiveTerminal) return false;
    if (args.socketReadyState !== 1) return true;
    if (args.lastSocketMessageAt == null) return false;

    return args.now - args.lastSocketMessageAt > TERMINAL_SOCKET_STALE_MS;
}

export function reuseInFlightPromise<T>(
    ref: { current: Promise<T> | null },
    factory: () => Promise<T>,
) {
    if (ref.current) {
        return ref.current;
    }

    const run = (async () => {
        try {
            return await factory();
        } finally {
            ref.current = null;
        }
    })();

    ref.current = run;
    return run;
}

export type CodeRunnerController = {
    backend: RunnerBackend;
    runtime: ResolvedCodeRunnerRuntime;

    busy: boolean;
    runState: RunnerState;
    canCancel: boolean;
    cancelRun: () => Promise<void> | void;

    lastResult: RunnerLastResult;
    lastRunLanguage: RunnerLanguage | null;

    resetTerminal: () => void;
    startRun: () => Promise<void>;

    transcript: TranscriptState | null;
    stream: StreamState | null;
};

function normalizeTerminalKeyPart(value: string | null | undefined) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isDirectScopedKey(value: string) {
    return value.length > 0 && !value.includes("::");
}

function isTopicOrModuleHistoryScopeKey(value: string) {
    if (!isDirectScopedKey(value) || value.startsWith("project:")) {
        return false;
    }

    const segments = value.split(":").filter(Boolean);
    return segments.length >= 2 && segments.length <= 3;
}

function deriveTopicScopedKeyFromExerciseStateKey(exerciseStateKey: string) {
    const segments = exerciseStateKey.split(":").filter(Boolean);

    if (segments.length >= 4) {
        return [segments[0], segments[1], segments[3]].join(":");
    }

    if (segments.length >= 2) {
        return segments.slice(0, segments.length - 1).join(":");
    }

    return undefined;
}

function deriveModuleScopedKeyFromExerciseStateKey(exerciseStateKey: string) {
    const segments = exerciseStateKey.split(":").filter(Boolean);

    if (segments.length >= 2) {
        return [segments[0], segments[1]].join(":");
    }

    return undefined;
}

export function resolveTerminalWorkspaceKey(args: {
    exerciseStateKey?: string | null;
    terminalHistoryScopeKey?: string | null;
    projectId?: string | null;
    terminalSessionScope?: TerminalSessionScope;
    terminalCwd?: string | null;
}): string | undefined {
    const exerciseStateKey = normalizeTerminalKeyPart(args.exerciseStateKey);
    const terminalHistoryScopeKey = normalizeTerminalKeyPart(args.terminalHistoryScopeKey);
    const projectId = normalizeTerminalKeyPart(args.projectId);
    const terminalCwd = normalizeTerminalKeyPart(args.terminalCwd);
    const scope = args.terminalSessionScope ?? "exercise";
    const projectKey = projectId ? `project:${projectId}` : "";

    const withTerminalCwd = (base: string | undefined) => {
        if (!base) return undefined;
        return terminalCwd ? `${base}::cwd:${terminalCwd}` : base;
    };

    if (scope === "project") {
        return withTerminalCwd(projectKey || terminalHistoryScopeKey || exerciseStateKey || undefined);
    }

    if (scope === "exercise") {
        return withTerminalCwd(exerciseStateKey || projectKey || terminalHistoryScopeKey || undefined);
    }

    if (scope === "module") {
        const moduleScopedKey = exerciseStateKey
            ? deriveModuleScopedKeyFromExerciseStateKey(exerciseStateKey)
            : undefined;

        if (moduleScopedKey) {
            return withTerminalCwd(moduleScopedKey);
        }

        return withTerminalCwd(terminalHistoryScopeKey || exerciseStateKey || projectKey || undefined);
    }

    if (scope === "topic") {
        if (isTopicOrModuleHistoryScopeKey(terminalHistoryScopeKey)) {
            return withTerminalCwd(terminalHistoryScopeKey);
        }

        const topicScopedKey = exerciseStateKey
            ? deriveTopicScopedKeyFromExerciseStateKey(exerciseStateKey)
            : undefined;

        if (topicScopedKey) {
            return withTerminalCwd(topicScopedKey);
        }

        return withTerminalCwd(exerciseStateKey || terminalHistoryScopeKey || projectKey || undefined);
    }

    return withTerminalCwd(exerciseStateKey || projectKey || terminalHistoryScopeKey || undefined);
}

export function buildTerminalAutoOpenKey(args: {
    workspaceKey?: string | null;
    exerciseStateKey?: string | null;
    projectId?: string | null;
    cwd?: string | null;
}) {
    return [
        normalizeTerminalKeyPart(args.workspaceKey) ||
        normalizeTerminalKeyPart(args.exerciseStateKey) ||
        "workspace",
        normalizeTerminalKeyPart(args.projectId),
        normalizeTerminalKeyPart(args.cwd),
    ].join("::");
}

export function resolveSurfaceKind(controller: CodeRunnerController): SurfaceKind {
    if (controller.backend === "sql") return "sql";
    if (controller.backend === "judge0") return "terminal-pane";
    return controller.runtime.terminalView === "plain" ? "plain" : "xterm";
}
