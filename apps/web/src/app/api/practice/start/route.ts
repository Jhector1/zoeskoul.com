import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { safeSameOriginUrl } from "@/lib/practice/api/shared/http";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";
import { loadSelfPacedPracticeState } from "@/lib/practice/experience/selfPacedPracticeState.server";

export const runtime = "nodejs";

type StartSelfPacedPracticeBody = {
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

function optionalSlug(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function positiveTargetCount(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(100, Math.floor(parsed)))
    : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as StartSelfPacedPracticeBody;
  const locale = String(body.locale ?? "en").trim() || "en";
  const subjectSlug = String(body.subjectSlug ?? "").trim();
  const moduleSlug = String(body.moduleSlug ?? "").trim();
  const sectionSlug = optionalSlug(body.sectionSlug);
  const topicSlug = optionalSlug(body.topicSlug);
  const targetCount = positiveTargetCount(body.targetCount);
  const returnUrl = safeSameOriginUrl(
    req,
    body.returnTo ?? body.returnUrl ?? null,
  );

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
  if (!access.ok || !actor.userId) {
    return NextResponse.json(
      {
        message: access.ok
          ? "An authenticated learner is required for Practice."
          : access.message,
        code: access.ok ? "PRACTICE_LEARNER_REQUIRED" : access.code,
        dailyFiveUrl: `/${encodeURIComponent(locale)}/practice/daily`,
        billingUrl: `/${encodeURIComponent(locale)}/billing`,
      },
      { status: access.ok ? 401 : access.status },
    );
  }

  const subject = await prisma.practiceSubject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true },
  });
  const moduleRecord = subject
    ? await prisma.practiceModule.findFirst({
        where: { slug: moduleSlug, subjectId: subject.id },
        select: { id: true },
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

  const practiceRunId = crypto.randomUUID();
  const practiceRunStartedAt = new Date().toISOString();
  const state = await loadSelfPacedPracticeState({
    userId: actor.userId,
    subjectSlug,
    moduleSlug,
    moduleId: moduleRecord.id,
    sectionSlug,
    topicSlug,
    targetCount,
    practiceRunId,
    practiceRunStartedAt,
  });

  if (state.scopePoolTotal === 0) {
    return NextResponse.json(
      {
        message:
          "This scope does not currently have eligible authored practice exercises.",
        code: "PRACTICE_POOL_EMPTY",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    practiceRunId,
    practiceRunStartedAt,
    subjectSlug,
    moduleSlug,
    experienceMode: "practice" as const,
    targetCount: state.targetCount,
    complete: state.complete,
    resumed: false,
    returnUrl,
  });
}
