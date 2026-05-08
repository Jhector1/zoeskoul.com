import type { ManifestIdeServiceConfig } from "./ide-services.js";
import type { SemanticCheck } from "@zoeskoul/practice-checks";

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
  | "web";

export type ManifestSqlRuntimeDefaults = {
  kind: "sql";
  datasetId?: string;
  fixedSqlDialect?: SqlDialect;
  resultShape?: "table";
};

export type ManifestCodeRuntimeDefaults = {
  kind: "code";
  language?: Exclude<WorkspaceLanguage, "sql">;
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
  maxAttempts?: number;
};

export type ManifestCard =
  | {
      id: string;
      kind: "sketch";
      titleKey: string;
      sketchId: string;
      height?: number;
    }
  | {
      id: string;
      kind: "quiz";
      titleKey: string;
      quiz: {
        difficulty: "easy" | "medium" | "hard";
        n: number;
        allowReveal?: boolean;
        preferKind?: ExerciseKind | null;
        maxAttempts?: number;
      };
    }
  | {
      id: string;
      kind: "project";
      titleKey: string;
      project: {
        difficulty: "easy" | "medium" | "hard";
        allowReveal?: boolean;
        preferKind?: ExerciseKind | null;
        maxAttempts?: number;
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
  purpose?: "quiz" | "project";
  weight?: number;
  messageBase: string;
  serviceOverrides?: ManifestIdeServiceConfig | null;
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

export type ManifestRecipe =
  | {
      type: "fixed_tests";
      tests: Array<{ stdin?: string; stdout: string; match?: "exact" | "includes" }>;
      solutionCode?: string;
    }
  | {
      type: "sql_query";
      datasetId?: string;
      solutionCode: string;
      checkSql?: string;
      resultShape?: "table";
      ignoreRowOrder?: boolean;
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
      semanticChecks: SemanticCheck[];
    };

export type ManifestCodeInputExpectedExample =
  | boolean
  | { metaKey?: string };

export type ManifestCodeInput = ManifestBaseExercise & {
  kind: "code_input";
  language?: WorkspaceLanguage;
  fixedSqlDialect?: SqlDialect;
  recipe: ManifestRecipe;
  showExpectedExample?: ManifestCodeInputExpectedExample;
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
  cards: ManifestCard[];
  sketches: ManifestSketch[];
  exercises: ManifestExercise[];
};
