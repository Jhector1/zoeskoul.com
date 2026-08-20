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
import { loadSubscriberModulePracticeHistory } from "@/lib/practice/experience/subscriberPracticeSessions.server";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";
import {
  buildSubscriberPracticeMeta,
  buildSubscriberPracticePlan,
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
  // Entry origin is navigation metadata only. Any same-origin return target
  // is safe to preserve; it never participates in progress or queue identity.
  const returnUrl = safeSameOriginUrl(
    req,
    body.returnTo ?? body.returnUrl ?? null,
  );
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

  // Starting Practice always builds one fresh run envelope from canonical
  // learner history. We do not search for/reclassify an arbitrary active
  // session by entry origin or scope. Once created, sessionId is written into
  // the URL and owns exact reload continuity.
  const publishedOptions = await listPublishedPracticeExerciseOptions();
  const history = await loadSubscriberModulePracticeHistory({
    userId: actor.userId!,
    subjectSlug,
    moduleSlug,
    moduleId: moduleRecord.id,
    publishedOptions,
  });

  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${actor.userId}|${moduleSlug}|${dayKey}`;
  const plan = buildSubscriberPracticePlan({
    options: publishedOptions,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
    targetCount: hasExplicitTargetCount ? targetCount : null,
    history,
    seed,
  });
  const completedPrefix = plan.completedPrefix;
  const moduleTotal = plan.moduleTotal;
  const queue = plan.queue;

  if (moduleTotal === 0) {
    return NextResponse.json(
      {
        message:
          "This scope does not currently have eligible authored practice exercises.",
        code: "PRACTICE_POOL_EMPTY",
      },
      { status: 409 },
    );
  }

  const completedScopeView =
    queue.length === 0 &&
    completedPrefix.length === moduleTotal;

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
      status: completedScopeView
        ? PracticeSessionStatus.completed
        : PracticeSessionStatus.active,
      completedAt: completedScopeView ? new Date() : null,
      sectionId: anchorSection.id,
      moduleId: moduleRecord.id,
      difficulty,
      targetCount: queue.length,
      preferPurpose: PracticePurpose.practice,
      userId: actor.userId!,
      guestId: null,
      returnUrl: returnUrl,
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
    complete: completedScopeView,
    returnUrl: returnUrl,
  });
}
