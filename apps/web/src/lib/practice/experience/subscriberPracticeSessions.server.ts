import "server-only";

import { PracticeSessionStatus } from "@zoeskoul/db";

import { prisma } from "@/lib/prisma";
import type {
  PracticeChooserCatalog,
  SubscriberPracticeSessionSummary,
} from "./practiceChooserTypes";
import {
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

    const module = course.modules.find((item) => item.slug === scope.moduleSlug);
    const section = module?.sections.find(
      (item) => item.slug === scope.sectionSlug,
    );
    const topic = section?.topics.find((item) => item.slug === scope.topicSlug);
    if (!module || !section || !topic) return null;

    return {
      catalog,
      course,
      module,
      section,
      topic,
    };
  }

  return null;
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
    if (!meta || !scope) continue;

    const titles = resolveScopeTitles(args.catalogs, scope);
    if (!titles) continue;

    summaries.push({
      sessionId: session.id,
      selection: {
        catalogSlug: titles.catalog.slug,
        subjectSlug: scope.subjectSlug,
        moduleSlug: scope.moduleSlug,
        sectionSlug: scope.sectionSlug,
        topicSlug: scope.topicSlug,
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
