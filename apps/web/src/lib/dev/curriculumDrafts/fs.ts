import { promises as fs } from "node:fs";
import path from "node:path";

export type DraftTopicSummary = {
  catalog: string;
  subject: string;
  moduleDir: string;
  moduleSlug: string;
  sectionSlug?: string | null;
  topicDir: string;
  topicSlug: string;
  topicId?: string | null;
  title?: string | null;
  bundlePath: string;
  messagesPath?: string | null;
};

export type DraftModuleSummary = {
  moduleDir: string;
  moduleSlug: string;
  topics: DraftTopicSummary[];
};

export type DraftSubjectSummary = {
  subject: string;
  modules: DraftModuleSummary[];
};

export type DraftCatalogSummary = {
  catalog: string;
  subjects: DraftSubjectSummary[];
};

export type DraftRootCandidate = {
  path: string;
  source: string;
  exists: boolean;
};

export type DraftListDebug = {
  cwd: string;
  repoRoot: string;
  draftRoot: string;
  candidates: DraftRootCandidate[];
  warnings: string[];
};

export type DraftListResult = {
  catalogs: DraftCatalogSummary[];
  debug: DraftListDebug;
};

export type DraftRef = {
  catalog: string;
  subject: string;
  module: string;
  topic: string;
  locale?: string;
};

export type DraftPaths = DraftRef & {
  repoRoot: string;
  draftRoot: string;
  moduleDir: string;
  topicDir: string;
  bundlePath: string;
  messagesPath: string;
  relativeBundlePath: string;
  relativeMessagesPath: string;
};

export type LoadedDraftTopic = DraftPaths & {
  bundleJson: unknown;
  messagesJson: unknown | null;
};

export type LoadedDraftModule = {
  repoRoot: string;
  draftRoot: string;
  catalog: string;
  subject: string;
  module: string;
  moduleDir: string;
  locale: string;
  selectedTopicDir: string;
  topics: LoadedDraftTopic[];
};

type JsonObject = Record<string, unknown>;

const DRAFT_ROOT_NAME = ".curriculum-drafts";
const BACKUP_ROOT_NAME = ".curriculum-backups";

export function isCurriculumDraftEditorEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_CURRICULUM_EDITOR === "1";
}

export async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function uniquePaths(candidates: Array<{ path: string; source: string }>) {
  const seen = new Set<string>();
  const result: Array<{ path: string; source: string }> = [];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.path);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push({ path: resolved, source: candidate.source });
  }

  return result;
}

function repoRootCandidates(startDir = process.cwd()) {
  const seeds: Array<{ path: string; source: string }> = [];

  const envRepoRoot = process.env.DEV_CURRICULUM_REPO_ROOT || process.env.CURRICULUM_REPO_ROOT;
  const envDraftRoot = process.env.DEV_CURRICULUM_DRAFT_ROOT || process.env.CURRICULUM_DRAFT_ROOT;

  if (envRepoRoot) seeds.push({ path: envRepoRoot, source: "DEV_CURRICULUM_REPO_ROOT/CURRICULUM_REPO_ROOT" });
  if (envDraftRoot) seeds.push({ path: path.dirname(envDraftRoot), source: "dirname(DEV_CURRICULUM_DRAFT_ROOT/CURRICULUM_DRAFT_ROOT)" });
  if (process.env.INIT_CWD) seeds.push({ path: process.env.INIT_CWD, source: "INIT_CWD" });
  if (process.env.PWD) seeds.push({ path: process.env.PWD, source: "PWD" });
  seeds.push({ path: startDir, source: "process.cwd()" });

  const expanded: Array<{ path: string; source: string }> = [];
  for (const seed of seeds) {
    let current = path.resolve(seed.path);
    for (let index = 0; index < 14; index += 1) {
      expanded.push({ path: current, source: `${seed.source}${index === 0 ? "" : ` parent ${index}`}` });
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
  }

  return uniquePaths(expanded);
}

export async function findRepoRoot(startDir = process.cwd()) {
  const candidates = repoRootCandidates(startDir);

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate.path, DRAFT_ROOT_NAME))) {
      return candidate.path;
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate.path, "pnpm-workspace.yaml"))) {
      return candidate.path;
    }
  }

  return path.resolve(process.env.INIT_CWD || process.cwd(), "../..");
}

export async function getDraftRootCandidates(startDir = process.cwd()): Promise<DraftRootCandidate[]> {
  const explicitDraftRoot = process.env.DEV_CURRICULUM_DRAFT_ROOT || process.env.CURRICULUM_DRAFT_ROOT;
  const baseCandidates = repoRootCandidates(startDir);
  const draftCandidates = uniquePaths([
    ...(explicitDraftRoot ? [{ path: explicitDraftRoot, source: "DEV_CURRICULUM_DRAFT_ROOT/CURRICULUM_DRAFT_ROOT" }] : []),
    ...baseCandidates.map((candidate) => ({
      path: path.join(candidate.path, DRAFT_ROOT_NAME),
      source: `${candidate.source}/${DRAFT_ROOT_NAME}`,
    })),
  ]);

  const resolved: DraftRootCandidate[] = [];
  for (const candidate of draftCandidates) {
    resolved.push({
      ...candidate,
      exists: await pathExists(candidate.path),
    });
  }

  return resolved;
}

export async function findDraftRoot(startDir = process.cwd()) {
  const candidates = await getDraftRootCandidates(startDir);
  return candidates.find((candidate) => candidate.exists)?.path ?? path.join(await findRepoRoot(startDir), DRAFT_ROOT_NAME);
}

export async function getDraftRoot() {
  return findDraftRoot();
}

export function safeJoin(baseDir: string, ...segments: string[]) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return target;
  }

  throw new Error(`Unsafe path outside ${base}: ${target}`);
}

export function toRepoRelative(repoRoot: string, filePath: string) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

export async function readJsonFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function readJsonIfExists(filePath: string) {
  if (!(await pathExists(filePath))) return null;
  return readJsonFile(filePath);
}

async function readDirNames(dirPath: string) {
  if (!(await pathExists(dirPath))) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "__MACOSX")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringProp(value: unknown, key: string) {
  const object = asObject(value);
  const field = object?.[key];
  return typeof field === "string" ? field : null;
}

function topicTitle(bundle: unknown) {
  const topic = asObject(asObject(bundle)?.topic);
  const title = topic?.title;
  return typeof title === "string" ? title : null;
}

function messagePathForTopic(args: {
  draftRoot: string;
  catalog: string;
  locale: string;
  subject: string;
  moduleDir: string;
  topicDir: string;
}) {
  return safeJoin(
    args.draftRoot,
    args.catalog,
    "messages",
    args.locale,
    "subjects",
    args.subject,
    args.moduleDir,
    `${args.topicDir}.json`,
  );
}

async function listDraftCatalogs(args: { repoRoot: string; draftRoot: string; locale: string }): Promise<DraftCatalogSummary[]> {
  const { repoRoot, draftRoot, locale } = args;
  const catalogs: DraftCatalogSummary[] = [];

  for (const catalog of await readDirNames(draftRoot)) {
    const subjectsRoot = safeJoin(draftRoot, catalog, "subjects");
    const subjects: DraftSubjectSummary[] = [];

    for (const subject of await readDirNames(subjectsRoot)) {
      const modulesRoot = safeJoin(subjectsRoot, subject, "modules");
      const modules: DraftModuleSummary[] = [];

      for (const moduleDir of await readDirNames(modulesRoot)) {
        const topicsRoot = safeJoin(modulesRoot, moduleDir, "topics");
        const topics: DraftTopicSummary[] = [];
        let moduleSlug = moduleDir;

        for (const topicDir of await readDirNames(topicsRoot)) {
          const bundlePath = safeJoin(topicsRoot, topicDir, "topic.bundle.json");
          if (!(await pathExists(bundlePath))) continue;

          let bundle: unknown = null;
          try {
            bundle = await readJsonFile(bundlePath);
          } catch {
            bundle = null;
          }

          moduleSlug = stringProp(bundle, "moduleSlug") ?? moduleSlug;
          const messagesPath = messagePathForTopic({
            draftRoot,
            catalog,
            locale,
            subject,
            moduleDir,
            topicDir,
          });

          topics.push({
            catalog,
            subject,
            moduleDir,
            moduleSlug: stringProp(bundle, "moduleSlug") ?? moduleDir,
            sectionSlug: stringProp(bundle, "sectionSlug"),
            topicDir,
            topicSlug: topicDir,
            topicId: stringProp(bundle, "topicId"),
            title: topicTitle(bundle),
            bundlePath: toRepoRelative(repoRoot, bundlePath),
            messagesPath: (await pathExists(messagesPath)) ? toRepoRelative(repoRoot, messagesPath) : null,
          });
        }

        modules.push({ moduleDir, moduleSlug, topics });
      }

      subjects.push({ subject, modules });
    }

    catalogs.push({ catalog, subjects });
  }

  return catalogs;
}

export async function listDraftsWithDebug(locale = "en"): Promise<DraftListResult> {
  const repoRoot = await findRepoRoot();
  const draftRoot = await findDraftRoot();
  const candidates = await getDraftRootCandidates();
  const catalogs = await listDraftCatalogs({ repoRoot, draftRoot, locale });
  const warnings: string[] = [];

  if (!(await pathExists(draftRoot))) {
    warnings.push(`Draft root does not exist: ${draftRoot}`);
  }

  if (catalogs.length === 0) {
    warnings.push(
      `No draft catalogs found in ${draftRoot}. Start the web app from the repo root or set DEV_CURRICULUM_DRAFT_ROOT=/absolute/path/to/.curriculum-drafts.`,
    );
  }

  return {
    catalogs,
    debug: {
      cwd: process.cwd(),
      repoRoot,
      draftRoot,
      candidates,
      warnings,
    },
  };
}

export async function listDrafts(locale = "en"): Promise<DraftCatalogSummary[]> {
  return (await listDraftsWithDebug(locale)).catalogs;
}

async function resolveModuleDir(args: { catalogRoot: string; subject: string; module: string }) {
  const modulesRoot = safeJoin(args.catalogRoot, "subjects", args.subject, "modules");
  const direct = safeJoin(modulesRoot, args.module);
  if (await pathExists(direct)) return args.module;

  for (const moduleDir of await readDirNames(modulesRoot)) {
    const topicsRoot = safeJoin(modulesRoot, moduleDir, "topics");
    for (const topicDir of await readDirNames(topicsRoot)) {
      const bundlePath = safeJoin(topicsRoot, topicDir, "topic.bundle.json");
      const bundle = await readJsonIfExists(bundlePath);
      if (stringProp(bundle, "moduleSlug") === args.module) {
        return moduleDir;
      }
    }
  }

  throw new Error(`Module not found: ${args.module}`);
}

async function resolveTopicDir(args: {
  catalogRoot: string;
  subject: string;
  moduleDir: string;
  topic: string;
}) {
  const topicsRoot = safeJoin(args.catalogRoot, "subjects", args.subject, "modules", args.moduleDir, "topics");
  const direct = safeJoin(topicsRoot, args.topic, "topic.bundle.json");
  if (await pathExists(direct)) return args.topic;

  for (const topicDir of await readDirNames(topicsRoot)) {
    const bundlePath = safeJoin(topicsRoot, topicDir, "topic.bundle.json");
    const bundle = await readJsonIfExists(bundlePath);
    if (stringProp(bundle, "topicId") === args.topic || stringProp(bundle, "slug") === args.topic) {
      return topicDir;
    }
  }

  throw new Error(`Topic not found: ${args.topic}`);
}

export async function resolveDraftPaths(ref: DraftRef): Promise<DraftPaths> {
  const repoRoot = await findRepoRoot();
  const draftRoot = await findDraftRoot();
  const locale = ref.locale || "en";
  const catalogRoot = safeJoin(draftRoot, ref.catalog);
  const moduleDir = await resolveModuleDir({ catalogRoot, subject: ref.subject, module: ref.module });
  const topicDir = await resolveTopicDir({ catalogRoot, subject: ref.subject, moduleDir, topic: ref.topic });
  const bundlePath = safeJoin(
    catalogRoot,
    "subjects",
    ref.subject,
    "modules",
    moduleDir,
    "topics",
    topicDir,
    "topic.bundle.json",
  );
  const messagesPath = messagePathForTopic({
    draftRoot,
    catalog: ref.catalog,
    locale,
    subject: ref.subject,
    moduleDir,
    topicDir,
  });

  return {
    ...ref,
    locale,
    repoRoot,
    draftRoot,
    moduleDir,
    topicDir,
    bundlePath,
    messagesPath,
    relativeBundlePath: toRepoRelative(repoRoot, bundlePath),
    relativeMessagesPath: toRepoRelative(repoRoot, messagesPath),
  };
}

export async function loadDraftTopic(ref: DraftRef): Promise<LoadedDraftTopic> {
  const paths = await resolveDraftPaths(ref);
  return {
    ...paths,
    bundleJson: await readJsonFile(paths.bundlePath),
    messagesJson: await readJsonIfExists(paths.messagesPath),
  };
}

export async function loadDraftModuleTopics(ref: DraftRef): Promise<LoadedDraftModule> {
  const repoRoot = await findRepoRoot();
  const draftRoot = await findDraftRoot();
  const locale = ref.locale || "en";
  const catalogRoot = safeJoin(draftRoot, ref.catalog);
  const moduleDir = await resolveModuleDir({ catalogRoot, subject: ref.subject, module: ref.module });
  const selectedTopicDir = await resolveTopicDir({ catalogRoot, subject: ref.subject, moduleDir, topic: ref.topic });
  const topicsRoot = safeJoin(catalogRoot, "subjects", ref.subject, "modules", moduleDir, "topics");
  const topicDirs = await readDirNames(topicsRoot);
  const topics: LoadedDraftTopic[] = [];

  for (const topicDir of topicDirs) {
    const bundlePath = safeJoin(topicsRoot, topicDir, "topic.bundle.json");
    if (!(await pathExists(bundlePath))) continue;

    const messagesPath = messagePathForTopic({
      draftRoot,
      catalog: ref.catalog,
      locale,
      subject: ref.subject,
      moduleDir,
      topicDir,
    });

    topics.push({
      catalog: ref.catalog,
      subject: ref.subject,
      module: ref.module,
      topic: topicDir,
      locale,
      repoRoot,
      draftRoot,
      moduleDir,
      topicDir,
      bundlePath,
      messagesPath,
      relativeBundlePath: toRepoRelative(repoRoot, bundlePath),
      relativeMessagesPath: toRepoRelative(repoRoot, messagesPath),
      bundleJson: await readJsonFile(bundlePath),
      messagesJson: await readJsonIfExists(messagesPath),
    });
  }

  topics.sort((left, right) => {
    if (left.topicDir === selectedTopicDir) return -1;
    if (right.topicDir === selectedTopicDir) return 1;

    const leftBundle = asObject(left.bundleJson);
    const rightBundle = asObject(right.bundleJson);
    const leftOrder = typeof leftBundle?.order === "number" ? leftBundle.order : null;
    const rightOrder = typeof rightBundle?.order === "number" ? rightBundle.order : null;
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (leftOrder !== null && rightOrder === null) return -1;
    if (leftOrder === null && rightOrder !== null) return 1;
    return left.topicDir.localeCompare(right.topicDir);
  });

  return {
    repoRoot,
    draftRoot,
    catalog: ref.catalog,
    subject: ref.subject,
    module: ref.module,
    moduleDir,
    locale,
    selectedTopicDir,
    topics,
  };
}

function timestampForBackup() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function backupFile(args: { repoRoot: string; sourcePath: string; reason?: string }) {
  const draftRoot = await findDraftRoot();
  const source = safeJoin(draftRoot, path.relative(draftRoot, args.sourcePath));
  const backupRoot = path.join(args.repoRoot, BACKUP_ROOT_NAME, "dev-editor", timestampForBackup());
  const relative = path.relative(draftRoot, source);
  const backupPath = safeJoin(backupRoot, DRAFT_ROOT_NAME, relative);

  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  if (await pathExists(source)) {
    await fs.copyFile(source, backupPath);
  } else {
    await fs.writeFile(`${backupPath}.missing`, args.reason ?? "file did not exist before write", "utf8");
  }

  return backupPath;
}

export async function writeDraftJsonFile(args: {
  filePath: string;
  value: unknown;
  reason?: string;
}) {
  const repoRoot = await findRepoRoot();
  const draftRoot = await findDraftRoot();
  const safePath = safeJoin(draftRoot, path.relative(draftRoot, args.filePath));
  const backupPath = await backupFile({ repoRoot, sourcePath: safePath, reason: args.reason });

  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, `${JSON.stringify(args.value, null, 2)}\n`, "utf8");

  return {
    path: toRepoRelative(repoRoot, safePath),
    backupPath: toRepoRelative(repoRoot, backupPath),
  };
}

export function getNestedValue(root: unknown, keyPath: string) {
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = root;

  for (const part of parts) {
    if (!asObject(current)) return undefined;
    current = asObject(current)?.[part];
  }

  return current;
}

export function setNestedValue(root: unknown, keyPath: string, value: unknown) {
  const object = asObject(root);
  if (!object) throw new Error("Root JSON must be an object");

  const parts = keyPath.split(".").filter(Boolean);
  if (!parts.length) throw new Error("keyPath is required");

  let current: JsonObject = object;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!asObject(next)) current[part] = {};
    current = current[part] as JsonObject;
  }

  current[parts[parts.length - 1] as string] = value;
  return object;
}

export function subjectWithoutDraftWrapper(catalog: string, subject: string) {
  const prefix = `${catalog}--`;
  const suffix = "--draft";
  if (subject.startsWith(prefix) && subject.endsWith(suffix)) {
    return subject.slice(prefix.length, -suffix.length);
  }
  return subject.replace(/--draft$/, "");
}
