export type TryItPlacement = "first_sketch" | "all_sketches" | "none";
export type PracticeRuntimeMode =
    | "terminal_workspace"
    | "editor_workspace"
    | "sql_workspace";
export type TerminalSessionScope = "exercise" | "topic" | "project";

export type PracticeConfig = {
    tryIt?: boolean;
    requiresTryIt?: boolean;
    conceptualOnly?: boolean;
    tryItPlacement?: TryItPlacement;
    tryItSketchIndex?: number;
    tryItExerciseId?: string;
    tryItExerciseIds?: string[];
    runtimeMode?: PracticeRuntimeMode;
    expectedPracticeKinds?: string[];
    terminalSessionScope?: TerminalSessionScope;
    projectFlow?: "standalone" | "progressive";
};
