import type { AccessSnapshot } from "@/lib/access/accessSnapshot";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  selectVisibleSubjectsForActor,
  type SubjectVersioningLike,
} from "@/lib/subjects/server/subjectVisibilityCore";

export type DailyAccessSubject = {
  id: string;
  slug: string;
  accessPolicy: "free" | "paid";
  entitlementKey?: string | null;
  enrolled: boolean;
  versioning: SubjectVersioningLike;
};

export type DailyAccessModule = {
  id: string;
  slug: string;
  accessOverride: "inherit" | "free" | "paid";
  entitlementKey?: string | null;
  subjectSlug: string;
};

/**
 * Pure access/visibility projection used by the server loader and unit tests.
 * Daily Practice must never become a side door into hidden legacy versions or
 * modules the current learner cannot normally open.
 */
export function selectAccessibleDailyPracticeOptions(args: {
  options: readonly PublishedPracticeExerciseOption[];
  subjects: readonly DailyAccessSubject[];
  modules: readonly DailyAccessModule[];
  snapshot: AccessSnapshot;
  requireAll?: boolean;
}): PublishedPracticeExerciseOption[] {
  const visibleSubjectSlugs = new Set(
    selectVisibleSubjectsForActor(args.subjects, {
      familyPreference: "enrolled",
    }).map((subject) => subject.slug),
  );

  const subjectBySlug = new Map(
    args.subjects.map((subject) => [subject.slug, subject] as const),
  );
  const allowedModuleSlugs = new Set<string>();

  for (const module of args.modules) {
    if (!visibleSubjectSlugs.has(module.subjectSlug)) continue;

    const subject = subjectBySlug.get(module.subjectSlug) ?? null;
    const decision = resolveModuleAccess({
      subject: subject
        ? {
            id: subject.id,
            slug: subject.slug,
            accessPolicy: subject.accessPolicy,
            entitlementKey: subject.entitlementKey ?? null,
          }
        : null,
      module: {
        id: module.id,
        slug: module.slug,
        accessOverride: module.accessOverride,
        entitlementKey: module.entitlementKey ?? null,
      },
      snapshot: args.snapshot,
      requireAll: args.requireAll,
    });

    if (decision.ok) allowedModuleSlugs.add(module.slug);
  }

  return args.options.filter(
    (option) =>
      visibleSubjectSlugs.has(option.subjectSlug) &&
      allowedModuleSlugs.has(option.moduleSlug),
  );
}
