import type { FileEntry, WorkspaceLanguage as CodeWorkspaceLanguage } from "@zoeskoul/code-contracts";

export type WorkspaceLanguage = CodeWorkspaceLanguage | "typescript" | (string & {});

export type Difficulty = "easy" | "medium" | "hard";

export type ExerciseKind =
    | "single_choice"
    | "multi_choice"
    | "numeric"
    | "vector_drag_target"
    | "vector_drag_dot"
    | "matrix_input"
    | "code_input"
    | "pseudocode_input"
    | "text_input"
    | "drag_reorder"
    | "voice_input"
    | "word_bank_arrange"
    | "listen_build"
    | "fill_blank_choice";

export type SqlDialect = "postgres" | "mysql" | "sqlite" | "mssql";
export const DEFAULT_SQL_DIALECT: SqlDialect = "sqlite";

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


export type TopicSlug = string;
export type PracticeKind = ExerciseKind;
export type CodeInputSurface = "auto" | "embedded" | "workspace";
export type CodeInputUiSpec = {
  codeSurface?: CodeInputSurface;
  embedded?: boolean;
  embeddedCodeInput?: boolean;
  [key: string]: unknown;
};
export type TerminalEvidence = {
  commands: string[];
  outputText: string;
  cwd?: string;
};
export type Exercise = {
  id: string;
  topic: TopicSlug;
  difficulty: Difficulty;
  title: string;
  prompt: string;
  kind: ExerciseKind;
  language?: WorkspaceLanguage;
  options?: { id: string; text: string }[];
  tolerance?: number;
  codeSurface?: CodeInputSurface;
  embedded?: boolean;
  embeddedCodeInput?: boolean;
  ui?: unknown;
  starterStdin?: string;
  terminalEvidence?: TerminalEvidence;
  [key: string]: unknown;
};
export type ValidateResponse = {
  ok: boolean;
  expected: unknown;
  explanation?: string | null;
  feedback?: unknown;
  finalized?: boolean;
  [key: string]: unknown;
};
export type QItem = {
  key: string;
  exercise: Exercise;
  single: string;
  multi: string[];
  num: string;
  dragA: Vec3;
  dragB: Vec3;
  matRows: number;
  matCols: number;
  mat: string[][];
  result: ValidateResponse | null;
  submitted: boolean;
  attempts?: number;
  code: string;
  codeLang: WorkspaceLanguage;
  codeStdin: string;
  stdin?: string;
  terminalEvidence?: TerminalEvidence;
  text: string;
  reorder?: string[];
  reorderIds?: string[];
  feedbackDismissed?: boolean;
  voiceTranscript: string;
  voiceAudioId?: string;
  help: unknown;
  ui?: Record<string, unknown>;
  revealed?: boolean;
  finalizedActionConsumed?: boolean;
  codeRunOutput?: string;
  [key: string]: unknown;
};

export type SubmitAnswer =
  | { kind: "single_choice"; optionId: string }
  | { kind: "multi_choice"; optionIds: string[] }
  | { kind: "numeric"; value: number }
  | { kind: "vector_drag_target"; a: Vec3; b: Vec3 }
  | { kind: "vector_drag_dot"; a: Vec3 }
  | { kind: "matrix_input"; values: number[][] }
  | { kind: "code_input"; language?: WorkspaceLanguage; code: string; stdin?: string; terminalEvidence?: TerminalEvidence; entry?: string; files?: Array<FileEntry | { kind: "directory"; path: string }> }
  | { kind: "text_input"; value: string }
  | { kind: "drag_reorder"; tokenIds?: string[]; order?: string[] }
  | { kind: "voice_input"; transcript: string; audioUrl?: string; audioId?: string }
  | { kind: "word_bank_arrange" | "listen_build" | "fill_blank_choice"; value: string };
export * from "./publicChallenges.js";
export * from "./practicePurposeDefaults.js";
