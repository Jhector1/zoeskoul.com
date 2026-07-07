import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { getAccessSnapshot } from "@/lib/access/accessSnapshot";
import type { Actor } from "@/lib/practice/actor";
import { actorKeyOf } from "@/lib/practice/actor";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { SUBJECT_GENERATOR_SOURCES } from "@/lib/subjects/subjects.generated";
import {
  selectAccessibleDailyPracticeOptions,
  type DailyAccessModule,
  type DailyAccessSubject,
} from "./dailyAccessCore";

function versioningForSubject(
  subjectSlug: string,
  releaseStatus: "active" | "legacy",
) {
  const source = SUBJECT_GENERATOR_SOURCES[subjectSlug] as any;
  const configured = source?.manifest?.subject?.meta?.versioning ?? null;

  return (
    configured ?? {
      family: subjectSlug,
      status: releaseStatus,
      defaultForNewEnrollments: releaseStatus === "active",
    }
  );
}

export async function filterDailyPracticeOptionsForActor(args: {
  prisma: PrismaClient;
  actor: Actor;
  options: readonly PublishedPracticeExerciseOption[];
}): Promise<PublishedPracticeExerciseOption[]> {
  if (args.options.length === 0) return [];

  const subjectSlugs = [...new Set(args.options.map((option) => option.subjectSlug))];
  const moduleSlugs = [...new Set(args.options.map((option) => option.moduleSlug))];

  const dbModules = await args.prisma.practiceModule.findMany({
    where: {
      slug: { in: moduleSlugs },
      subject: {
        slug: { in: subjectSlugs },
        status: "active",
      },
    },
    select: {
      id: true,
      slug: true,
      accessOverride: true,
      entitlementKey: true,
      subject: {
        select: {
          id: true,
          slug: true,
          accessPolicy: true,
          entitlementKey: true,
        },
      },
    },
  });

  if (dbModules.length === 0) return [];

  const dbSubjects = new Map(
    dbModules
      .filter((module) => module.subject)
      .map((module) => [module.subject!.slug, module.subject!] as const),
  );
  const subjectIds = [...new Set([...dbSubjects.values()].map((subject) => subject.id))];
  const moduleIds = dbModules.map((module) => module.id);
  const actorKey = actorKeyOf(args.actor);

  const [enrollments, snapshot] = await Promise.all([
    subjectIds.length
      ? args.prisma.subjectEnrollment.findMany({
          where: {
            actorKey,
            subjectId: { in: subjectIds },
            status: { in: ["enrolled", "completed"] },
          },
          select: { subjectId: true },
        })
      : Promise.resolve([]),
    getAccessSnapshot(args.prisma, args.actor, {
      subjectIds,
      moduleIds,
    }),
  ]);

  const enrolledSubjectIds = new Set(enrollments.map((row) => row.subjectId));
  const releaseBySubject = new Map(
    args.options.map(
      (option) => [option.subjectSlug, option.releaseStatus] as const,
    ),
  );

  const subjects: DailyAccessSubject[] = [...dbSubjects.values()].map((subject) => ({
    id: subject.id,
    slug: subject.slug,
    accessPolicy: subject.accessPolicy as "free" | "paid",
    entitlementKey: subject.entitlementKey,
    enrolled: enrolledSubjectIds.has(subject.id),
    versioning: versioningForSubject(
      subject.slug,
      releaseBySubject.get(subject.slug) ?? "active",
    ),
  }));

  const modules: DailyAccessModule[] = dbModules.flatMap((module) =>
    module.subject
      ? [
          {
            id: module.id,
            slug: module.slug,
            accessOverride: module.accessOverride as "inherit" | "free" | "paid",
            entitlementKey: module.entitlementKey,
            subjectSlug: module.subject.slug,
          },
        ]
      : [],
  );

  return selectAccessibleDailyPracticeOptions({
    options: args.options,
    subjects,
    modules,
    snapshot,
    requireAll: process.env.BILLING_REQUIRE_ALL_MODULES === "1",
  });
}
