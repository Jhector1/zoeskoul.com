import type { RefObject } from "react";
import type {
    RunSessionState,
    RunnerLanguage,
    WorkspaceSyncEntry,
} from "@zoeskoul/code-contracts";
import type { RunResult } from "@/lib/code/types";
import type { BatchRunResult } from "@/lib/code/types/batch";
import type { SqlDialect } from "@/lib/practice/types";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { OnRun, RunnerState, TermLine } from "./types";

export type { WorkspaceSyncEntry };

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
    busy: boolean;
    inputEnabled: boolean;
    sessionId: string | null;
    state: RunSessionState | "idle";
    terminalFeed: TerminalChunk[];
    syncStatus: "idle" | "pushing" | "pulling" | "error";

    open: () => Promise<void>;
    stop: () => Promise<void>;
    reset: () => void;

    sendData: (data: string) => void;
    resize: (cols: number, rows: number) => void;

    replaceFiles: (files: WorkspaceSyncEntry[]) => Promise<boolean>;
    snapshotFiles: () => Promise<WorkspaceSyncEntry[]>;
    beforeSubmitEnter: () => Promise<void>;
    afterSubmitEnter: () => Promise<void>;
};

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
}): string | undefined {
    const exerciseStateKey = normalizeTerminalKeyPart(args.exerciseStateKey);
    const terminalHistoryScopeKey = normalizeTerminalKeyPart(args.terminalHistoryScopeKey);
    const projectId = normalizeTerminalKeyPart(args.projectId);
    const scope = args.terminalSessionScope ?? "exercise";
    const projectKey = projectId ? `project:${projectId}` : "";

    if (scope === "project") {
        return projectKey || terminalHistoryScopeKey || exerciseStateKey || undefined;
    }

    if (scope === "exercise") {
        return exerciseStateKey || projectKey || terminalHistoryScopeKey || undefined;
    }

    if (scope === "module") {
        const moduleScopedKey = exerciseStateKey
            ? deriveModuleScopedKeyFromExerciseStateKey(exerciseStateKey)
            : undefined;

        if (moduleScopedKey) {
            return moduleScopedKey;
        }

        return terminalHistoryScopeKey || exerciseStateKey || projectKey || undefined;
    }

    if (scope === "topic") {
        if (isTopicOrModuleHistoryScopeKey(terminalHistoryScopeKey)) {
            return terminalHistoryScopeKey;
        }

        const topicScopedKey = exerciseStateKey
            ? deriveTopicScopedKeyFromExerciseStateKey(exerciseStateKey)
            : undefined;

        if (topicScopedKey) {
            return topicScopedKey;
        }

        return exerciseStateKey || terminalHistoryScopeKey || projectKey || undefined;
    }

    return exerciseStateKey || projectKey || terminalHistoryScopeKey || undefined;
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
