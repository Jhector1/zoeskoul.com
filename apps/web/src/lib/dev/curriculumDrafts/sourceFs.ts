import { promises as fs } from "node:fs";
import path from "node:path";
import { buildTopicPreviewFromSource } from "@zoeskoul/curriculum-compiler";
import type {
  CourseBlueprint,
  CoursePlan,
  TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import {
  findRepoRoot,
  pathExists,
  safeJoin,
  toRepoRelative,
  type DraftCatalogSummary,
  type DraftListResult,
  type DraftModuleSummary,
  type DraftRef,
  type DraftSubjectSummary,
  type DraftTopicSummary,
} from "./fs";

type JsonObject = Record<string, unknown>;

export type SourceDraftPaths = DraftRef & {
  repoRoot: string;
  draftRoot: string;
  course: string;
  locale: string;
  moduleDir: string;
  topicDir: string;
  sourcePath: string;
  relativeSourcePath: string;
  blueprintPath: string;
  planPath: string;
};

export type LoadedSourceTopic = SourceDraftPaths & {
  sourceJson: unknown;
  bundleJson: unknown;
  messagesJson: unknown;
  profileId: string;
  compiler: ReturnType<typeof buildTopicPreviewFromSource>;
};

export type LoadedSourceModule = {
  repoRoot: string;
  draftRoot: string;
  catalog: string;
  subject: string;
  module: string;
  moduleDir: string;
  locale: string;
  selectedTopicDir: string;
  profileId: string;
  topics: LoadedSourceTopic[];
};

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringProp(value: unknown, key: string) {
  const field = asObject(value)?.[key];
  return typeof field === "string" ? field : null;
}

async function readJson<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function readDirNames(dirPath: string) {
  if (!(await pathExists(dirPath))) return [];
  return (await fs.readdir(dirPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function readTopicIds(topicsRoot: string) {
  if (!(await pathExists(topicsRoot))) return [];
  return (await fs.readdir(topicsRoot, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        !entry.name.endsWith(".source.json"),
    )
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort((left, right) => left.localeCompare(right));
}

export async function findSourceDraftRoot(startDir = process.cwd()) {
  const explicit = process.env.DEV_CURRICULUM_SOURCE_ROOT;
  if (explicit) return path.resolve(explicit);
  return path.join(await findRepoRoot(startDir), ".curriculum-drafts");
}

function planModules(plan: CoursePlan) {
  return Array.isArray(plan.modules) ? plan.modules : [];
}

function moduleTopicIds(module: CoursePlan["modules"][number]) {
  return (Array.isArray(module.sections) ? module.sections : []).flatMap((section) =>
    (Array.isArray(section.topics) ? section.topics : [])
      .map((topic) => stringProp(topic, "topicId"))
      .filter((topicId): topicId is string => Boolean(topicId)),
  );
}

function planModuleFor(args: {
  plan: CoursePlan;
  moduleDir: string;
  topicIds: string[];
}) {
  return planModules(args.plan).find((module) => {
    if (module.moduleSlug === args.moduleDir) return true;
    const plannedTopics = new Set(moduleTopicIds(module));
    return args.topicIds.some((topicId) => plannedTopics.has(topicId));
  });
}

function planTopic(plan: CoursePlan, topicId: string) {
  for (const module of planModules(plan)) {
    for (const section of Array.isArray(module.sections) ? module.sections : []) {
      for (const topic of Array.isArray(section.topics) ? section.topics : []) {
        if (stringProp(topic, "topicId") === topicId) return { module, section, topic };
      }
    }
  }
  return null;
}

export async function listSourceDraftsWithDebug(
  _locale = "en",
): Promise<DraftListResult> {
  const repoRoot = await findRepoRoot();
  const draftRoot = await findSourceDraftRoot();
  const catalogs: DraftCatalogSummary[] = [];

  for (const catalog of await readDirNames(draftRoot)) {
    const subjects: DraftSubjectSummary[] = [];
    const subjectsRoot = safeJoin(draftRoot, catalog, "subjects");

    for (const subject of await readDirNames(subjectsRoot)) {
      const modulesByDir = new Map<string, DraftModuleSummary>();
      const coursesRoot = safeJoin(subjectsRoot, subject, "courses");

      for (const course of await readDirNames(coursesRoot)) {
        const authoringRoot = safeJoin(
          repoRoot,
          "authoring",
          "subjects",
          subject,
          "courses",
          course,
        );
        const planPath = safeJoin(authoringRoot, "course.plan.json");
        if (!(await pathExists(planPath))) continue;
        const plan = await readJson<CoursePlan>(planPath);
        const topicsRoot = safeJoin(coursesRoot, course, "topics");

        for (const moduleDir of await readDirNames(topicsRoot)) {
          const moduleTopicsRoot = safeJoin(topicsRoot, moduleDir);
          const topicIds = await readTopicIds(moduleTopicsRoot);
          const plannedModule = planModuleFor({ plan, moduleDir, topicIds });
          const moduleSlug = plannedModule?.moduleSlug ?? moduleDir;
          const topics: DraftTopicSummary[] = [];

          for (const topicId of topicIds) {
            const sourcePath = safeJoin(moduleTopicsRoot, `${topicId}.json`);
            const sourceJson = await readJson(sourcePath).catch(() => null);
            const planned = planTopic(plan, topicId);
            topics.push({
              catalog,
              subject,
              moduleDir,
              moduleSlug,
              sectionSlug: planned?.section.sectionSlug ?? null,
              topicDir: topicId,
              topicSlug: topicId,
              topicId,
              title:
                stringProp(sourceJson, "title") ??
                stringProp(planned?.topic, "title"),
              sourcePath: toRepoRelative(repoRoot, sourcePath),
              // Compatibility fields for older Admin clients. They point to
              // canonical source, never generated artifacts.
              bundlePath: toRepoRelative(repoRoot, sourcePath),
              messagesPath: null,
            });
          }

          modulesByDir.set(moduleDir, { moduleDir, moduleSlug, topics });
        }
      }

      subjects.push({
        subject,
        modules: Array.from(modulesByDir.values()).sort((left, right) =>
          left.moduleDir.localeCompare(right.moduleDir),
        ),
      });
    }

    catalogs.push({ catalog, subjects });
  }

  const exists = await pathExists(draftRoot);
  return {
    catalogs,
    debug: {
      cwd: process.cwd(),
      repoRoot,
      draftRoot,
      candidates: [
        {
          path: draftRoot,
          source: process.env.DEV_CURRICULUM_SOURCE_ROOT
            ? "DEV_CURRICULUM_SOURCE_ROOT"
            : "repo/.curriculum-drafts",
          exists,
        },
      ],
      warnings: [
        ...(!exists ? [`Canonical draft root does not exist: ${draftRoot}`] : []),
        ...(exists && catalogs.length === 0
          ? [`No canonical curriculum drafts found in ${draftRoot}.`]
          : []),
      ],
    },
  };
}

export async function resolveSourceDraftPaths(
  ref: DraftRef,
): Promise<SourceDraftPaths> {
  const repoRoot = await findRepoRoot();
  const draftRoot = await findSourceDraftRoot();
  const locale = ref.locale || "en";
  const coursesRoot = safeJoin(
    draftRoot,
    ref.catalog,
    "subjects",
    ref.subject,
    "courses",
  );

  for (const course of await readDirNames(coursesRoot)) {
    const authoringRoot = safeJoin(
      repoRoot,
      "authoring",
      "subjects",
      ref.subject,
      "courses",
      course,
    );
    const blueprintPath = safeJoin(authoringRoot, "course.blueprint.json");
    const planPath = safeJoin(authoringRoot, "course.plan.json");
    if (!(await pathExists(blueprintPath)) || !(await pathExists(planPath))) continue;

    const plan = await readJson<CoursePlan>(planPath);
    const courseTopicsRoot = safeJoin(coursesRoot, course, "topics");
    for (const moduleDir of await readDirNames(courseTopicsRoot)) {
      const topicIds = await readTopicIds(safeJoin(courseTopicsRoot, moduleDir));
      const plannedModule = planModuleFor({ plan, moduleDir, topicIds });
      const matchesModule =
        ref.module === moduleDir || ref.module === plannedModule?.moduleSlug;
      if (!matchesModule || !topicIds.includes(ref.topic)) continue;

      const sourcePath = safeJoin(
        courseTopicsRoot,
        moduleDir,
        `${ref.topic}.json`,
      );
      return {
        ...ref,
        locale,
        repoRoot,
        draftRoot,
        course,
        moduleDir,
        topicDir: ref.topic,
        sourcePath,
        relativeSourcePath: toRepoRelative(repoRoot, sourcePath),
        blueprintPath,
        planPath,
      };
    }
  }

  throw new Error(
    `Canonical draft topic not found: ${ref.catalog}/${ref.subject}/${ref.module}/${ref.topic}`,
  );
}

async function compileSourceTopic(paths: SourceDraftPaths, sourceJson: unknown) {
  const blueprint = await readJson<CourseBlueprint>(paths.blueprintPath);
  const plan = await readJson<CoursePlan>(paths.planPath);
  return buildTopicPreviewFromSource({
    blueprint,
    plan,
    topicId: paths.topicDir,
    draft: sourceJson as TopicAuthoringDraft,
  });
}

export async function loadSourceTopic(ref: DraftRef): Promise<LoadedSourceTopic> {
  const paths = await resolveSourceDraftPaths(ref);
  const sourceJson = await readJson(paths.sourcePath);
  const compiler = await compileSourceTopic(paths, sourceJson);
  return {
    ...paths,
    sourceJson,
    bundleJson: compiler.topicBundle,
    messagesJson: compiler.messages,
    profileId: compiler.profileId,
    compiler,
  };
}

export async function loadSourceModuleTopics(
  ref: DraftRef,
): Promise<LoadedSourceModule> {
  const selected = await resolveSourceDraftPaths(ref);
  const topicsRoot = safeJoin(
    selected.draftRoot,
    ref.catalog,
    "subjects",
    ref.subject,
    "courses",
    selected.course,
    "topics",
    selected.moduleDir,
  );
  const topics: LoadedSourceTopic[] = [];
  for (const topicId of await readTopicIds(topicsRoot)) {
    topics.push(
      await loadSourceTopic({
        ...ref,
        module: selected.moduleDir,
        topic: topicId,
      }),
    );
  }

  const selectedTopic = topics.find((topic) => topic.topicDir === ref.topic);
  return {
    repoRoot: selected.repoRoot,
    draftRoot: selected.draftRoot,
    catalog: ref.catalog,
    subject: ref.subject,
    module: ref.module,
    moduleDir: selected.moduleDir,
    locale: selected.locale,
    selectedTopicDir: selected.topicDir,
    profileId: selectedTopic?.profileId ?? topics[0]?.profileId ?? "",
    topics,
  };
}

export async function loadSourceModuleAuthoredTopicOrder(ref: DraftRef) {
  const paths = await resolveSourceDraftPaths(ref);
  const plan = await readJson<CoursePlan>(paths.planPath);
  const topicIds = await readTopicIds(
    safeJoin(
      paths.draftRoot,
      ref.catalog,
      "subjects",
      ref.subject,
      "courses",
      paths.course,
      "topics",
      paths.moduleDir,
    ),
  );
  const plannedModule = planModuleFor({
    plan,
    moduleDir: paths.moduleDir,
    topicIds,
  });
  return plannedModule ? moduleTopicIds(plannedModule) : [];
}

export async function saveSourceTopic(args: {
  ref: DraftRef;
  sourceJson: unknown;
}) {
  const paths = await resolveSourceDraftPaths(args.ref);
  // Compile before replacing the saved source so invalid authoring cannot
  // leave the editor with an unusable canonical topic.
  await compileSourceTopic(paths, args.sourceJson);
  const tempPath = `${paths.sourcePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(args.sourceJson, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, paths.sourcePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return loadSourceTopic(args.ref);
}
