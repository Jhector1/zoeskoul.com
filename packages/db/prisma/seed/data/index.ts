import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CatalogSeed,
  ModuleSeed,
  SectionSeed,
  SubjectSeed,
  TopicSeed,
} from "./subjects/_types.js";

type SubjectManifest = {
  subject: {
    slug: string;
    catalogSlug?: string | null;
    genKey: string;
    order: number;
    titleKey: string;
    descriptionKey?: string | null;
    imagePublicId?: string | null;
    imageAlt?: string | null;
    accessPolicy?: "free" | "paid";
    status?: SubjectSeed["status"];
    meta?: Record<string, unknown> | null;
  };
  modules: Array<{
    slug: string;
    prefix: string;
    order: number;
    titleKey: string;
    descriptionKey?: string | null;
    weekStart?: number | null;
    weekEnd?: number | null;
    accessOverride?: "inherit" | "free" | "paid" | null;
    entitlementKey?: string | null;
    runtimeDefaults?: Record<string, unknown> | null;
    meta?: {
      estimatedMinutes?: number;
      prereqKeys?: string[];
      outcomeKeys?: string[];
      whyKeys?: string[];
      [key: string]: unknown;
    } | null;
    sections: Array<{
      slug: string;
      order: number;
      titleKey: string;
      descriptionKey?: string | null;
      meta?: {
        module?: number;
        weeksKey?: string;
        bulletKeys?: string[];
        [key: string]: unknown;
      } | null;
      topics: string[];
    }>;
  }>;
};

type CatalogManifest = {
  catalog: {
    slug: string;
    order: number;
    title: string;
    description?: string | null;
    imagePublicId?: string | null;
    imageAlt?: string | null;
    defaultSubjectSlug?: string | null;
    status?: SubjectSeed["status"];
    subjectSlugs: string[];
    meta?: Record<string, unknown> | null;
  };
};

type TopicBundleManifest = {
  topicId: string;
  minutes: number;
  topic: {
    labelKey: string;
    summaryKey: string;
  };
  runtimeDefaults?: Record<string, unknown> | null;
  exercises?: Array<{
    id: string;
    kind?: string;
    weight?: number;
    purpose?: string;
  }>;
};

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dataDir, "../../../../..");
const subjectsRoot = path.join(repoRoot, "apps/web/src/lib/subjects");
const authoringCatalogsRoot = path.join(repoRoot, "authoring", "catalogs");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function tag(key: string | null | undefined) {
  return key ? `@:${key}` : null;
}

function loadSubjectManifest(subjectSlug: string): SubjectManifest {
  const catalogSlug = resolveCatalogSlugForSubject(subjectSlug);
  return readJson<SubjectManifest>(
    path.join(subjectsRoot, catalogSlug, subjectSlug, "subject.manifest.json"),
  );
}

function loadCatalogManifest(fileName: string): CatalogManifest {
  return readJson<CatalogManifest>(path.join(authoringCatalogsRoot, fileName));
}

function loadTopicBundle(args: {
  subjectSlug: string;
  moduleOrder: number;
  topicId: string;
}): TopicBundleManifest {
  return readJson<TopicBundleManifest>(
    path.join(
      subjectsRoot,
      resolveCatalogSlugForSubject(args.subjectSlug),
      args.subjectSlug,
      "modules",
      `module${args.moduleOrder}`,
      "topics",
      args.topicId,
      "topic.bundle.json",
    ),
  );
}

export function isSeedableSubjectSlug(subjectSlug: string) {
  return !subjectSlug.endsWith("--draft");
}

export function listSubjectSlugs() {
  return listSubjectDirectories()
    .map((entry) => entry.subjectSlug)
    .filter((subjectSlug) => {
      if (isSeedableSubjectSlug(subjectSlug)) return true;
      console.warn(
        `[db:seed] Skipping generated draft subject folder: ${subjectSlug}`,
      );
      return false;
    })
    .sort();
}

function resolveCatalogSlugForSubject(subjectSlug: string) {
  for (const fileName of listCatalogFileNames()) {
    const manifest = loadCatalogManifest(fileName);
    if (manifest.catalog.subjectSlugs.includes(subjectSlug)) {
      return manifest.catalog.slug;
    }
  }

  throw new Error(
    `Subject "${subjectSlug}" is not listed in any authoring/catalogs/*.catalog.json file`,
  );
}

function listSubjectDirectories() {
  const out: Array<{ catalogSlug: string; subjectSlug: string }> = [];
  if (!fs.existsSync(subjectsRoot)) return out;

  for (const catalogEntry of fs.readdirSync(subjectsRoot, { withFileTypes: true })) {
    if (!catalogEntry.isDirectory()) continue;
    const catalogRoot = path.join(subjectsRoot, catalogEntry.name);

    for (const subjectEntry of fs.readdirSync(catalogRoot, { withFileTypes: true })) {
      if (!subjectEntry.isDirectory()) continue;

      const manifestPath = path.join(
        catalogRoot,
        subjectEntry.name,
        "subject.manifest.json",
      );
      if (!fs.existsSync(manifestPath)) continue;

      out.push({
        catalogSlug: catalogEntry.name,
        subjectSlug: subjectEntry.name,
      });
    }
  }

  return out;
}

function listCatalogFileNames() {
  if (!fs.existsSync(authoringCatalogsRoot)) return [];

  return fs
    .readdirSync(authoringCatalogsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".catalog.json"))
    .map((entry) => entry.name)
    .sort();
}


export type SeedDataSelection = {
  /** Live subject slugs, for example: sql-v2, python-v2. */
  subjectSlugs?: readonly string[] | null;
  /** Course references. Supports either live slugs or catalog/live-slug refs, for example: sql-v2 or sql/sql-v2. */
  courseRefs?: readonly string[] | null;
};

function normalizeSeedList(values: readonly string[] | null | undefined) {
  return (values ?? [])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function subjectSlugFromCourseRef(courseRef: string) {
  const parts = courseRef.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return courseRef.trim();
  if (parts.length > 2) {
    throw new Error(
      `Invalid seed course ref "${courseRef}". Use a live subject slug like "sql-v2" or catalog/live-subject like "sql/sql-v2".`,
    );
  }
  return parts[parts.length - 1] ?? courseRef.trim();
}

export function resolveSeedSubjectSlugsForSeed(selection: SeedDataSelection = {}) {
  const refs = [
    ...normalizeSeedList(selection.subjectSlugs),
    ...normalizeSeedList(selection.courseRefs),
  ];

  if (refs.length === 0) return null;

  const availableSubjectSlugs = new Set(listSubjectSlugs());
  const selected = new Set<string>();

  for (const ref of refs) {
    const subjectSlug = subjectSlugFromCourseRef(ref);

    if (!availableSubjectSlugs.has(subjectSlug)) {
      const available = [...availableSubjectSlugs].sort().join(", ");
      throw new Error(
        `Cannot seed unknown subject/course "${ref}". Resolved live subject slug "${subjectSlug}" was not found. Available live subjects: ${available}`,
      );
    }

    const parts = ref.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) {
      const [catalogSlug] = parts;
      const actualCatalogSlug = resolveCatalogSlugForSubject(subjectSlug);
      if (catalogSlug !== actualCatalogSlug) {
        throw new Error(
          `Cannot seed course "${ref}". Subject "${subjectSlug}" belongs to catalog "${actualCatalogSlug}", not "${catalogSlug}".`,
        );
      }
    }

    selected.add(subjectSlug);
  }

  return selected;
}

export function buildSeedData(selection: SeedDataSelection = {}) {
  const catalogs: CatalogSeed[] = [];
  const subjects: SubjectSeed[] = [];
  const modules: ModuleSeed[] = [];
  const sections: SectionSeed[] = [];
  const topics: TopicSeed[] = [];
  const subjectToCatalog = new Map<string, string>();
  const subjectCatalogOrder = new Map<string, number>();
  const selectedSubjectSlugs = resolveSeedSubjectSlugsForSeed(selection);

  for (const fileName of listCatalogFileNames()) {
    const manifest = loadCatalogManifest(fileName);
    const catalog = manifest.catalog;

    catalogs.push({
      slug: catalog.slug,
      order: catalog.order,
      title: catalog.title,
      description: catalog.description ?? null,
      imagePublicId: catalog.imagePublicId ?? null,
      imageAlt: catalog.imageAlt ?? null,
      defaultSubjectSlug: catalog.defaultSubjectSlug ?? catalog.subjectSlugs[0] ?? null,
      status: catalog.status ?? "active",
      meta: catalog.meta ?? null,
    });

    const localSubjectSlugs = new Set<string>();

    for (const [index, subjectSlug] of catalog.subjectSlugs.entries()) {
      if (localSubjectSlugs.has(subjectSlug)) {
        throw new Error(
          `Catalog "${catalog.slug}" lists subject "${subjectSlug}" more than once`,
        );
      }
      localSubjectSlugs.add(subjectSlug);

      const existing = subjectToCatalog.get(subjectSlug);
      if (existing) {
        throw new Error(
          `Subject "${subjectSlug}" is assigned to multiple catalogs: "${existing}" and "${catalog.slug}"`,
        );
      }

      subjectToCatalog.set(subjectSlug, catalog.slug);
      subjectCatalogOrder.set(subjectSlug, catalog.order * 1000 + index + 1);
    }
  }

  for (const subjectSlug of listSubjectSlugs()) {
    if (selectedSubjectSlugs && !selectedSubjectSlugs.has(subjectSlug)) continue;

    const manifest = loadSubjectManifest(subjectSlug);
    const subject = manifest.subject;
    const catalogSlug = String(
      subject.catalogSlug ?? subjectToCatalog.get(subject.slug) ?? subject.slug,
    ).trim();

    if (!catalogSlug) {
      throw new Error(`Subject "${subject.slug}" is missing a catalogSlug`);
    }

    const expectedCatalogSlug = subjectToCatalog.get(subject.slug);
    if (!expectedCatalogSlug) {
      throw new Error(
        `Subject "${subject.slug}" is not listed in any authoring/catalogs/*.catalog.json file`,
      );
    }

    if (expectedCatalogSlug && expectedCatalogSlug !== catalogSlug) {
      throw new Error(
        `Subject "${subject.slug}" points to catalog "${catalogSlug}" but catalog manifests assign "${expectedCatalogSlug}"`,
      );
    }

    const catalogOrder = subjectCatalogOrder.get(subject.slug);
    if (typeof catalogOrder !== "number") {
      throw new Error(
        `Subject "${subject.slug}" is missing a catalog order from authoring/catalogs/*.catalog.json`,
      );
    }

    subjects.push({
      slug: subject.slug,
      catalogSlug,
      order: catalogOrder,
      title: tag(subject.titleKey) ?? subject.slug,
      description: tag(subject.descriptionKey),
      imagePublicId: subject.imagePublicId ?? null,
      imageAlt: subject.imageAlt ?? null,
      accessPolicy: subject.accessPolicy ?? "free",
      status: subject.status ?? "active",
      meta: subject.meta ?? null,
    });

    for (const mod of manifest.modules) {
      modules.push({
        slug: mod.slug,
        subjectSlug: subject.slug,
        order: mod.order,
        title: tag(mod.titleKey) ?? mod.slug,
        description: tag(mod.descriptionKey),
        weekStart: mod.weekStart ?? null,
        weekEnd: mod.weekEnd ?? null,
        accessOverride: mod.accessOverride ?? "inherit",
        entitlementKey: mod.entitlementKey ?? null,
        meta: {
          estimatedMinutes: mod.meta?.estimatedMinutes,
          prereqs: (mod.meta?.prereqKeys ?? []).map((key) => tag(key) ?? key),
          outcomes: (mod.meta?.outcomeKeys ?? []).map((key) => tag(key) ?? key),
          why: (mod.meta?.whyKeys ?? []).map((key) => tag(key) ?? key),
        },
      });

      for (const section of mod.sections) {
        const topicSlugs = section.topics.map(
          (topicId) => `${mod.prefix}.${topicId}`,
        );

        sections.push({
          slug: section.slug,
          subjectSlug: subject.slug,
          moduleSlug: mod.slug,
          order: section.order,
          title: tag(section.titleKey) ?? section.slug,
          description: tag(section.descriptionKey),
          meta: {
            ...(section.meta ?? {}),
            ...(section.meta?.weeksKey
              ? { weeks: tag(section.meta.weeksKey) }
              : {}),
            ...(section.meta?.bulletKeys?.length
              ? {
                  bullets: section.meta.bulletKeys.map((key) => tag(key) ?? key),
                }
              : {}),
          },
          topicSlugs,
        });

        for (let index = 0; index < section.topics.length; index += 1) {
          const topicId = section.topics[index]!;
          const topicBundle = loadTopicBundle({
            subjectSlug: subject.slug,
            moduleOrder: mod.order,
            topicId,
          });

          topics.push({
            slug: `${mod.prefix}.${topicId}`,
            subjectSlug: subject.slug,
            moduleSlug: mod.slug,
            order: index,
            titleKey: topicBundle.topic.labelKey,
            description: tag(topicBundle.topic.summaryKey),
            genKey: subject.genKey,
            variant: topicId,
            meta: {
              label: tag(topicBundle.topic.labelKey) ?? topicId,
              minutes: topicBundle.minutes,
              pool: (topicBundle.exercises ?? []).map((exercise) => ({
                key: exercise.id,
                w: exercise.weight ?? 1,
                kind: exercise.kind as any,
              })),
              runtimeDefaults:
                topicBundle.runtimeDefaults ?? mod.runtimeDefaults ?? null,
            } as any,
          });
        }
      }
    }
  }

  return {
    catalogs,
    subjects,
    modules,
    topics,
    sections,
  };
}

const seedData = buildSeedData();

export const CATALOGS = seedData.catalogs;
export const SUBJECTS = seedData.subjects;
export const MODULES = seedData.modules;
export const TOPICS = seedData.topics;
export const SECTIONS = seedData.sections;
