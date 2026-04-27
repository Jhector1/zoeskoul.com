import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ModuleSeed,
  SectionSeed,
  SubjectSeed,
  TopicSeed,
} from "./subjects/_types";

type SubjectManifest = {
  subject: {
    slug: string;
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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function tag(key: string | null | undefined) {
  return key ? `@:${key}` : null;
}

function loadSubjectManifest(subjectSlug: string): SubjectManifest {
  return readJson<SubjectManifest>(
    path.join(subjectsRoot, subjectSlug, "subject.manifest.json"),
  );
}

function loadTopicBundle(args: {
  subjectSlug: string;
  moduleOrder: number;
  topicId: string;
}): TopicBundleManifest {
  return readJson<TopicBundleManifest>(
    path.join(
      subjectsRoot,
      args.subjectSlug,
      "modules",
      `module${args.moduleOrder}`,
      "topics",
      args.topicId,
      "topic.bundle.json",
    ),
  );
}

function listSubjectSlugs() {
  return fs
    .readdirSync(subjectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((subjectSlug) =>
      fs.existsSync(path.join(subjectsRoot, subjectSlug, "subject.manifest.json")),
    )
    .sort();
}

function buildSeedData() {
  const subjects: SubjectSeed[] = [];
  const modules: ModuleSeed[] = [];
  const sections: SectionSeed[] = [];
  const topics: TopicSeed[] = [];

  for (const subjectSlug of listSubjectSlugs()) {
    const manifest = loadSubjectManifest(subjectSlug);
    const subject = manifest.subject;

    subjects.push({
      slug: subject.slug,
      order: subject.order,
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
    subjects,
    modules,
    topics,
    sections,
  };
}

const seedData = buildSeedData();

export const SUBJECTS = seedData.subjects;
export const MODULES = seedData.modules;
export const TOPICS = seedData.topics;
export const SECTIONS = seedData.sections;
