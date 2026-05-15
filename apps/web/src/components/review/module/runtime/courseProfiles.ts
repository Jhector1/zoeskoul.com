import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import {
  resolveSqlRunnerConfig,
  type ResolvedSqlRunnerConfig,
} from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
import {isUsableStarterCode} from "@/components/review/module/runtime/starterContent";

type UnknownRecord = Record<string, unknown>;

export type CourseProfileId = "python" | "sql" | "java" | "javascript" | "cpp" | "c" | "generic";

export type CourseProfile = {
  id: CourseProfileId;
  subjectSlug: string;
  defaultLanguage: WorkspaceLanguage;
  supportsRuntimeDefaultDataset: boolean;
};

export type RuntimeDatasetResolution = {
  datasetId?: string;
  source: "exercise" | "sketch" | "target" | "topic" | "module" | "runtime-default" | "none";
  error?: string;
};

export type FileSeed = {
  starterFiles?: unknown;
  solutionFiles?: unknown;
  starterCode?: string;
  solutionCode?: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanLanguage(value: unknown): WorkspaceLanguage | undefined {
  const raw = cleanString(value)?.toLowerCase();
  if (!raw) return undefined;
  if (raw === "py") return "python" as WorkspaceLanguage;
  if (raw === "js") return "javascript" as WorkspaceLanguage;
  if (raw === "ts") return "typescript" as WorkspaceLanguage;
  return raw as WorkspaceLanguage;
}

export function getCourseProfile(args: {
  subjectSlug?: string | null;
  language?: string | null;
}): CourseProfile {
  const subjectSlug = cleanString(args.subjectSlug)?.toLowerCase() ?? "";
  const explicitLanguage = cleanLanguage(args.language);

  switch (subjectSlug) {
    case "sql":
      return {
        id: "sql",
        subjectSlug,
        defaultLanguage: "sql" as WorkspaceLanguage,
        supportsRuntimeDefaultDataset: true,
      };
    case "java":
      return {
        id: "java",
        subjectSlug,
        defaultLanguage: "java" as WorkspaceLanguage,
        supportsRuntimeDefaultDataset: false,
      };
    case "javascript":
      return {
        id: "javascript",
        subjectSlug,
        defaultLanguage: "javascript" as WorkspaceLanguage,
        supportsRuntimeDefaultDataset: false,
      };
    case "c":
      return {
        id: "c",
        subjectSlug,
        defaultLanguage: "c" as WorkspaceLanguage,
        supportsRuntimeDefaultDataset: false,
      };
    case "cpp":
      return {
        id: "cpp",
        subjectSlug,
        defaultLanguage: "cpp" as WorkspaceLanguage,
        supportsRuntimeDefaultDataset: false,
      };
    case "python":
    case "python-for-beginners":
      return {
        id: "python",
        subjectSlug,
        defaultLanguage: "python" as WorkspaceLanguage,
        supportsRuntimeDefaultDataset: false,
      };
    default:
      return {
        id: "generic",
        subjectSlug,
        defaultLanguage: explicitLanguage ?? ("python" as WorkspaceLanguage),
        supportsRuntimeDefaultDataset: false,
      };
  }
}

export function resolveCourseLanguage(args: {
  subjectSlug?: string | null;
  language?: string | null;
  runtimeDefaults?: UnknownRecord | null;
  target?: unknown;
}): WorkspaceLanguage {
  const profile = getCourseProfile({
    subjectSlug: args.subjectSlug,
    language: args.language,
  });
  const targetRecord = isRecord(args.target) ? args.target : null;
  const target = isRecord(targetRecord?.spec)
    ? targetRecord.spec
    : targetRecord ?? {};
  const runtime = isRecord(target.runtime) ? target.runtime : {};
  const workspace = isRecord(target.workspace) ? target.workspace : {};
  const recipe = isRecord(target.recipe) ? target.recipe : {};

  return (
    cleanLanguage(target.language) ??
    cleanLanguage(target.lang) ??
    cleanLanguage(workspace.language) ??
    cleanLanguage(recipe.language) ??
    cleanLanguage(runtime.language) ??
    cleanLanguage(args.runtimeDefaults?.language) ??
    cleanLanguage(args.runtimeDefaults?.lang) ??
    profile.defaultLanguage
  );
}

function firstFiles(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
    if (isRecord(value) && Object.keys(value).length) return value;
  }
  return undefined;
}

function firstCode(...values: unknown[]) {
  for (const value of values) {
    if (isUsableStarterCode(value)) return value;
  }
  return undefined;
}
/**
 * Shared, non-dataset file seed resolver.
 *
 * This is intentionally course-agnostic. Python, Java, SQL, and future runtimes
 * may all define starter/support files. SQL datasets are not resolved here.
 */
export function resolveFileSeed(target: unknown): FileSeed {
  const targetRecord = isRecord(target) ? target : null;
  const source = isRecord(targetRecord?.spec) ? targetRecord.spec : target;
  if (!isRecord(source)) return {};

  const workspace = isRecord(source.workspace) ? source.workspace : {};
  const recipe = isRecord(source.recipe) ? source.recipe : {};

  return {
    starterFiles: firstFiles(
      workspace.starterFiles,
      workspace.files,
      workspace.initialFiles,
      workspace.workspaceFiles,
      source.starterFiles,
      source.files,
      source.initialFiles,
      source.workspaceFiles,
      recipe.starterFiles,
      recipe.files,
      recipe.initialFiles,
    ),
    solutionFiles: firstFiles(
      workspace.solutionFiles,
      source.solutionFiles,
      recipe.solutionFiles,
    ),
    starterCode: firstCode(
        workspace.starterCode,
        source.starterCode,
        recipe.starterCode,
    ),
    solutionCode: firstCode(
      workspace.solutionCode,
      source.solutionCode,
      recipe.solutionCode,
    ),
  };
}


export function resolvePythonFileSeed(target: unknown): FileSeed {
  return resolveFileSeed(target);
}

export function resolveJavaFileSeed(target: unknown): FileSeed {
  return resolveFileSeed(target);
}

export function resolveGenericFileSeed(target: unknown): FileSeed {
  return resolveFileSeed(target);
}

export function resolveCourseFileSeed(args: {
  subjectSlug?: string | null;
  language?: string | null;
  target: unknown;
}): FileSeed {
  const profile = getCourseProfile({ subjectSlug: args.subjectSlug, language: args.language });

  switch (profile.id) {
    case "python":
      return resolvePythonFileSeed(args.target);
    case "java":
      return resolveJavaFileSeed(args.target);
    case "sql":
      // SQL can still have starter/query/support files, but dataset resolution
      // remains SQL-only and is handled by resolveRuntimeDefaultDataset.
      return resolveGenericFileSeed(args.target);
    default:
      return resolveGenericFileSeed(args.target);
  }
}

function getDatasetFromRuntime(runtime: unknown) {
  if (!isRecord(runtime)) return undefined;
  if (cleanString(runtime.datasetId)) return cleanString(runtime.datasetId);
  if (cleanString(runtime.runtimeDefaultDatasetId)) return cleanString(runtime.runtimeDefaultDatasetId);
  return undefined;
}

function getDatasetFromTarget(target: unknown): string | undefined {
  const targetRecord = isRecord(target) ? target : null;
  const source = isRecord(targetRecord?.spec) ? targetRecord.spec : target;
  if (!isRecord(source)) return undefined;
  const recipe = isRecord(source.recipe) ? source.recipe : {};
  const expected = isRecord(source.expected) ? source.expected : {};
  const expectedRuntime = isRecord(expected.runtime) ? expected.runtime : {};
  const workspace = isRecord(source.workspace) ? source.workspace : {};

  return (
    getDatasetFromRuntime(source.runtime) ??
    cleanString(source.datasetId) ??
    cleanString(source.runtimeDefaultDatasetId) ??
    cleanString(recipe.datasetId) ??
    getDatasetFromRuntime(expectedRuntime) ??
    cleanString(workspace.datasetId) ??
    cleanString(workspace.runtimeDefaultDatasetId)
  );
}

/**
 * SQL-only runtime dataset resolver.
 *
 * Priority:
 * 1. exercise/sketch/target dataset fields
 * 2. topic runtime defaults
 * 3. module/runtime defaults
 *
 * Non-SQL profiles return source "none" and never read or propagate SQL-only
 * runtimeDefaultDatasetId/datasetId defaults.
 */
export function resolveRuntimeDefaultDataset(args: {
  subjectSlug?: string | null;
  language?: string | null;
  target?: unknown;
  topicRuntimeDefaults?: UnknownRecord | null;
  moduleRuntimeDefaults?: UnknownRecord | null;
  runtimeDefaults?: UnknownRecord | null;
}): RuntimeDatasetResolution {
  const profile = getCourseProfile({ subjectSlug: args.subjectSlug, language: args.language });
  if (profile.id !== "sql") return { source: "none" };

  const targetDatasetId = getDatasetFromTarget(args.target);
  if (targetDatasetId) {
    const targetRecord = isRecord(args.target) ? args.target : null;
    const target = isRecord(targetRecord?.spec) ? targetRecord.spec : args.target;
    const targetKind =
      isRecord(target) && cleanString(target.archetype)?.includes("sketch")
        ? "sketch"
        : "exercise";
    return { datasetId: targetDatasetId, source: targetKind as "exercise" | "sketch" };
  }

  const topicDatasetId = getDatasetFromRuntime(args.topicRuntimeDefaults);
  if (topicDatasetId) return { datasetId: topicDatasetId, source: "topic" };

  const moduleDatasetId = getDatasetFromRuntime(args.moduleRuntimeDefaults);
  if (moduleDatasetId) return { datasetId: moduleDatasetId, source: "module" };

  const runtimeDatasetId = getDatasetFromRuntime(args.runtimeDefaults);
  if (runtimeDatasetId) return { datasetId: runtimeDatasetId, source: "runtime-default" };

  return {
    source: "none",
    error:
      "SQL runtime could not resolve a dataset. Define runtime.datasetId on the exercise/sketch, topic runtimeDefaults.datasetId, or module runtimeDefaults.datasetId.",
  };
}

function resolveSqlDialect(args: {
  target?: unknown;
  topicRuntimeDefaults?: UnknownRecord | null;
  moduleRuntimeDefaults?: UnknownRecord | null;
  runtimeDefaults?: UnknownRecord | null;
  fallback?: SqlDialect;
}): SqlDialect {
  const targetRecord = isRecord(args.target) ? args.target : null;
  const source = isRecord(targetRecord?.spec) ? targetRecord.spec : args.target;
  const sourceRecord = isRecord(source) ? source : {};
  const runtime = isRecord(sourceRecord.runtime) ? sourceRecord.runtime : {};
  return (
    cleanString(sourceRecord.fixedSqlDialect) ??
    cleanString(sourceRecord.sqlDialect) ??
    cleanString(runtime.fixedSqlDialect) ??
    cleanString(runtime.sqlDialect) ??
    cleanString(args.topicRuntimeDefaults?.fixedSqlDialect) ??
    cleanString(args.topicRuntimeDefaults?.sqlDialect) ??
    cleanString(args.moduleRuntimeDefaults?.fixedSqlDialect) ??
    cleanString(args.moduleRuntimeDefaults?.sqlDialect) ??
    cleanString(args.runtimeDefaults?.fixedSqlDialect) ??
    cleanString(args.runtimeDefaults?.sqlDialect) ??
    args.fallback ??
    DEFAULT_SQL_DIALECT
  ) as SqlDialect;
}

export function resolveCourseSqlRunnerConfig(args: {
  subjectSlug?: string | null;
  language?: string | null;
  target?: unknown;
  topicRuntimeDefaults?: UnknownRecord | null;
  moduleRuntimeDefaults?: UnknownRecord | null;
  runtimeDefaults?: UnknownRecord | null;
  defaultSqlDialect?: SqlDialect;
}): ResolvedSqlRunnerConfig & { datasetResolution: RuntimeDatasetResolution } {
  const datasetResolution = resolveRuntimeDefaultDataset(args);
  const language = resolveCourseLanguage({
    subjectSlug: args.subjectSlug,
    language: args.language,
    runtimeDefaults: args.runtimeDefaults,
    target: isRecord(args.target) ? args.target : null,
  });

  if (getCourseProfile({ subjectSlug: args.subjectSlug, language }).id !== "sql") {
    return {
      isSql: false,
      sqlDialect: args.defaultSqlDialect ?? DEFAULT_SQL_DIALECT,
      datasetResolution,
    };
  }

  return {
    ...resolveSqlRunnerConfig({
      language: "sql",
      sqlDialect: resolveSqlDialect({
        target: args.target,
        topicRuntimeDefaults: args.topicRuntimeDefaults,
        moduleRuntimeDefaults: args.moduleRuntimeDefaults,
        runtimeDefaults: args.runtimeDefaults,
        fallback: args.defaultSqlDialect,
      }),
      sqlDatasetId: datasetResolution.datasetId,
      defaultSqlDialect: args.defaultSqlDialect,
    }),
    datasetResolution,
  };
}
