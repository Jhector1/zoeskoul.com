import type { ManifestIdeServiceConfig } from "./ide-services.js";
import type {
  HiddenShellCheck,
  SemanticCheck,
  TerminalExpectations,
} from "@zoeskoul/practice-checks";
import type { WorkspaceExpectations } from "./workspace-path.js";
import type { ToolPresentationPolicy } from "./tool-presentation.js";

export type ExerciseKind =
  | "single_choice"
  | "multi_choice"
  | "drag_reorder"
  | "fill_blank_choice"
  | "code_input";

export type SqlDialect = "sqlite" | "postgres" | "mysql" | "mssql";
export type WorkspaceLanguage =
  | "sql"
  | "python"
  | "java"
  | "javascript"
  | "c"
  | "cpp"
  | "bash"
  | "web"
  | (string & {});

export type ManifestFileActions = {
  enabled?: boolean;
  createFile?: boolean;
  createFolder?: boolean;
  rename?: boolean;
  delete?: boolean;
  dragDrop?: boolean;
};

export type ManifestSqlRuntimeDefaults = {
  kind: "sql";
  datasetId?: string;
  fixedSqlDialect?: SqlDialect;
  resultShape?: "table";
  showSchema?: boolean;
  showErd?: boolean;
  showChen?: boolean;
  supportsTerminal?: boolean;
  supportsMultiFile?: boolean;
  supportsFileSystem?: boolean;
  fileActions?: ManifestFileActions;
};

export type ManifestCodeRuntimeDefaults = {
  kind: "code";
  language?: Exclude<WorkspaceLanguage, "sql">;
  supportsTerminal?: boolean;
  supportsMultiFile?: boolean;
  supportsFileSystem?: boolean;
  supportsStdInStdOut?: boolean;
  supportsPackageInstall?: boolean;
  fileActions?: ManifestFileActions;
};

export type ManifestRuntimeDefaults =
  | ManifestSqlRuntimeDefaults
  | ManifestCodeRuntimeDefaults;

export type ManifestProjectStep = {
  id: string;
  titleKey: string;
  exerciseKey: string;
  difficulty?: "easy" | "medium" | "hard";
  preferKind?: ExerciseKind | null;
  seedPolicy?: "global" | "step";
  maxAttempts?: number | null;
  carryFromPrev?: boolean;
};

export type ManifestEmbeddedTryIt = {
  id: string;
  titleKey: string;
  promptKey: string;
  exerciseKey: string;
  difficulty?: "easy" | "medium" | "hard";
  preferKind?: ExerciseKind | null;
  seedPolicy?: "global" | "step";
  required?: boolean;
  allowReveal?: boolean;
  maxAttempts?: number | null;
};

export type ManifestCard =
  | {
      id: string;
      kind: "sketch";
      titleKey: string;
      sketchId: string;
      height?: number;
      tools?: ToolPresentationPolicy;
      tryIt?: ManifestEmbeddedTryIt;
    }
  | {
      id: string;
      kind: "quiz";
      titleKey: string;
      tools?: ToolPresentationPolicy;
  quiz: {
    difficulty: "easy" | "medium" | "hard";
    n: number;
    min?: number;
    max?: number;
    selectionMode?: "random" | "fixed";
    allowReveal?: boolean;
    preferKind?: ExerciseKind | null;
    maxAttempts?: number | null;
  };
    }
  | {
      id: string;
      kind: "project";
      titleKey: string;
      tools?: ToolPresentationPolicy;
      tryIt?: boolean;
  project: {
    difficulty: "easy" | "medium" | "hard";
    allowReveal?: boolean;
    preferKind?: ExerciseKind | null;
    maxAttempts?: number | null;
    tryIt?: boolean;
    displayKind?: string;
    uiKind?: string;
    steps: ManifestProjectStep[];
  };
    };

export type ManifestSketch =
  | {
      id: string;
      archetype: "paragraph";
      titleKey: string;
      bodyKey: string;
      runtime?: ManifestRuntimeDefaults | null;
      images?: Array<{
        id: string;
        publicId: string;
        alt?: string;
        width?: number;
        height?: number;
      }>;
    }
  | {
      id: string;
      archetype: "image";
      titleKey: string;
      src?: string;
      publicId?: string;
      altKey?: string;
      captionKey?: string;
      runtime?: ManifestRuntimeDefaults | null;
      aspectRatio?: number;
      markers?: Array<{
        id: string;
        x: number;
        y: number;
        labelKey: string;
      }>;
      initialZoom?: number;
      minZoom?: number;
      maxZoom?: number;
      zoomStep?: number;
      allowPan?: boolean;
      allowWheelZoom?: boolean;
      allowDoubleClickReset?: boolean;
      showControls?: boolean;
    };

export type ManifestBaseExercise = {
  id: string;
  kind: ExerciseKind;
  purpose?: "quiz" | "project" | "try_it" | "practice" | "capstone";
  weight?: number;
  messageBase: string;
  runtime?: ManifestRuntimeDefaults | null;
  serviceOverrides?: ManifestIdeServiceConfig | null;
  /** Exercise-level Tools presentation override. */
  tools?: ToolPresentationPolicy;
};

export type ManifestSingleChoice = ManifestBaseExercise & {
  kind: "single_choice";
  optionIds: string[];
  expected: { kind: "single_choice"; optionId: string };
};

export type ManifestMultiChoice = ManifestBaseExercise & {
  kind: "multi_choice";
  optionIds: string[];
  expected: { kind: "multi_choice"; optionIds: string[] };
};

export type ManifestDragReorder = ManifestBaseExercise & {
  kind: "drag_reorder";
  tokenIds: string[];
  expected: { kind: "drag_reorder"; tokenIds: string[] };
};

export type ManifestFillBlankChoice = ManifestBaseExercise & {
  kind: "fill_blank_choice";
  choiceCount: number;
  expected: { kind: "fill_blank_choice"; value: string };
};

export type ManifestVarSpec =
  | { source: "int"; min: number; max: number }
  | { source: "pick"; from: string[] }
  | { source: "pickDifferentFromVar"; from: string[]; var: string }
  | { source: "intDifferentFromVar"; min: number; max: number; var: string };

export type ManifestComputedSpec =
  | { op: "add"; left: string; right: number }
  | { op: "sub"; left: string; right: number }
  | { op: "mul"; left: string; right: number }
  | { op: "floor_div"; left: string; right: number }
  | { op: "c_to_f_int"; left: string }
  | { op: "mul_div_floor"; left: string; right: string; divisor: number };

export type ManifestSqlExpectedTable = {
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};

export type ManifestSqlQueryTest = {
  kind?: "sql";
  sqlDialect?: SqlDialect;
  compareTo?: "solution" | "expected_table";
  expectedTable?: ManifestSqlExpectedTable;
  match?: "table_exact";
  ignoreRowOrder?: boolean;
  checkSql?: string;
};

export type ManifestFileFixture = {
  /**
   * Workspace-relative POSIX file path.
   *
   * Supports nested folders:
   * - "data/input.txt"
   * - "fixtures/students.csv"
   * - "tests/cases/case1.txt"
   *
   * The online editor creates folders implied by the path.
   * Do not use absolute paths, backslashes, drive letters, "..", or empty segments.
   */
  path: string;

  content: string;
  readOnly?: boolean;
};

export type ManifestWorkspaceExpectations = WorkspaceExpectations;

export type ManifestRecipe =
  | {
      type: "fixed_tests";
      tests: Array<{
        stdin?: string;
        stdout: string;
        match?: "exact" | "includes";
        files?: ManifestFileFixture[];
      }>;
      solutionCode?: string;
      solutionFiles?: ManifestStarterFiles;
      sourceChecks?: unknown[];
    }
  | {
      type: "sql_query";
      datasetId?: string;
      solutionCode: string;
      solutionFiles?: ManifestStarterFiles;
      /** Ordered SQL file execution paths used to build solutionCode and learner submissions. */
      sqlFileOrder?: string[];
      checkSql?: string;
      resultShape?: "table";
      ignoreRowOrder?: boolean;
      tests?: ManifestSqlQueryTest[];
    }
  | {
      type: "template_io";
      vars: Record<string, ManifestVarSpec>;
      computed?: Record<string, ManifestComputedSpec>;
      tests: Array<{
        stdinTemplate?: string;
        stdoutTemplate: string;
        match?: "exact" | "includes";
      }>;
      solutionTemplate?: string;
    }
  | {
      type: "semantic";
      language: Exclude<WorkspaceLanguage, "sql" | "bash" | "web">;
      solutionCode: string;
      solutionFiles?: ManifestStarterFiles;
      sourceChecks?: unknown[];
      semanticChecks: SemanticCheck[];
    }
  | {
      type: "shell_task";
      mode?: "terminal_workspace" | "stdout" | "workspace_and_stdout";
      instructions?: string;
    };

export type ManifestCodeInputExpectedExample =
  | boolean
  | { metaKey?: string };
export type ManifestStarterFile = {
  /**
   * Workspace-relative POSIX path.
   *
   * Supports nested folders by using "/" separators:
   * - "main.py"
   * - "src/main.py"
   * - "data/input.txt"
   * - "tests/test_main.py"
   *
   * Do not use absolute paths, drive letters, backslashes, "..", or empty segments.
   * The online editor will create folders implied by the path.
   */
  path?: string;

  /**
   * Backward-compatible single-file name.
   * Prefer `path` for all new authored content, especially nested folders.
   */
  name?: string;

  /** UTF-8 source content. Omit for binary files. */
  content?: string;
  /** Binary bytes encoded losslessly for workspace transport. */
  encoding?: "base64";
  data?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  language?: WorkspaceLanguage;
  isEntry?: boolean;

  /**
   * Backward-compatible alias used by older app-side starter file shapes.
   */
  entry?: boolean;
  /**
   * Marks support/fixture files as read-only in editor-capable runtimes.
   * Starter files may omit this or set false when learner-editable.
   */
  readOnly?: boolean;
};

export type ManifestStarterFiles =
/**
 * Preferred form. Use `path` for both root files and nested files.
 */
    | ManifestStarterFile[]

    /**
     * Compact form. Object keys are workspace-relative paths and may include folders.
     *
     * Example:
     * {
     *   "src/main.py": { content: "...", isEntry: true },
     *   "data/input.txt": "42\n"
     * }
     */
    | Record<
    string,
    | string
    | {
  content?: string;
  encoding?: "base64";
  data?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  language?: WorkspaceLanguage;
  isEntry?: boolean;
  entry?: boolean;
  readOnly?: boolean;

}
>;

export type ManifestWorkspaceSeed = {
  language?: WorkspaceLanguage;

  activeFileId?: string;
  entryFileId?: string;

  /**
   * Preferred entry file path when multiple files exist.
   * Supports nested paths such as "src/main.py".
   */
  entryFile?: string;
  entryPath?: string;
  entryFilePath?: string;

  mainFile?: string;
  mainFilePath?: string;

  /**
   * Open tabs are workspace-relative file paths.
   * Supports nested paths such as "src/main.py" and "data/input.txt".
   */
  openTabs?: string[];

  stdin?: string;

  /**
   * Optional single-entry starter code. For multi-file or nested-folder
   * exercises, prefer starterFiles and set entryFilePath explicitly.
   */
  starterCode?: string;

  /**
   * Learner-editable starter files. Paths may include folders.
   */
  starterFiles?: ManifestStarterFiles;

  /**
   * Runtime/support fixture files. Paths may include folders.
   * Use for provided data files, CSVs, helper text files, etc.
   */
  files?: ManifestStarterFiles;
  initialFiles?: ManifestStarterFiles;
  workspaceFiles?: ManifestStarterFiles;

  /**
   * Optional workspace submission contract for project-style exercises.
   * All paths must be safe workspace-relative POSIX paths.
   */
  workspaceExpectations?: ManifestWorkspaceExpectations;
};
export type ManifestCodeInput = ManifestBaseExercise & {
  kind: "code_input";
  language?: WorkspaceLanguage;
  fixedSqlDialect?: SqlDialect;
  runtime?: ManifestRuntimeDefaults | null;
  recipe: ManifestRecipe;
  showExpectedExample?: ManifestCodeInputExpectedExample;

  /**
   * Safe learner starter code for the editor.
   * Never use recipe.solutionCode as starter code.
   */
  starterCode?: string;

  starterFiles?: ManifestStarterFiles;
  solutionFiles?: ManifestStarterFiles;
  sourceChecks?: unknown[];
  workspaceExpectations?: ManifestWorkspaceExpectations;
  terminalExpectations?: TerminalExpectations;
  hiddenShellCheck?: HiddenShellCheck;
  workspace?: ManifestWorkspaceSeed | null;
};
export type ManifestExercise =
  | ManifestSingleChoice
  | ManifestMultiChoice
  | ManifestDragReorder
  | ManifestFillBlankChoice
  | ManifestCodeInput;

export type TopicBundleManifest = {
  topicId: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  prefix: string;
  minutes: number;
  topic: {
    labelKey: string;
    summaryKey: string;
  };
  serviceDefaults?: ManifestIdeServiceConfig | null;
  runtimeDefaults?: ManifestRuntimeDefaults | null;
  /** Effective policy resolved through topic scope. */
  tools?: ToolPresentationPolicy;
  cards: ManifestCard[];
  sketches: ManifestSketch[];
  exercises: ManifestExercise[];
};
