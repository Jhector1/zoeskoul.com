import { NextResponse } from "next/server";
import {
  PracticeDifficulty,
  PracticePurpose,
  PracticeSessionStatus,
} from "@zoeskoul/db";

import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { safeSameOriginUrl } from "@/lib/practice/api/shared/http";
import { listPublishedPracticeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import {
  authoredPracticeHistoryExerciseKey,
  authoredPracticeTargetIdentity,
} from "@/lib/practice/experience/authoredPracticeQueue";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";
import { isLessonPracticeReturnUrl } from "@/lib/practice/experience/completion";
import {
  buildSubscriberModulePracticeContinuationPlan,
  buildSubscriberPracticeMeta,
  isCompletedSubscriberModulePracticeMeta,
  isModuleContinuationSubscriberPracticeMeta,
  isSameSubscriberPracticeScope,
  listSubscriberPracticePoolOptions,
  pickSubscriberPracticeQueue,
  shouldRetireStaleSubscriberModuleContinuationSession,
  subscriberPracticeScopeFromMeta,
  touchSubscriberPracticeMeta,
  type SubscriberPracticeHistoryItem,
  type SubscriberPracticeScope,
} from "@/lib/practice/experience/subscriberPractice";

export const runtime = "nodejs";

type StartSubscriberPracticeBody = {
  locale?: string;
  subjectSlug?: string;
  moduleSlug?: string;
  sectionSlug?: string;
  topicSlug?: string;
  difficulty?: string;
  targetCount?: number;
  returnTo?: string;
  returnUrl?: string;
};

function normalizeTargetCount(value: unknown) {
  const parsed = Number(value ?? 10);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(100, Math.floor(parsed)))
    : 10;
}

function optionalSlug(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as StartSubscriberPracticeBody;
  const locale = String(body.locale ?? "en").trim() || "en";
  const subjectSlug = String(body.subjectSlug ?? "").trim();
  const moduleSlug = String(body.moduleSlug ?? "").trim();
  const sectionSlug = optionalSlug(body.sectionSlug);
  const topicSlug = optionalSlug(body.topicSlug);
  const requestedReturnUrl = safeSameOriginUrl(
    req,
    body.returnTo ?? body.returnUrl ?? null,
  );
  const lessonReturnUrl = isLessonPracticeReturnUrl(requestedReturnUrl)
    ? requestedReturnUrl
    : null;
  const requestedDifficulty = String(
    body.difficulty ?? "easy",
  ) as PracticeDifficulty;
  const difficulty = Object.values(PracticeDifficulty).includes(
    requestedDifficulty,
  )
    ? requestedDifficulty
    : PracticeDifficulty.easy;
  const hasExplicitTargetCount =
    body.targetCount !== undefined && body.targetCount !== null;
  const targetCount = normalizeTargetCount(body.targetCount);
  const isModuleContinuation =
    !sectionSlug && !topicSlug && !hasExplicitTargetCount;

  if (!subjectSlug || !moduleSlug) {
    return NextResponse.json(
      {
        message: "subjectSlug and moduleSlug are required.",
        code: "PRACTICE_SCOPE_REQUIRED",
      },
      { status: 400 },
    );
  }

  const actor = await getActor();
  const access = await resolveSubscriberPracticeAccess(prisma, actor);
  if (!access.ok) {
    return NextResponse.json(
      {
        message: access.message,
        code: access.code,
        dailyFiveUrl: `/${encodeURIComponent(locale)}/practice/daily`,
        billingUrl: `/${encodeURIComponent(locale)}/billing`,
      },
      { status: access.status },
    );
  }

  const subject = await prisma.practiceSubject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true },
  });
  const moduleRecord = subject
    ? await prisma.practiceModule.findFirst({
        where: {
          slug: moduleSlug,
          subjectId: subject.id,
        },
        select: {
          id: true,
          slug: true,
        },
      })
    : null;

  if (!subject || !moduleRecord) {
    return NextResponse.json(
      {
        message:
          "The selected practice module is not available in the practice database.",
        code: "PRACTICE_MODULE_UNAVAILABLE",
      },
      { status: 404 },
    );
  }

  const requestedScope: SubscriberPracticeScope = {
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
  };
  const activeSessions = await prisma.practiceSession.findMany({
    where: {
      mode: "standard",
      status: PracticeSessionStatus.active,
      moduleId: moduleRecord.id,
      userId: actor.userId!,
    },
    select: {
      id: true,
      targetCount: true,
      total: true,
      meta: true,
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  const finishedIds = activeSessions
    .filter((session) => session.total >= session.targetCount)
    .map((session) => session.id);
  const legacyModuleContinuationIds = isModuleContinuation
    ? activeSessions
        .filter(
          (session) =>
            session.total < session.targetCount &&
            isSameSubscriberPracticeScope(
              subscriberPracticeScopeFromMeta(session.meta),
              requestedScope,
            ) &&
            !isModuleContinuationSubscriberPracticeMeta(session.meta),
        )
        .map((session) => session.id)
    : [];
  const retiredIds = Array.from(
    new Set([...finishedIds, ...legacyModuleContinuationIds]),
  );
  if (retiredIds.length) {
    await prisma.practiceSession.updateMany({
      where: { id: { in: retiredIds } },
      data: {
        status: PracticeSessionStatus.completed,
        completedAt: new Date(),
      },
    });
  }
  const retiredIdSet = new Set(retiredIds);

  const existing = activeSessions.find(
    (session) =>
      !retiredIdSet.has(session.id) &&
      session.total < session.targetCount &&
      isSameSubscriberPracticeScope(
        subscriberPracticeScopeFromMeta(session.meta),
        requestedScope,
      ) &&
      (!isModuleContinuation ||
        isModuleContinuationSubscriberPracticeMeta(session.meta)),
  );

  if (existing && !isModuleContinuation) {
    const touchedMeta = touchSubscriberPracticeMeta(existing.meta);
    await prisma.practiceSession.update({
      where: { id: existing.id },
      data: {
        returnUrl: lessonReturnUrl,
        ...(touchedMeta ? { meta: touchedMeta } : {}),
      },
    });

    return NextResponse.json({
      sessionId: existing.id,
      subjectSlug,
      moduleSlug,
      experienceMode: "standard" as const,
      targetCount: existing.targetCount,
      resumed: true,
      returnUrl: lessonReturnUrl,
    });
  }

  // Canonical Practice history is shared across entry paths and requested
  // section/topic focus. Scope narrows the candidate pool; it must not create
  // another progress namespace. Historical standard Practice instances created
  // before PracticePurpose.practice was persisted correctly can still be
  // recognized safely by exact membership in the current authored Practice pool.
  const publishedOptions = await listPublishedPracticeExerciseOptions();
  const modulePracticePool = listSubscriberPracticePoolOptions({
    options: publishedOptions,
    subjectSlug,
    moduleSlug,
  });
  const modulePracticeIdentities = new Set(
    modulePracticePool.map((option) =>
      authoredPracticeTargetIdentity({
        topicSlug: option.topicSlug,
        exerciseKey: option.exerciseKey,
      }),
    ),
  );
  const historyRows = await prisma.practiceQuestionInstance.findMany({
    where: {
      exerciseKey: { not: null },
      session: {
        userId: actor.userId!,
        moduleId: moduleRecord.id,
      },
    },
    select: {
      sessionId: true,
      exerciseKey: true,
      publicPayload: true,
      answeredAt: true,
      createdAt: true,
      topic: {
        select: {
          slug: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const history: SubscriberPracticeHistoryItem[] = historyRows
    .filter((row) => Boolean(row.exerciseKey && row.topic?.slug))
    .filter((row) =>
      modulePracticeIdentities.has(
        authoredPracticeTargetIdentity({
          topicSlug: row.topic.slug,
          exerciseKey: authoredPracticeHistoryExerciseKey(row),
        }),
      ),
    )
    .map((row) => ({
      exerciseKey: authoredPracticeHistoryExerciseKey(row),
      topicSlug: row.topic.slug,
      seenAt: row.answeredAt ?? row.createdAt,
      completedAt: row.answeredAt,
      sessionId: row.sessionId,
    }));

  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${actor.userId}|${moduleSlug}|${dayKey}`;
  const moduleContinuationPlan = isModuleContinuation
    ? buildSubscriberModulePracticeContinuationPlan({
        options: publishedOptions,
        subjectSlug,
        moduleSlug,
        history,
        seed,
      })
    : null;

  if (existing) {
    const retireStaleModuleContinuation =
      shouldRetireStaleSubscriberModuleContinuationSession({
        sessionId: existing.id,
        total: existing.total,
        meta: existing.meta,
        history,
      });

    if (!retireStaleModuleContinuation) {
      const touchedMeta = touchSubscriberPracticeMeta(existing.meta);
      await prisma.practiceSession.update({
        where: { id: existing.id },
        data: {
          returnUrl: lessonReturnUrl,
          ...(touchedMeta ? { meta: touchedMeta } : {}),
        },
      });

      return NextResponse.json({
        sessionId: existing.id,
        subjectSlug,
        moduleSlug,
        experienceMode: "standard" as const,
        targetCount: existing.targetCount,
        resumed: true,
        returnUrl: lessonReturnUrl,
      });
    }

    const completedModulePlan =
      moduleContinuationPlan &&
      moduleContinuationPlan.moduleTotal > 0 &&
      moduleContinuationPlan.queue.length === 0 &&
      moduleContinuationPlan.completedPrefix.length ===
        moduleContinuationPlan.moduleTotal;

    if (completedModulePlan) {
      const completedMeta = buildSubscriberPracticeMeta({
        queue: [],
        scope: requestedScope,
        completedPrefix: moduleContinuationPlan.completedPrefix,
        moduleTotal: moduleContinuationPlan.moduleTotal,
      });

      await prisma.practiceSession.update({
        where: { id: existing.id },
        data: {
          status: PracticeSessionStatus.completed,
          completedAt: new Date(),
          targetCount: 0,
          total: 0,
          correct: 0,
          lastInstanceId: null,
          returnUrl: lessonReturnUrl,
          meta: completedMeta,
        },
      });

      return NextResponse.json({
        sessionId: existing.id,
        subjectSlug,
        moduleSlug,
        experienceMode: "standard" as const,
        targetCount: 0,
        resumed: true,
        complete: true,
        returnUrl: lessonReturnUrl,
      });
    }

    await prisma.practiceSession.update({
      where: { id: existing.id },
      data: {
        status: PracticeSessionStatus.completed,
        completedAt: new Date(),
      },
    });
  }

  let completedPrefix = moduleContinuationPlan?.completedPrefix ?? [];
  let moduleTotal = moduleContinuationPlan?.moduleTotal ?? null;
  let queue =
    moduleContinuationPlan?.queue ??
    pickSubscriberPracticeQueue({
      options: publishedOptions,
      subjectSlug,
      moduleSlug,
      sectionSlug,
      topicSlug,
      targetCount,
      history,
      seed,
    });

  const completedModuleView =
    isModuleContinuation &&
    moduleTotal !== null &&
    moduleTotal > 0 &&
    queue.length === 0 &&
    completedPrefix.length === moduleTotal;

  if (completedModuleView) {
    const reusableCompletedView = await prisma.practiceSession.findFirst({
      where: {
        userId: actor.userId!,
        moduleId: moduleRecord.id,
        mode: "standard",
        status: PracticeSessionStatus.completed,
        preferPurpose: PracticePurpose.practice,
        targetCount: 0,
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        targetCount: true,
        meta: true,
      },
    });

    if (
      reusableCompletedView &&
      isCompletedSubscriberModulePracticeMeta({
        meta: reusableCompletedView.meta,
        moduleTotal,
        completedPrefix,
      })
    ) {
      const touchedMeta = touchSubscriberPracticeMeta(
        reusableCompletedView.meta,
      );
      await prisma.practiceSession.update({
        where: { id: reusableCompletedView.id },
        data: {
          returnUrl: lessonReturnUrl,
          ...(touchedMeta ? { meta: touchedMeta } : {}),
        },
      });

      return NextResponse.json({
        sessionId: reusableCompletedView.id,
        subjectSlug,
        moduleSlug,
        experienceMode: "standard" as const,
        targetCount: 0,
        resumed: true,
        complete: true,
        returnUrl: lessonReturnUrl,
      });
    }
  }

  if (queue.length === 0 && !completedModuleView) {
    return NextResponse.json(
      {
        message:
          "This module does not currently have eligible authored practice exercises.",
        code: "PRACTICE_POOL_EMPTY",
      },
      { status: 409 },
    );
  }

  const first = queue[0] ?? completedPrefix[0];
  const anchorSection = await prisma.practiceSection.findFirst({
    where: {
      slug: first.sectionSlug,
      subjectId: subject.id,
      moduleId: moduleRecord.id,
    },
    select: { id: true },
  });

  if (!anchorSection) {
    return NextResponse.json(
      {
        message:
          "The selected practice exercise is not attached to an available module section.",
        code: "PRACTICE_SECTION_UNAVAILABLE",
      },
      { status: 409 },
    );
  }

  const session = await prisma.practiceSession.create({
    data: {
      mode: "standard",
      status: completedModuleView
        ? PracticeSessionStatus.completed
        : PracticeSessionStatus.active,
      completedAt: completedModuleView ? new Date() : null,
      sectionId: anchorSection.id,
      moduleId: moduleRecord.id,
      difficulty,
      targetCount: queue.length,
      preferPurpose: PracticePurpose.practice,
      userId: actor.userId!,
      guestId: null,
      returnUrl: lessonReturnUrl,
      meta: buildSubscriberPracticeMeta({
        queue,
        scope: requestedScope,
        completedPrefix,
        moduleTotal,
      }),
      helpPolicy: {
        stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
      },
    },
    select: {
      id: true,
      targetCount: true,
    },
  });

  return NextResponse.json({
    sessionId: session.id,
    subjectSlug,
    moduleSlug,
    experienceMode: "standard" as const,
    targetCount: session.targetCount,
    resumed: false,
    complete: completedModuleView,
    returnUrl: lessonReturnUrl,
  });
}
