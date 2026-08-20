import "server-only";

import { PracticeSessionStatus } from "@zoeskoul/db";

import { prisma } from "@/lib/prisma";
import { listPublishedPracticeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import {
  authoredPracticeHistoryExerciseKey,
  authoredPracticeTargetIdentity,
} from "./authoredPracticeQueue";
import type {
  PracticeChooserCatalog,
  SubscriberPracticeSessionSummary,
} from "./practiceChooserTypes";
import {
  listSubscriberPracticePoolOptions,
  readSubscriberPracticeMeta,
  subscriberPracticeScopeFromMeta,
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
  const poolIdentities = new Set(
    pool.map((option) =>
      authoredPracticeTargetIdentity({
        topicSlug: option.topicSlug,
        exerciseKey: option.exerciseKey,
      }),
    ),
  );
  if (!total || !args.userId) {
    return { completed: 0, total, pct: 0 };
  }

  const moduleRecord = await prisma.practiceModule.findFirst({
    where: {
      slug: args.moduleSlug,
      subject: {
        slug: args.subjectSlug,
      },
    },
    select: { id: true },
  });
  if (!moduleRecord) {
    return { completed: 0, total, pct: 0 };
  }

  const rows = await prisma.practiceQuestionInstance.findMany({
    where: {
      exerciseKey: { not: null },
      answeredAt: { not: null },
      session: {
        userId: args.userId,
        moduleId: moduleRecord.id,
      },
    },
    select: {
      exerciseKey: true,
      publicPayload: true,
      topic: {
        select: { slug: true },
      },
    },
  });
  const completedIdentities = new Set(
    rows
      .filter((row) => Boolean(row.exerciseKey && row.topic?.slug))
      .map((row) =>
        authoredPracticeTargetIdentity({
          topicSlug: row.topic.slug,
          exerciseKey: authoredPracticeHistoryExerciseKey(row),
        }),
      )
      .filter((identity) => poolIdentities.has(identity)),
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
  const sessions = await prisma.practiceSession.findMany({
    where: {
      userId: args.userId,
      mode: "standard",
      status: PracticeSessionStatus.active,
    },
    select: {
      id: true,
      targetCount: true,
      total: true,
      startedAt: true,
      meta: true,
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  const summaries: SubscriberPracticeSessionSummary[] = [];

  for (const session of sessions) {
    if (session.total >= session.targetCount) continue;

    const meta = readSubscriberPracticeMeta(session.meta);
    const scope = subscriberPracticeScopeFromMeta(session.meta);
    const representativeTarget = meta?.queue[0] ?? null;
    if (!meta || !scope || !representativeTarget) continue;

    const displayScope = {
      subjectSlug: scope.subjectSlug,
      moduleSlug: scope.moduleSlug,
      sectionSlug: scope.sectionSlug ?? representativeTarget.sectionSlug,
      topicSlug: scope.topicSlug ?? representativeTarget.topicSlug,
    };
    const titles = resolveScopeTitles(args.catalogs, displayScope);
    if (!titles) continue;

    summaries.push({
      sessionId: session.id,
      selection: {
        catalogSlug: titles.catalog.slug,
        subjectSlug: scope.subjectSlug,
        moduleSlug: scope.moduleSlug,
        sectionSlug: displayScope.sectionSlug,
        topicSlug: displayScope.topicSlug,
      },
      catalogTitle: titles.catalog.title,
      catalogTitleKey: titles.catalog.titleKey,
      courseTitle: titles.course.title,
      courseTitleKey: titles.course.titleKey,
      moduleTitle: titles.module.title,
      moduleTitleKey: titles.module.titleKey,
      sectionTitle: titles.section.title,
      sectionTitleKey: titles.section.titleKey,
      topicTitle: titles.topic.title,
      topicTitleKey: titles.topic.titleKey,
      completedCount: Math.min(session.total, session.targetCount),
      totalCount: session.targetCount,
      lastOpenedAt: meta.lastOpenedAt ?? session.startedAt.toISOString(),
    });
  }

  summaries.sort(
    (left, right) =>
      Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt),
  );

  return summaries.slice(0, Math.max(1, args.limit ?? 5));
}
