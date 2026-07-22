import { NextResponse } from "next/server";
import { PracticeDifficulty, PracticeSessionStatus } from "@zoeskoul/db";

import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { listPublishedPracticeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";
import {
  buildSubscriberPracticeMeta,
  isSameSubscriberPracticeScope,
  pickSubscriberPracticeQueue,
  subscriberPracticeScopeFromMeta,
  touchSubscriberPracticeMeta,
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
};

function normalizeTargetCount(value: unknown) {
  const parsed = Number(value ?? 10);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(100, Math.floor(parsed)))
    : 10;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as StartSubscriberPracticeBody;
  const locale = String(body.locale ?? "en").trim() || "en";
  const subjectSlug = String(body.subjectSlug ?? "").trim();
  const moduleSlug = String(body.moduleSlug ?? "").trim();
  const sectionSlug = String(body.sectionSlug ?? "").trim();
  const topicSlug = String(body.topicSlug ?? "").trim();
  const requestedDifficulty = String(
    body.difficulty ?? "easy",
  ) as PracticeDifficulty;
  const difficulty = Object.values(PracticeDifficulty).includes(
    requestedDifficulty,
  )
    ? requestedDifficulty
    : PracticeDifficulty.easy;
  const targetCount = normalizeTargetCount(body.targetCount);

  if (!subjectSlug || !moduleSlug || !sectionSlug || !topicSlug) {
    return NextResponse.json(
      {
        message:
          "subjectSlug, moduleSlug, sectionSlug, and topicSlug are required.",
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
  const section = subject
    ? await prisma.practiceSection.findFirst({
        where: {
          slug: sectionSlug,
          subjectId: subject.id,
          module: { slug: moduleSlug },
        },
        select: {
          id: true,
          moduleId: true,
          module: { select: { slug: true } },
        },
      })
    : null;

  if (!section || section.module?.slug !== moduleSlug) {
    return NextResponse.json(
      {
        message:
          "The selected practice section is not available in the practice database.",
        code: "PRACTICE_SECTION_UNAVAILABLE",
      },
      { status: 404 },
    );
  }

  const requestedScope = {
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
  };
  const activeSessions = await prisma.practiceSession.findMany({
    where: {
      mode: "standard",
      status: PracticeSessionStatus.active,
      sectionId: section.id,
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
  if (finishedIds.length) {
    await prisma.practiceSession.updateMany({
      where: { id: { in: finishedIds } },
      data: {
        status: PracticeSessionStatus.completed,
        completedAt: new Date(),
      },
    });
  }

  const existing = activeSessions.find(
    (session) =>
      session.total < session.targetCount &&
      isSameSubscriberPracticeScope(
        subscriberPracticeScopeFromMeta(session.meta),
        requestedScope,
      ),
  );

  if (existing) {
    const touchedMeta = touchSubscriberPracticeMeta(existing.meta);
    if (touchedMeta) {
      await prisma.practiceSession.update({
        where: { id: existing.id },
        data: { meta: touchedMeta },
      });
    }

    return NextResponse.json({
      sessionId: existing.id,
      subjectSlug,
      moduleSlug,
      experienceMode: "standard" as const,
      targetCount: existing.targetCount,
      resumed: true,
    });
  }

  const publishedOptions = await listPublishedPracticeExerciseOptions();
  const queue = pickSubscriberPracticeQueue({
    options: publishedOptions,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
    targetCount,
  });

  if (queue.length === 0) {
    return NextResponse.json(
      {
        message:
          "The selected topic does not currently have eligible practice exercises.",
        code: "PRACTICE_POOL_EMPTY",
      },
      { status: 409 },
    );
  }

  const first = queue[0];
  const session = await prisma.practiceSession.create({
    data: {
      mode: "standard",
      status: "active",
      sectionId: section.id,
      moduleId: section.moduleId,
      difficulty,
      targetCount: queue.length,
      preferPurpose: first.exercisePurpose,
      userId: actor.userId!,
      guestId: null,
      returnUrl: `/${encodeURIComponent(locale)}/practice/daily`,
      meta: buildSubscriberPracticeMeta({ queue }),
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
  });
}
