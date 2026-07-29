import "server-only";

import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { listPublishedPracticeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import { buildBillingHref } from "@/lib/billing/moduleAccess";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";
import { selectVisibleSubjectsForActor } from "@/lib/subjects/server/subjectVisibilityCore";
import { loadPracticeAccessModelForActor } from "./dailyAccess";
import { buildPracticeChooserCatalogs } from "./practiceChooserCore";
import { practiceModuleAccessKey } from "./practiceAccessKey";
import type {
  PracticeChooserCatalog,
  PracticeChooserMode,
} from "./practiceChooserTypes";

export async function loadPracticeChooser(args: {
  actor: Actor;
  locale: string;
  mode: PracticeChooserMode;
}): Promise<PracticeChooserCatalog[]> {
  const options = await listPublishedPracticeExerciseOptions();
  const model = await loadPracticeAccessModelForActor({
    prisma,
    actor: args.actor,
    options,
  });

  const visibleSubjects = selectVisibleSubjectsForActor(model.subjects, {
    familyPreference: "enrolled",
  });
  const visibleSubjectSlugs = new Set(
    visibleSubjects.map((subject) => subject.slug),
  );
  const subjectBySlug = new Map(
    model.subjects.map((subject) => [subject.slug, subject] as const),
  );
  const moduleAccessByKey = new Map<
    string,
    {
      availability: "available" | "locked" | "unavailable";
      billingHref: string | null;
    }
  >();

  for (const subjectModule of model.modules) {
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
      snapshot: model.snapshot,
      requireAll: model.requireAll,
    });

    const nextPath =
      `/${encodeURIComponent(args.locale)}/practice/daily?` +
      new URLSearchParams({
        subject: subjectModule.subjectSlug,
        module: subjectModule.slug,
      }).toString();

    moduleAccessByKey.set(
      practiceModuleAccessKey(subjectModule.subjectSlug, subjectModule.slug),
      {
        availability: decision.ok ? "available" : "locked",
        billingHref: decision.ok
          ? null
          : buildBillingHref({
              locale: args.locale,
              next: nextPath,
              back: `/${encodeURIComponent(args.locale)}/practice/daily`,
              reason: "module",
              subject: subjectModule.subjectSlug,
              module: subjectModule.slug,
            }),
      },
    );
  }

  const catalogs = buildPracticeChooserCatalogs({
    options,
    visibleSubjectSlugs,
    moduleAccessByKey,
  });

  if (args.mode === "subscriber") return catalogs;

  return catalogs
    .map((catalog) => ({
      ...catalog,
      courses: catalog.courses
        .map((course) => ({
          ...course,
          modules: course.modules.map((module) => ({
            ...module,
            availability:
              module.availability === "available" &&
              module.dailyExerciseCount <= 0
                ? ("unavailable" as const)
                : module.availability,
          })),
        }))
        .filter((course) => course.modules.length > 0),
    }))
    .filter((catalog) => catalog.courses.length > 0);
}
