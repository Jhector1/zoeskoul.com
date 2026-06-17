import type { LocaleCode } from "./locales.js";
import type { ManifestIdeServiceConfig } from "./ide-services.js";
import {CourseGenerationPolicy, ModulePedagogyPolicy, TopicPedagogyPolicy, WorkspaceProfile} from "./workspace";
import {SqlDialect} from "./manifest";

export type BuiltinCourseProfileId =
    | "sql"
    | "python"
    | "math"
    | "language"
    | "web"
    | "data_science";

export type CourseProfileId = BuiltinCourseProfileId | (string & {});

export type CourseVersionStatus = "draft" | "active" | "legacy" | "disabled";

export type BlueprintRuntimePolicy = {
  datasetStrategy?: "module_based" | "topic_based" | "manual";
  datasetId?: string;
  preferredDatasetId?: string;
  moduleDatasetIds?: Record<string, string>;   sqlDialect?: SqlDialect;
  resultShape?: "table";
};
export type BlueprintModuleScheduleEntry = {
  moduleNumber: number;
  weekStart: number;
  weekEnd: number;
};
export type CourseBlueprint = {
  subjectSlug: string;
  courseSlug?: string;
  catalogSlug?: string;
  accessPolicy?: "free" | "paid";
  moduleAccessOverrideDefault?: "free" | "paid" | null;
  moduleSchedule?: BlueprintModuleScheduleEntry[];
  profileId: CourseProfileId;
  sourceLocale: "en";
  targetLocales: LocaleCode[];
  title: string;
  description?: string;
  /**
   * Optional stable course position from course.spec.json.
   * Catalog membership and catalog display order still come from
   * authoring/catalogs/*.catalog.json; this value is only a manifest/DB
   * fallback for surfaces that render subjects outside a catalog.
   */
  courseNumber?: number;
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
  versioning?: {
    family: string;
    version: number;
    status: CourseVersionStatus;
    defaultForNewEnrollments?: boolean;
    supersedes?: string | null;
    supersededBy?: string | null;
  };

  workspaceProfileId?: string;
  workspacePolicyId?: string;
  workspaceOverrides?: Partial<WorkspaceProfile>;

  courseGenerationPolicy?: CourseGenerationPolicy;

  modulePolicies?: ModulePedagogyPolicy[];
  topicPolicies?: Record<string, TopicPedagogyPolicy>;
};
