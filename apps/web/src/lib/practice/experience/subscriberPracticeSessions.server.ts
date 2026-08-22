import "server-only";

import { PracticeSessionStatus } from "@zoeskoul/db";

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
  SubscriberPracticeSessionSummary,
} from "./practiceChooserTypes";
import {
  listSubscriberPracticePoolOptions,
  readSubscriberPracticeMeta,
  subscriberPracticeScopeFromMeta,
  type SubscriberPracticeHistoryItem,
} from "./subscriberPractice";

function resolveScopeTitles(
  catalogs: readonly PracticeChooserCatalog[],
  scope: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    topicSlug: string;
  },
) {
  for (const catalog of catalogs) {
    const course = catalog.courses.find(
      (item) => item.slug === scope.subjectSlug,
    );
    if (!course) continue;

    const selectedModule = course.modules.find(
      (item) => item.slug === scope.moduleSlug,
    );
    const section = selectedModule?.sections.find(
      (item) => item.slug === scope.sectionSlug,
    );
    const topic = section?.topics.find((item) => item.slug === scope.topicSlug);
    if (!selectedModule || !section || !topic) return null;

    return {
      catalog,
      course,
      module: selectedModule,
      section,
      topic,
    };
  }

  return null;
}

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

export async function loadActiveSubscriberPracticeSessions(args: {
  userId: string;
  catalogs: readonly PracticeChooserCatalog[];
  limit?: number;
}): Promise<SubscriberPracticeSessionSummary[]> {
  void args;
  // Normal self-paced Practice is canonical learner/module history, not a
  // resumable PracticeSession product. Legacy rows remain history-only.
  return [];
}
