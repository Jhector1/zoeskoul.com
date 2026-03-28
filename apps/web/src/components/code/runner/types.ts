import type { RunResult } from "@/lib/code/types";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import {CodeRunnerRuntime} from "@/components/code/runner/runtime";

export type TerminalDock = "bottom" | "right";

export type TermLine =
    | { type: "sys"; text: string; runId?: number }
    | { type: "out"; text: string; runId?: number }
    | { type: "in"; text: string; runId?: number }
    | { type: "err"; text: string; runId?: number };

export type OnRunArgs =
    | {
    language: Exclude<CodeLanguage, "sql">;
    code: string;
    stdin: string;
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
    signal?: AbortSignal;
};

export type OnRun = (args: OnRunArgs) => Promise<RunResult>;

export type ControlledProps = {
    language: CodeLanguage;
    onChangeLanguage: (l: CodeLanguage) => void;

    code: string;
    onChangeCode: (code: string) => void;

    sqlDialect?: SqlDialect;
    onChangeSqlDialect?: (d: SqlDialect) => void;

    terminalDock?: TerminalDock;
    onChangeTerminalDock?: (d: TerminalDock) => void;
};

export type UncontrolledProps = {
    initialLanguage?: CodeLanguage;
    initialCode?: string;

    initialSqlDialect?: SqlDialect;

    initialTerminalDock?: TerminalDock;
    initialTerminalSize?: number;
};

export type CodeRunnerFrame = "card" | "plain";
//
export type RunnerState =
    | "idle"
    | "starting"
    | "running"
    | "awaiting_input"
    | "canceling";
type BeforeRunFn = () => void | Promise<void>;
export type CommonProps = {
    runtime?: CodeRunnerRuntime;
    language?: CodeLanguage;
    code?: string;
    stdin?: string;
    isAuthenticated?: boolean;

    title?: string;
    height?: number | "auto";
    frame?: CodeRunnerFrame;
    className?: string;
    hintMarkdown?: string;
    editorModelKey?: string;

    /**
     * Preserve the current editor contents when switching languages,
     * including the empty string.
     *
     * DEFAULT_CODE should only be used on first mount or explicit Reset.
     */
    preserveCodeOnLanguageSwitch?: boolean;

    showHeaderBar?: boolean;
    showEditor?: boolean;
    showTerminal?: boolean;
    showHint?: boolean;

    fixedLanguage?: CodeLanguage;
    allowedLanguages?: CodeLanguage[];
    showLanguagePicker?: boolean;

    fixedSqlDialect?: SqlDialect;
    allowedSqlDialects?: SqlDialect[];
    showSqlDialectPicker?: boolean;

    sqlSchemaSql?: string;
    sqlSeedSql?: string;

    sqlSetupSql?: string;

    sqlDatasetId?: string;

    allowReset?: boolean;
    allowRun?: boolean;
    disabled?: boolean;

    resetTerminalOnRun?: boolean;

    fixedTerminalDock?: TerminalDock;

    showEditorThemeToggle?: boolean;
    showTerminalDockToggle?: boolean;
    onBeforeRun?:BeforeRunFn;
    onRun?: OnRun;
};

export type CodeRunnerProps =
    | (CommonProps & ControlledProps)
    | (CommonProps & UncontrolledProps);

export function isControlled(
    p: CodeRunnerProps,
): p is CommonProps & ControlledProps {
    return (p as any).code !== undefined && typeof (p as any).onChangeCode === "function";
}



// export type ExecutionBackend = "pty" | "judge0";
// export type TerminalView = "plain" | "xterm" | "auto";
//
// export type CodeRunnerRuntime = {
//     backend: ExecutionBackend;
//     terminalView?: TerminalView;
// };

// export type TerminalChunk = {
//     id: number;
//     kind: "pty" | "err" | "sys";
//     data: string;
// // };
//
// export type RunnerState =
//     | "idle"
//     | "starting"
//     | "running"
//     | "awaiting_input"
//     | "canceling";
//
// export type RunnerController = {
//     terminalFeed: TerminalChunk[];
//     inputEnabled: boolean;
//     busy: boolean;
//     runState: RunnerState;
//     lastResult: any | null;
//     lastRunLanguage: string | null;
//
//     startRun: () => Promise<void>;
//     cancelRun: () => Promise<void> | void;
//     resetTerminal: () => void;
//
//     sendTerminalData: (data: string) => void;
//     sendTerminalResize: (cols: number, rows: number) => void;
// };