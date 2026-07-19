import type { FileEntry, RunResult } from "@/lib/code/types";
import type {
    WorkspaceLanguage,
    SqlDialect,
    TerminalEvidence,
} from "@/lib/practice/types";
import { CodeRunnerRuntime } from "@/components/code/runner/runtime";
import { InteractiveLanguage } from "@zoeskoul/code-contracts";
import type { BinaryFileContent, WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type { ToolRunnerPanePolicy } from "@zoeskoul/curriculum-contracts";

export type TerminalDock = "bottom" | "right";

export type TermLine =
    | { type: "sys"; text: string; runId?: number }
    | { type: "out"; text: string; runId?: number }
    | { type: "in"; text: string; runId?: number }
    | { type: "err"; text: string; runId?: number };

export type OnRunArgs =
    | {
    language: InteractiveLanguage;
    code: string;
    stdin: string;
    entry?: string;
    files?: FileEntry[];
    captureWorkspace?: boolean;
    signal?: AbortSignal;
}
    | {
    language: "sql";
    code: string;
    stdin?: string;
    sqlDialect: SqlDialect;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    setupSql?: string;
    datasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
    signal?: AbortSignal;
};

export type OnRun = (args: OnRunArgs) => Promise<RunResult>;

export type ControlledProps = {
    language: WorkspaceLanguage;
    onChangeLanguage: (l: WorkspaceLanguage) => void;

    code: string;
    onChangeCode: (code: string) => void;

    sqlDialect?: SqlDialect;
    onChangeSqlDialect?: (d: SqlDialect) => void;

    terminalDock?: TerminalDock;
    onChangeTerminalDock?: (d: TerminalDock) => void;
};

export type UncontrolledProps = {
    initialLanguage?: WorkspaceLanguage;
    initialCode?: string;

    initialSqlDialect?: SqlDialect;

    initialTerminalDock?: TerminalDock;
    initialTerminalSize?: number;
};

export type CodeRunnerFrame = "card" | "plain";

export type RunnerState =
    | "idle"
    | "starting"
    | "running"
    | "awaiting_input"
    | "canceling";

type BeforeRunFn = () => void | Promise<void>;

export type CommonProps = {
    runtime?: CodeRunnerRuntime;
    language?: WorkspaceLanguage;
    editorLanguage?: string;
    code?: string;
    stdin?: string;
    isAuthenticated?: boolean;

    title?: string;
    height?: number | "auto";
    frame?: CodeRunnerFrame;
    className?: string;
    hintMarkdown?: string;
    editorModelKey?: string;
    toolScopeKey?: string;
    exerciseStateKey?: string;
    workspace?: WorkspaceStateV2 | null;
    activeWorkspaceFileId?: string;
    /** Binary files bypass Monaco and use a capability-specific read-only preview. */
    activeBinaryFile?: {
        name: string;
        binary: BinaryFileContent;
    } | null;
    /**
     * Increments whenever the learner explicitly selects a workspace file.
     * The file id alone cannot represent a second click on the active file.
     */
    workspaceFileSelectionVersion?: number;

    preserveCodeOnLanguageSwitch?: boolean;

    showHeaderBar?: boolean;
    showEditor?: boolean;
    showTerminal?: boolean;
    showHint?: boolean;

    fixedLanguage?: WorkspaceLanguage;
    allowedLanguages?: WorkspaceLanguage[];
    showLanguagePicker?: boolean;

    fixedSqlDialect?: SqlDialect;
    allowedSqlDialects?: SqlDialect[];
    showSqlDialectPicker?: boolean;

    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
    runnerPaneOptions?: ToolRunnerPanePolicy;

    allowReset?: boolean;
    allowRun?: boolean;
    disabled?: boolean;

    resetTerminalOnRun?: boolean;

    fixedTerminalDock?: TerminalDock;

    showEditorThemeToggle?: boolean;
    showTerminalDockToggle?: boolean;
    showOpenTerminalButton?: boolean;
    showRestartTerminalButton?: boolean;
    onBeforeRun?: BeforeRunFn;
    onRun?: OnRun;
    onTerminalEvidenceChange?: (evidence: TerminalEvidence) => void;
    onTerminalSyncReady?: (sync: (() => Promise<boolean>) | null) => void;
};

export type CodeRunnerProps =
    | (CommonProps & ControlledProps)
    | (CommonProps & UncontrolledProps);

export function isControlled(
    p: CodeRunnerProps,
): p is CommonProps & ControlledProps {
    return (p as any).code !== undefined && typeof (p as any).onChangeCode === "function";
}
