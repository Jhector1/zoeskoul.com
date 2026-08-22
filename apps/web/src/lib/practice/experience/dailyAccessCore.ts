import type { AccessSnapshot } from "@/lib/access/accessSnapshot";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { practiceModuleAccessKey } from "./practiceAccessKey";
import {
  selectVisibleSubjectsForActor,
  type SubjectVersioningLike,
} from "@/lib/subjects/server/subjectVisibilityCore";

export type DailyAccessSubject = {
  id: string;
  slug: string;
  accessPolicy: "free" | "paid";
  visibility: "public" | "private" | "organization";
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
 * Pure Daily Practice visibility projection used by the server loader and tests.
 *
 * Subject/version visibility and restricted-course audience access remain
 * enforced. Normal paid-course/module entitlement is intentionally not a Daily
 * Practice boundary: the configured daily question cap is the entitlement.
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
  const allowedModuleKeys = new Set<string>();

  for (const subjectModule of args.modules) {
    if (!visibleSubjectSlugs.has(subjectModule.subjectSlug)) continue;

    const subject = subjectBySlug.get(subjectModule.subjectSlug) ?? null;
    const decision = resolveModuleAccess({
      subject: subject
        ? {
            id: subject.id,
            slug: subject.slug,
            accessPolicy: subject.accessPolicy,
            visibility: subject.visibility,
            entitlementKey: subject.entitlementKey ?? null,
          }
        : null,
      module: {
        id: subjectModule.id,
        slug: subjectModule.slug,
        accessOverride: subjectModule.accessOverride,
        entitlementKey: subjectModule.entitlementKey ?? null,
      },
      snapshot: args.snapshot,
      requireAll: args.requireAll,
    });

    if (!decision.ok && decision.reason !== "requires_payment") {
      continue;
    }

    allowedModuleKeys.add(
      practiceModuleAccessKey(subjectModule.subjectSlug, subjectModule.slug),
    );
  }

  return args.options.filter(
    (option) =>
      visibleSubjectSlugs.has(option.subjectSlug) &&
      allowedModuleKeys.has(
        practiceModuleAccessKey(option.subjectSlug, option.moduleSlug),
      ),
  );
}
