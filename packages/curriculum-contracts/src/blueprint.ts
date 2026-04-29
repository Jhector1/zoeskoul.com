import type { LocaleCode } from "./locales.js";
import type { ManifestIdeServiceConfig } from "./ide-services.js";

export type CourseProfileId =
    | "sql"
    | "python"
    | "math"
    | "language"
    | "web"
    | "data_science";

export type BlueprintRuntimePolicy = {
  sqlDialect?: string;
  datasetStrategy?: "module_based" | "topic_based" | "manual";
  datasetId?: string;
  preferredDatasetId?: string;
  resultShape?: string;
  moduleDatasetIds?: Record<string, string>;
};

export type CourseBlueprint = {
  subjectSlug: string;
  catalogSlug?: string;
  profileId: CourseProfileId;
  sourceLocale: "en";
  targetLocales: LocaleCode[];
  title: string;
  description?: string;
  level: "beginner" | "intermediate" | "advanced";
  audience: string[];
  goals: string[];
  teachingStyle?: {
    tone?: string;
    quizWeight?: number;
    projectWeight?: number;
    codeInputWeight?: number;
  };
  constraints: {
    moduleCount: number;
    topicsPerModuleMin: number;
    topicsPerModuleMax: number;
  };
  seedModules?: string[];
  runtimePolicy?: BlueprintRuntimePolicy;
  idePolicy?: {
    defaultServices?: ManifestIdeServiceConfig;
    moduleServiceDefaults?: Record<string, ManifestIdeServiceConfig>;
  };
};
