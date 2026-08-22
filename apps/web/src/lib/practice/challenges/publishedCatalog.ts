import "server-only";

import { CATALOG_MANIFESTS } from "@zoeskoul/curriculum-registry/runtime";
import { SUBJECT_GENERATOR_SOURCES } from "@zoeskoul/curriculum-registry/runtime";
import { resolvePublishedPracticeTarget } from "./target";
import {
  collectStandaloneTryItExerciseKeys,
  resolvePublishedExerciseCapabilities,
  resolvePublishedPracticeSectionRole,
  type PublishedPracticeSectionRole,
} from "./publishedExerciseMetadata";

type PracticeExerciseOptionBase = {
  id: string;
  catalogSlug: string;
  catalogTitle: string;
  subjectSlug: string;
  subjectTitle: string;
  subjectTitleKey?: string | null;
  moduleSlug: string;
  moduleTitle: string;
  moduleTitleKey?: string | null;
  sectionSlug: string;
  sectionTitle: string;
  sectionTitleKey?: string | null;
  sectionRole: PublishedPracticeSectionRole;
  topicSlug: string;
  topicTitle: string;
  topicTitleKey?: string | null;
  exerciseKey: string;
  exerciseTitle: string;
  exerciseKind: string;
  exercisePurpose: "quiz" | "project" | "try_it" | "practice";
  isMultiFile: boolean;
  requiresTerminal: boolean;
  isStandaloneTryIt: boolean;
};

export type PublishedPracticeExerciseOption = PracticeExerciseOptionBase & {
  releaseStatus: "active" | "legacy";
};

export type PracticeChooserPublishedExerciseOption = PracticeExerciseOptionBase & {
  releaseStatus: "draft" | "active" | "legacy";
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

function authoredTitleKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return key || null;
}

function releaseStatusForSubject(
  source: (typeof SUBJECT_GENERATOR_SOURCES)[string],
): "draft" | "active" | "legacy" | null {
  const status = source.manifest.subject.status ?? "active";
  const release = source.manifest.subject.meta?.versioning?.status ?? "active";

  if (status !== "active" || release === "disabled") return null;
  if (release === "draft") return "draft";
  return release === "legacy" ? "legacy" : "active";
}

async function listAuthoredPracticeExerciseOptions(args: {
  allowedSubjectSlugs?: ReadonlySet<string>;
  includeDraft: boolean;
}): Promise<PracticeChooserPublishedExerciseOption[]> {
  const options: Array<PracticeChooserPublishedExerciseOption & { sortKey: string }> = [];
  const catalogs = Object.values(CATALOG_MANIFESTS)
    .map((entry) => entry.catalog)
    .filter((catalog) => (catalog.status ?? "active") === "active")
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  for (const catalog of catalogs) {
    for (const subjectSlug of catalog.subjectSlugs) {
      const source = SUBJECT_GENERATOR_SOURCES[subjectSlug];
      if (!source) continue;

      if (
        args.allowedSubjectSlugs &&
        !args.allowedSubjectSlugs.has(subjectSlug)
      ) {
        continue;
      }

      const releaseStatus = releaseStatusForSubject(source);
      if (!releaseStatus) continue;
      if (releaseStatus === "draft" && !args.includeDraft) continue;

      const subject = source.manifest.subject;
      const modules = [...source.manifest.modules].sort(
        (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
      );

      for (const subjectModule of modules) {
        const sections = [...subjectModule.sections].sort(
          (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
        );

        for (const section of sections) {
          for (let topicIndex = 0; topicIndex < section.topics.length; topicIndex += 1) {
            const topicId = section.topics[topicIndex];
            const topic = source.topicManifests[topicId];
            if (!topic) continue;

            // Shared subject artifacts use `${module.prefix}.${topicId}` as the
            // canonical topic identity. Keep the raw id only for manifest lookup.
            const canonicalTopicSlug = `${subjectModule.prefix}.${topicId}`;
            const topicRecord = topic as unknown as Record<string, unknown>;
            const standaloneTryItExerciseKeys =
              collectStandaloneTryItExerciseKeys(topicRecord);
            const sectionRole = resolvePublishedPracticeSectionRole(
              (section as { role?: unknown }).role,
            );

            for (let exerciseIndex = 0; exerciseIndex < topic.exercises.length; exerciseIndex += 1) {
              const exercise = topic.exercises[exerciseIndex] as Record<string, unknown>;
              const purpose = String(exercise.purpose ?? "");
              if (
                purpose !== "quiz" &&
                purpose !== "project" &&
                purpose !== "try_it" &&
                purpose !== "practice"
              ) continue;

              try {
                const capabilities = resolvePublishedExerciseCapabilities(
                  exercise,
                  topicRecord,
                );
                const target = resolvePublishedPracticeTarget({
                  subjectSlug,
                  moduleSlug: subjectModule.slug,
                  sectionSlug: section.slug,
                  topicSlug: topicId,
                  exerciseKey: String(exercise.id ?? ""),
                  exercisePurpose: purpose,
                });

                const id = [
                  subjectSlug,
                  subjectModule.slug,
                  section.slug,
                  canonicalTopicSlug,
                  target.exerciseKey,
                ].join("::");

                options.push({
                  id,
                  catalogSlug: catalog.slug,
                  catalogTitle: catalog.title,
                  subjectSlug,
                  subjectTitle: titleFromKey(subject.titleKey, subjectSlug),
                  subjectTitleKey: authoredTitleKey(subject.titleKey),
                  releaseStatus,
                  moduleSlug: subjectModule.slug,
                  moduleTitle: titleFromKey(subjectModule.titleKey, subjectModule.slug),
                  moduleTitleKey: authoredTitleKey(subjectModule.titleKey),
                  sectionSlug: section.slug,
                  sectionTitle: titleFromKey(section.titleKey, section.slug),
                  sectionTitleKey: authoredTitleKey(section.titleKey),
                  sectionRole,
                  topicSlug: canonicalTopicSlug,
                  topicTitle: titleFromKey(topic.topic?.labelKey, canonicalTopicSlug),
                  topicTitleKey: authoredTitleKey(topic.topic?.labelKey),
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
                    String(subjectModule.order).padStart(4, "0"),
                    String(section.order).padStart(4, "0"),
                    String(topicIndex).padStart(4, "0"),
                    String(exerciseIndex).padStart(4, "0"),
                  ].join("|"),
                });
              } catch {
                // Skip malformed or stale authored targets. Authenticated practice
                // eligibility is decided later by the selected product policy.
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

export async function listPublishedPracticeExerciseOptions(): Promise<
  PublishedPracticeExerciseOption[]
> {
  const options = await listAuthoredPracticeExerciseOptions({
    includeDraft: false,
  });

  return options.filter(
    (option): option is PublishedPracticeExerciseOption =>
      option.releaseStatus !== "draft",
  );
}

export async function listVisiblePracticeChooserExerciseOptions(
  allowedSubjectSlugs: ReadonlySet<string>,
): Promise<PracticeChooserPublishedExerciseOption[]> {
  return listAuthoredPracticeExerciseOptions({
    allowedSubjectSlugs,
    includeDraft: true,
  });
}

export async function listPublishedChallengeExerciseOptions(): Promise<
  PublishedChallengeExerciseOption[]
> {
  const options = await listPublishedPracticeExerciseOptions();
  return options.filter(
    (option) =>
      option.exercisePurpose === "project" &&
      option.exerciseKind === "code_input",
  );
}
