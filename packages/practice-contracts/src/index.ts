import type { WorkspaceLanguage } from "@zoeskoul/code-contracts";

export type Difficulty = "easy" | "medium" | "hard";

export type ExerciseKind =
    | "single_choice"
    | "multi_choice"
    | "numeric"
    | "vector_drag_target"
    | "vector_drag_dot"
    | "matrix_input"
    | "code_input"
    | "text_input"
    | "drag_reorder"
    | "voice_input"
    | "word_bank_arrange"
    | "listen_build"
    | "fill_blank_choice";

export type SqlDialect = "postgres" | "mysql" | "sqlite" | "mssql";

export type Vec3 = { x: number; y: number; z?: number };

export type ExerciseHelpSpec = Partial<Record<string, string>>;

export type SqlRuntimeSpec = {
    kind: "sql";
    datasetId?: string;
    resultShape?: "table";
};

export type TerminalExpectedExample = {
    kind: "terminal";
    meta?: string;
    stdin?: string;
    stdout: string;
};

export type SqlResultExpectedExample = {
    kind: "sql_result";
    meta?: string;
    columns: string[];
    rows: Array<Array<string | number | null>>;
};

export type CodeExpectedExample =
    | TerminalExpectedExample
    | SqlResultExpectedExample;

export type { WorkspaceLanguage };