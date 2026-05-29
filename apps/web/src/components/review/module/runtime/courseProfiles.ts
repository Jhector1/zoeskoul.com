import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import {
  resolveSqlRunnerConfig,
  type ResolvedSqlRunnerConfig,
} from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
import {isUsableStarterCode} from "@/components/review/module/runtime/starterContent";
import { resolveEffectiveExerciseRuntime } from "@zoeskoul/curriculum-runtime/runtime";

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
  source: string;
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
  profileId?: string | null;
  versionFamily?: string | null;
}): CourseProfile {
  const subjectSlug = cleanString(args.subjectSlug)?.toLowerCase() ?? "";
  const explicitLanguage = cleanLanguage(args.language);
  const profileId = cleanString(args.profileId)?.toLowerCase();
  const versionFamily = cleanString(args.versionFamily)?.toLowerCase();

  const canonicalProfile =
    explicitLanguage === "sql" || profileId === "sql" || versionFamily === "sql"
      ? "sql"
      : explicitLanguage === "python" ||
          profileId === "python" ||
          versionFamily === "python"
        ? "python"
        : null;

  if (canonicalProfile === "sql") {
    return {
      id: "sql",
      subjectSlug,
      defaultLanguage: "sql" as WorkspaceLanguage,
      supportsRuntimeDefaultDataset: true,
    };
  }

  if (canonicalProfile === "python") {
    return {
      id: "python",
      subjectSlug,
      defaultLanguage: "python" as WorkspaceLanguage,
      supportsRuntimeDefaultDataset: false,
    };
  }

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
  profileId?: string | null;
  versionFamily?: string | null;
  runtimeDefaults?: UnknownRecord | null;
  target?: unknown;
}): WorkspaceLanguage {
  const profile = getCourseProfile({
    subjectSlug: args.subjectSlug,
    language: args.language,
    profileId: args.profileId,
    versionFamily: args.versionFamily,
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
    (cleanString(args.runtimeDefaults?.kind)?.toLowerCase() === "sql"
      ? ("sql" as WorkspaceLanguage)
      : undefined) ??
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

type NormalizedSeedFile = {
  path: string;
  content: string;
};

function normalizeSeedPath(input: unknown, fallback: string) {
  const raw = typeof input === "string" && input.trim() ? input : fallback;

  const parts = raw
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");

  return parts.join("/") || fallback;
}

function unwrapSeedFiles(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  return (
    raw.starterFiles ??
    raw.files ??
    raw.initialFiles ??
    raw.workspaceFiles ??
    raw.entries ??
    raw.items ??
    raw
  );
}

function seedFilePath(file: unknown, fallback: string) {
  if (typeof file === "string") return normalizeSeedPath(file, fallback);
  if (!isRecord(file)) return fallback;

  return normalizeSeedPath(
    file.path ?? file.filePath ?? file.filename ?? file.name,
    fallback,
  );
}

function seedFileContent(file: unknown): string {
  if (typeof file === "string") return "";
  if (!isRecord(file)) return "";

  for (const key of [
    "content",
    "contents",
    "text",
    "code",
    "source",
    "body",
    "value",
  ] as const) {
    if (typeof file[key] === "string") {
      return isUsableStarterCode(file[key]) ? file[key] : "";
    }
  }

  return "";
}

function normalizeSeedFiles(
  raw: unknown,
  fallbackEntryFile: string,
): NormalizedSeedFile[] {
  const source = unwrapSeedFiles(raw);

  if (Array.isArray(source)) {
    return source
      .map((file, index) => {
        const fallback =
          index === 0 ? fallbackEntryFile : `file-${String(index + 1)}.txt`;

        return {
          path: normalizeSeedPath(seedFilePath(file, fallback), fallback),
          content: seedFileContent(file),
        };
      })
      .filter((file) => Boolean(file.path));
  }

  if (isRecord(source)) {
    return Object.entries(source)
      .filter(([path]) => {
        return ![
          "entryFile",
          "entryFilePath",
          "mainFile",
          "mainFilePath",
          "language",
          "lang",
        ].includes(path);
      })
      .map(([path, value]) => ({
        path: normalizeSeedPath(path, fallbackEntryFile),
        content:
          typeof value === "string"
            ? isUsableStarterCode(value)
              ? value
              : ""
            : seedFileContent(value),
      }))
      .filter((file) => Boolean(file.path));
  }

  return [];
}

function mergeFiles(
  values: unknown[],
  fallbackEntryFile = "main.txt",
): unknown {
  const byPath = new Map<string, NormalizedSeedFile>();

  for (const value of values) {
    const normalized = normalizeSeedFiles(value, fallbackEntryFile);

    for (const file of normalized) {
      const path = normalizeSeedPath(file.path, fallbackEntryFile);
      if (!path || byPath.has(path)) continue;

      byPath.set(path, {
        path,
        content: file.content ?? "",
      });
    }
  }

  return byPath.size > 0 ? Array.from(byPath.values()) : firstFiles(...values);
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
    starterFiles: mergeFiles([
      workspace.starterFiles,
      workspace.files,
      workspace.initialFiles,
      workspace.workspaceFiles,
      workspace.fixtureFiles,
      workspace.fixtures,
      workspace.fileFixtures,
      source.starterFiles,
      source.files,
      source.initialFiles,
      source.workspaceFiles,
      source.fixtureFiles,
      source.fixtures,
      source.fileFixtures,
      recipe.starterFiles,
      recipe.files,
      recipe.initialFiles,
      recipe.workspaceFiles,
      recipe.fixtureFiles,
      recipe.fixtures,
      recipe.fileFixtures,
    ]),
    solutionFiles: mergeFiles([
      workspace.solutionFiles,
      source.solutionFiles,
      recipe.solutionFiles,
    ]),
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
  profileId?: string | null;
  versionFamily?: string | null;
  target: unknown;
}): FileSeed {
  const profile = getCourseProfile({
    subjectSlug: args.subjectSlug,
    language: args.language,
    profileId: args.profileId,
    versionFamily: args.versionFamily,
  });

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
  profileId?: string | null;
  versionFamily?: string | null;
  target?: unknown;
  subjectRuntimeDefaults?: UnknownRecord | null;
  courseRuntimeDefaults?: UnknownRecord | null;
  sectionRuntimeDefaults?: UnknownRecord | null;
  topicRuntimeDefaults?: UnknownRecord | null;
  moduleRuntimeDefaults?: UnknownRecord | null;
  runtimeDefaults?: UnknownRecord | null;
}): RuntimeDatasetResolution {
  const profile = getCourseProfile({
    subjectSlug: args.subjectSlug,
    language: args.language,
    profileId: args.profileId,
    versionFamily: args.versionFamily,
  });
  if (profile.id !== "sql") return { source: "none" };
  const targetRecord = isRecord(args.target) ? args.target : null;
  const target = isRecord(targetRecord?.spec)
    ? targetRecord.spec
    : targetRecord ?? {};
  const resolved = resolveEffectiveExerciseRuntime({
    language: "sql",
    exerciseRuntime: isRecord(target.runtime) ? target.runtime : null,
    exerciseSqlDatasetId:
      cleanString(target.datasetId) ??
      cleanString(target.runtimeDefaultDatasetId),
    recipe: isRecord(target.recipe) ? target.recipe : null,
    topicRuntimeDefaults: args.topicRuntimeDefaults,
    sectionRuntimeDefaults: args.sectionRuntimeDefaults,
    moduleRuntimeDefaults: args.moduleRuntimeDefaults ?? args.runtimeDefaults,
    courseRuntimeDefaults: args.courseRuntimeDefaults,
    subjectRuntimeDefaults: args.subjectRuntimeDefaults,
  });

  if (resolved.datasetId) {
    return {
      datasetId: resolved.datasetId,
      source: resolved.sourceMap?.datasetId ?? "none",
    };
  }

  return {
    source: "none",
    error:
      "SQL runtime could not resolve a dataset. Define runtime.datasetId on the exercise/sketch, recipe.datasetId, or a topic/module/course/subject runtimeDefaults.datasetId.",
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

function getTargetSource(target: unknown): UnknownRecord | null {
  const targetRecord = isRecord(target) ? target : null;
  return isRecord(targetRecord?.spec)
    ? (targetRecord.spec as UnknownRecord)
    : targetRecord;
}

export function resolveCourseSqlRunnerConfig(args: {
  subjectSlug?: string | null;
  language?: string | null;
  profileId?: string | null;
  versionFamily?: string | null;
  target?: unknown;
  subjectRuntimeDefaults?: UnknownRecord | null;
  courseRuntimeDefaults?: UnknownRecord | null;
  sectionRuntimeDefaults?: UnknownRecord | null;
  topicRuntimeDefaults?: UnknownRecord | null;
  moduleRuntimeDefaults?: UnknownRecord | null;
  runtimeDefaults?: UnknownRecord | null;
  defaultSqlDialect?: SqlDialect;
}): ResolvedSqlRunnerConfig & { datasetResolution: RuntimeDatasetResolution } {
  const datasetResolution = resolveRuntimeDefaultDataset(args);
  const language = resolveCourseLanguage({
    subjectSlug: args.subjectSlug,
    language: args.language,
    profileId: args.profileId,
    versionFamily: args.versionFamily,
    runtimeDefaults: args.runtimeDefaults,
    target: isRecord(args.target) ? args.target : null,
  });

  if (
    getCourseProfile({
      subjectSlug: args.subjectSlug,
      language,
      profileId: args.profileId,
      versionFamily: args.versionFamily,
    }).id !== "sql"
  ) {
    return {
      isSql: false,
      sqlDialect: args.defaultSqlDialect ?? DEFAULT_SQL_DIALECT,
      datasetResolution,
    };
  }

  const targetSource = getTargetSource(args.target);

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
      exerciseRuntime: isRecord(targetSource?.runtime) ? targetSource.runtime : null,
      exerciseSqlDatasetId: cleanString(targetSource?.datasetId),
      recipe: isRecord(targetSource?.recipe) ? targetSource.recipe : null,
      subjectRuntimeDefaults: args.subjectRuntimeDefaults,
      courseRuntimeDefaults: args.courseRuntimeDefaults,
      sectionRuntimeDefaults: args.sectionRuntimeDefaults,
      topicRuntimeDefaults: args.topicRuntimeDefaults,
      moduleRuntimeDefaults: args.moduleRuntimeDefaults,
      runtimeDefaults: args.runtimeDefaults,
      sqlDatasetId: datasetResolution.datasetId,
      defaultSqlDialect: args.defaultSqlDialect,
    }),
    datasetResolution,
  };
}
