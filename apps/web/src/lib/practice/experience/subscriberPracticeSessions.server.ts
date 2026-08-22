import "server-only";

import { prisma } from "@/lib/prisma";
import {
  listPublishedPracticeExerciseOptions,
  type PublishedPracticeExerciseOption,
} from "@/lib/practice/challenges/publishedCatalog";
import {
  authoredPracticeTargetFromOption,
  type AuthoredPracticeTarget,
  authoredPracticeTargetIdentity,
  resolveAuthoredPracticeHistoryTarget,
  selfPacedPracticeExperienceOwnerPrefix,
} from "./authoredPracticeQueue";
import type {
  PracticeChooserCatalog,
  SubscriberPracticeContinuationSummary,
} from "./practiceChooserTypes";
import {
  listSubscriberPracticePoolOptions,
  type SubscriberPracticeHistoryItem,
} from "./subscriberPractice";

export type SubscriberModulePracticeProgress = {
  completed: number;
  total: number;
  pct: number;
};

export async function loadSubscriberModulePracticeHistory(args: {
  userId?: string | null;
  subjectSlug: string;
  moduleSlug: string;
  moduleId?: string | null;
  publishedOptions?: readonly PublishedPracticeExerciseOption[];
}): Promise<SubscriberPracticeHistoryItem[]> {
  if (!args.userId) return [];

  const publishedOptions =
    args.publishedOptions ?? (await listPublishedPracticeExerciseOptions());
  const candidates = listSubscriberPracticePoolOptions({
    options: publishedOptions,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
  }).map(authoredPracticeTargetFromOption);
  if (!candidates.length) return [];

  const moduleId =
    String(args.moduleId ?? "").trim() ||
    (
      await prisma.practiceModule.findFirst({
        where: {
          slug: args.moduleSlug,
          subject: {
            slug: args.subjectSlug,
          },
        },
        select: { id: true },
      })
    )?.id ||
    null;
  if (!moduleId) return [];

  const canonicalPrefix = selfPacedPracticeExperienceOwnerPrefix({
    userId: args.userId,
    moduleSlug: args.moduleSlug,
  });
  const rows = await prisma.practiceQuestionInstance.findMany({
    where: {
      OR: [
        {
          experienceItemKey: { startsWith: canonicalPrefix },
        },
        // Legacy standard Practice rows remain readable so existing learner
        // completions are never lost. New normal self-paced Practice does not
        // create PracticeSession rows.
        {
          session: {
            userId: args.userId,
            moduleId,
          },
        },
      ],
    },
    select: {
      sessionId: true,
      exerciseKey: true,
      experienceItemKey: true,
      publicPayload: true,
      answeredAt: true,
      createdAt: true,
      topic: {
        select: { slug: true },
      },
      attempts: {
        where: {
          userId: args.userId,
          revealUsed: false,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { ok: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  return rows.flatMap((row) => {
    const target = resolveAuthoredPracticeHistoryTarget({
      item: row,
      candidates,
    });
    if (!target) return [];

    return [
      {
        exerciseKey: target.exerciseKey,
        topicSlug: target.topicSlug,
        seenAt: row.answeredAt ?? row.createdAt,
        completedAt: row.answeredAt,
        lastOk: row.attempts[0]?.ok ?? null,
        sessionId: row.sessionId,
      },
    ];
  });
}

export type CanonicalModulePracticeDisplay = {
  moduleTotal: number;
  selectedTargets: AuthoredPracticeTarget[];
  completedPrefix: Array<AuthoredPracticeTarget & { correct: boolean }>;
};

/**
 * Response-time display projection for one canonical authored Practice module.
 *
 * This is intentionally not stored on PracticeSession. Module membership comes
 * from the current published authored Practice pool and completion comes from
 * canonical learner/module history.
 */
export async function loadCanonicalModulePracticeDisplay(args: {
  userId?: string | null;
  subjectSlug: string;
  moduleSlug: string;
  moduleId?: string | null;
  publishedOptions?: readonly PublishedPracticeExerciseOption[];
}): Promise<CanonicalModulePracticeDisplay> {
  const publishedOptions =
    args.publishedOptions ?? (await listPublishedPracticeExerciseOptions());
  const pool = listSubscriberPracticePoolOptions({
    options: publishedOptions,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
  });
  const selectedTargets = pool.map(authoredPracticeTargetFromOption);

  const history = await loadSubscriberModulePracticeHistory({
    userId: args.userId,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    moduleId: args.moduleId,
    publishedOptions,
  });

  const completedByIdentity = new Map<string, boolean>();
  for (const item of history) {
    if (!item.completedAt) continue;
    const identity = authoredPracticeTargetIdentity({
      topicSlug: item.topicSlug,
      exerciseKey: item.exerciseKey,
    });
    if (!completedByIdentity.has(identity)) {
      completedByIdentity.set(identity, item.lastOk === true);
    }
  }

  const completedPrefix = selectedTargets.flatMap((target) => {
    const identity = authoredPracticeTargetIdentity(target);
    if (!completedByIdentity.has(identity)) return [];
    return [{ ...target, correct: completedByIdentity.get(identity) === true }];
  });

  return {
    moduleTotal: selectedTargets.length,
    selectedTargets,
    completedPrefix,
  };
}

export async function loadSubscriberModulePracticeProgress(args: {
  userId?: string | null;
  subjectSlug: string;
  moduleSlug: string;
}): Promise<SubscriberModulePracticeProgress> {
  const publishedOptions = await listPublishedPracticeExerciseOptions();
  const pool = listSubscriberPracticePoolOptions({
    options: publishedOptions,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
  });
  const total = pool.length;
  if (!total || !args.userId) {
    return { completed: 0, total, pct: 0 };
  }

  const history = await loadSubscriberModulePracticeHistory({
    userId: args.userId,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    publishedOptions,
  });
  const completedIdentities = new Set(
    history
      .filter((item) => Boolean(item.completedAt))
      .map((item) =>
        authoredPracticeTargetIdentity({
          topicSlug: item.topicSlug,
          exerciseKey: item.exerciseKey,
        }),
      ),
  );
  const completed = pool.filter((option) =>
    completedIdentities.has(
      authoredPracticeTargetIdentity({
        topicSlug: option.topicSlug,
        exerciseKey: option.exerciseKey,
      }),
    ),
  ).length;

  return {
    completed,
    total,
    pct: total > 0 ? completed / total : 0,
  };
}

type CanonicalContinuationDescriptor = {
  key: string;
  canonicalPrefix: string;
  catalog: PracticeChooserCatalog;
  course: PracticeChooserCatalog["courses"][number];
  module: PracticeChooserCatalog["courses"][number]["modules"][number];
  candidates: AuthoredPracticeTarget[];
};

/**
 * Project unfinished module Practice from canonical learner history.
 *
 * Normal Practice has no resumable PracticeSession owner. This is one batched
 * read projection used only to surface Continue affordances. Clicking Continue
 * goes through startSelfPacedPractice again and therefore reuses the same
 * canonical learner + module + authored-exercise history.
 */
export async function loadSubscriberPracticeContinuations(args: {
  userId: string;
  catalogs: readonly PracticeChooserCatalog[];
  limit?: number;
}): Promise<SubscriberPracticeContinuationSummary[]> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return [];

  const publishedOptions = await listPublishedPracticeExerciseOptions();
  const descriptors: CanonicalContinuationDescriptor[] = args.catalogs.flatMap(
    (catalog) =>
      catalog.courses.flatMap((course) =>
        course.modules.flatMap((module) => {
          if (module.availability !== "available" || module.exerciseCount <= 0) {
            return [];
          }

          const candidates = listSubscriberPracticePoolOptions({
            options: publishedOptions,
            subjectSlug: course.slug,
            moduleSlug: module.slug,
          }).map(authoredPracticeTargetFromOption);
          if (!candidates.length) return [];

          return [{
            key: `${course.slug}|${module.slug}`,
            canonicalPrefix: selfPacedPracticeExperienceOwnerPrefix({
              userId,
              moduleSlug: module.slug,
            }),
            catalog,
            course,
            module,
            candidates,
          }];
        }),
      ),
  );
  if (!descriptors.length) return [];

  const dbModules = await prisma.practiceModule.findMany({
    where: {
      OR: descriptors.map((descriptor) => ({
        slug: descriptor.module.slug,
        subject: { slug: descriptor.course.slug },
      })),
    },
    select: {
      id: true,
      slug: true,
      subject: { select: { slug: true } },
    },
  });
  const descriptorKeyByModuleId = new Map(
    dbModules.flatMap((row) =>
      row.subject
        ? [[row.id, `${row.subject.slug}|${row.slug}`] as const]
        : [],
    ),
  );
  const moduleIds = [...descriptorKeyByModuleId.keys()];

  const rows = await prisma.practiceQuestionInstance.findMany({
    where: {
      OR: [
        ...descriptors.map((descriptor) => ({
          experienceItemKey: { startsWith: descriptor.canonicalPrefix },
        })),
        ...(moduleIds.length
          ? [{
              session: {
                userId,
                moduleId: { in: moduleIds },
              },
            }]
          : []),
      ],
    },
    select: {
      exerciseKey: true,
      experienceItemKey: true,
      publicPayload: true,
      answeredAt: true,
      createdAt: true,
      topic: { select: { slug: true } },
      session: { select: { moduleId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const continuations: SubscriberPracticeContinuationSummary[] = [];

  for (const descriptor of descriptors) {
    const completed = new Set<string>();
    let hasHistory = false;
    let lastOpenedMs = 0;

    for (const row of rows) {
      const canonicalOwner =
        typeof row.experienceItemKey === "string" &&
        row.experienceItemKey.startsWith(descriptor.canonicalPrefix);
      const legacyOwner =
        row.session?.moduleId != null &&
        descriptorKeyByModuleId.get(row.session.moduleId) === descriptor.key;
      if (!canonicalOwner && !legacyOwner) continue;

      const target = resolveAuthoredPracticeHistoryTarget({
        item: row,
        candidates: descriptor.candidates,
      });
      if (!target) continue;

      hasHistory = true;
      const seenMs = (row.answeredAt ?? row.createdAt).getTime();
      if (Number.isFinite(seenMs)) lastOpenedMs = Math.max(lastOpenedMs, seenMs);
      if (row.answeredAt) {
        completed.add(authoredPracticeTargetIdentity(target));
      }
    }

    if (
      !hasHistory ||
      lastOpenedMs <= 0 ||
      completed.size >= descriptor.candidates.length
    ) {
      continue;
    }

    continuations.push({
      continuationKey: descriptor.key,
      selection: {
        catalogSlug: descriptor.catalog.slug,
        subjectSlug: descriptor.course.slug,
        moduleSlug: descriptor.module.slug,
        sectionSlug: "",
        topicSlug: "",
      },
      catalogTitle: descriptor.catalog.title,
      catalogTitleKey: descriptor.catalog.titleKey,
      courseTitle: descriptor.course.title,
      courseTitleKey: descriptor.course.titleKey,
      moduleTitle: descriptor.module.title,
      moduleTitleKey: descriptor.module.titleKey,
      completedCount: completed.size,
      totalCount: descriptor.candidates.length,
      lastOpenedAt: new Date(lastOpenedMs).toISOString(),
    });
  }

  continuations.sort(
    (left, right) =>
      new Date(right.lastOpenedAt).getTime() -
      new Date(left.lastOpenedAt).getTime(),
  );

  const limit = Math.max(1, Math.floor(args.limit ?? 5));
  return continuations.slice(0, limit);
}
