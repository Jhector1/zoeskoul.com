import "server-only";

import { prisma } from "@/lib/prisma";
import { CATALOG_MANIFESTS } from "@/lib/subjects/catalogs.generated";
import { SUBJECT_GENERATOR_SOURCES } from "@/lib/subjects/subjects.generated";
import { resolveSharedChallengeTarget } from "./target";
import {
  collectStandaloneTryItExerciseKeys,
  resolvePublishedExerciseCapabilities,
  resolvePublishedPracticeSectionRole,
  type PublishedPracticeSectionRole,
} from "./publishedExerciseMetadata";

export type PublishedPracticeExerciseOption = {
  id: string;
  catalogSlug: string;
  catalogTitle: string;
  subjectSlug: string;
  subjectTitle: string;
  releaseStatus: "active" | "legacy";
  moduleSlug: string;
  moduleTitle: string;
  sectionSlug: string;
  sectionTitle: string;
  sectionRole: PublishedPracticeSectionRole;
  topicSlug: string;
  topicTitle: string;
  exerciseKey: string;
  exerciseTitle: string;
  exerciseKind: string;
  exercisePurpose: "quiz" | "project";
  isMultiFile: boolean;
  requiresTerminal: boolean;
  isStandaloneTryIt: boolean;
};

// Backward-compatible name used by the public-challenge publisher. Daily practice
// imports the generic published-practice name so the two products stay distinct.
export type PublishedChallengeExerciseOption = PublishedPracticeExerciseOption;

function humanize(value: string) {
  return value
    .replace(/^@:/, "")
    .split(".")
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || value;
}

function titleFromKey(value: unknown, fallback: string) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return humanize(fallback);

  const parts = key.replace(/^@:/, "").split(".").filter(Boolean);
  const tail = parts.at(-1);
  const candidate =
    tail === "title" || tail === "label" || tail === "summary"
      ? parts.at(-2)
      : tail;

  return humanize(candidate || fallback);
}


function releaseStatusForSubject(
  source: (typeof SUBJECT_GENERATOR_SOURCES)[string],
): "active" | "legacy" | null {
  const status = source.manifest.subject.status ?? "active";
  const release = source.manifest.subject.meta?.versioning?.status ?? "active";

  if (status !== "active") return null;
  if (release === "draft" || release === "disabled") return null;
  return release === "legacy" ? "legacy" : "active";
}

export async function listPublishedPracticeExerciseOptions(): Promise<
  PublishedPracticeExerciseOption[]
> {
  const activeSubjects = await prisma.practiceSubject.findMany({
    where: { status: "active" },
    select: { id: true, slug: true },
  });
  const subjectSlugById = new Map(
    activeSubjects.map((subject) => [subject.id, subject.slug] as const),
  );
  const activeSubjectIds = activeSubjects.map((subject) => subject.id);

  const seededSections = activeSubjectIds.length
    ? await prisma.practiceSection.findMany({
        where: { subjectId: { in: activeSubjectIds } },
        select: {
          slug: true,
          subjectId: true,
          module: { select: { slug: true } },
        },
      })
    : [];

  const availableSections = new Set(
    seededSections.flatMap((section) => {
      if (!section.subjectId) return [];

      const subjectSlug = subjectSlugById.get(section.subjectId);
      const moduleSlug = section.module?.slug;
      return subjectSlug && moduleSlug
        ? [`${subjectSlug}|${moduleSlug}|${section.slug}`]
        : [];
    }),
  );

  const options: Array<PublishedPracticeExerciseOption & { sortKey: string }> = [];
  const catalogs = Object.values(CATALOG_MANIFESTS)
    .map((entry) => entry.catalog)
    .filter((catalog) => (catalog.status ?? "active") === "active")
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  for (const catalog of catalogs) {
    for (const subjectSlug of catalog.subjectSlugs) {
      const source = SUBJECT_GENERATOR_SOURCES[subjectSlug];
      if (!source) continue;

      const releaseStatus = releaseStatusForSubject(source);
      if (!releaseStatus || !activeSubjects.some((row) => row.slug === subjectSlug)) {
        continue;
      }

      const subject = source.manifest.subject;
      const modules = [...source.manifest.modules].sort(
        (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
      );

      for (const module of modules) {
        const sections = [...module.sections].sort(
          (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
        );

        for (const section of sections) {
          if (
            !availableSections.has(
              `${subjectSlug}|${module.slug}|${section.slug}`,
            )
          ) {
            continue;
          }

          for (let topicIndex = 0; topicIndex < section.topics.length; topicIndex += 1) {
            const topicId = section.topics[topicIndex];
            const topic = source.topicManifests[topicId];
            if (!topic) continue;

            const topicRecord = topic as unknown as Record<string, unknown>;
            const standaloneTryItExerciseKeys =
              collectStandaloneTryItExerciseKeys(topicRecord);
            const sectionRole = resolvePublishedPracticeSectionRole(
              (section as { role?: unknown }).role,
            );

            for (let exerciseIndex = 0; exerciseIndex < topic.exercises.length; exerciseIndex += 1) {
              const exercise = topic.exercises[exerciseIndex] as Record<string, unknown>;
              const purpose = String(exercise.purpose ?? "");
              if (purpose !== "quiz" && purpose !== "project") continue;

              try {
                const capabilities = resolvePublishedExerciseCapabilities(
                  exercise,
                  topicRecord,
                );
                const target = resolveSharedChallengeTarget({
                  subjectSlug,
                  moduleSlug: module.slug,
                  sectionSlug: section.slug,
                  topicSlug: topicId,
                  exerciseKey: String(exercise.id ?? ""),
                  exercisePurpose: purpose,
                });

                const id = [
                  subjectSlug,
                  module.slug,
                  section.slug,
                  target.topicSlug,
                  target.exerciseKey,
                ].join("::");

                options.push({
                  id,
                  catalogSlug: catalog.slug,
                  catalogTitle: catalog.title,
                  subjectSlug,
                  subjectTitle: titleFromKey(subject.titleKey, subjectSlug),
                  releaseStatus,
                  moduleSlug: module.slug,
                  moduleTitle: titleFromKey(module.titleKey, module.slug),
                  sectionSlug: section.slug,
                  sectionTitle: titleFromKey(section.titleKey, section.slug),
                  sectionRole,
                  topicSlug: target.topicSlug,
                  topicTitle: titleFromKey(topic.topic?.labelKey, target.topicSlug),
                  exerciseKey: target.exerciseKey,
                  exerciseTitle: target.exerciseTitle,
                  exerciseKind: target.exerciseKind,
                  exercisePurpose: target.exercisePurpose,
                  isMultiFile: capabilities.isMultiFile,
                  requiresTerminal: capabilities.requiresTerminal,
                  isStandaloneTryIt: standaloneTryItExerciseKeys.has(
                    target.exerciseKey,
                  ),
                  sortKey: [
                    String(catalog.order).padStart(4, "0"),
                    String(subject.order).padStart(4, "0"),
                    String(module.order).padStart(4, "0"),
                    String(section.order).padStart(4, "0"),
                    String(topicIndex).padStart(4, "0"),
                    String(exerciseIndex).padStart(4, "0"),
                  ].join("|"),
                });
              } catch {
                // The publisher page intentionally lists only targets that can
                // run anonymously through the existing practice-trial runtime.
              }
            }
          }
        }
      }
    }
  }

  return options
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _sortKey, ...option }) => option);
}


export async function listPublishedChallengeExerciseOptions(): Promise<
  PublishedChallengeExerciseOption[]
> {
  return listPublishedPracticeExerciseOptions();
}
