import type { Prisma } from "@/lib/prisma";
import type { TrialStartContext, TrialStartResult } from "../types";
import {
  difficultyFromLevel,
  getTrialSectionForSubject,
} from "@/lib/onboarding/trialPolicy";
import { buildTrialReturnUrl } from "@/lib/onboarding/client";
import { ownerWhereForActor } from "@/lib/practice/sessionStart";
import { actorKeyOf } from "@/lib/practice/actor";
import {
  buildSharedChallengeMeta,
} from "@/lib/practice/challenges/session";
import { resolveSharedChallengeTarget } from "@/lib/practice/challenges/target";
import {
  sharedChallengeFingerprint,
  verifySharedChallenge,
} from "@/lib/practice/challenges/token";
import {
  createTrialSession,
  findActiveTrialSession,
  findCompletedTrialSession,
  updateTrialSession,
} from "../repositories/trialSession.repo";

function buildTrialMeta(args: {
  subject: string;
  level?: string;
  locale: string;
}): Prisma.InputJsonValue {
  return {
    kind: "onboarding_trial",
    subjectSlug: args.subject,
    levelChosen: args.level || "beginner",
    locale: args.locale,
  };
}

function buildChallengeReturnUrl(args: {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
  authenticated: boolean;
}) {
  if (args.authenticated) {
    return `/${encodeURIComponent(args.locale)}/subjects/${encodeURIComponent(args.subjectSlug)}/modules/${encodeURIComponent(args.moduleSlug)}/practice`;
  }

  const callbackUrl = `/${encodeURIComponent(args.locale)}/subjects/${encodeURIComponent(args.subjectSlug)}/modules`;
  const query = new URLSearchParams({
    callbackUrl,
    from: "shared-challenge",
  });

  return `/${encodeURIComponent(args.locale)}/authenticate?${query.toString()}`;
}

export async function startOrResumePublicChallenge(
  ctx: TrialStartContext,
  token: string,
): Promise<TrialStartResult> {
  const { prisma, actor, body, requestId } = ctx;
  const ownerWhere = ownerWhereForActor(actor);

  if (!ownerWhere) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "Missing actor.", requestId },
    };
  }

  const claims = verifySharedChallenge(token);
  if (!claims) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "This challenge link is invalid or expired.", requestId },
    };
  }

  let target;
  try {
    target = resolveSharedChallengeTarget(claims);
  } catch (error) {
    return {
      ok: false,
      statusCode: 404,
      body: {
        message:
          error instanceof Error
            ? error.message
            : "The selected challenge exercise is no longer available.",
        requestId,
      },
    };
  }

  const subject = await prisma.practiceSubject.findUnique({
    where: { slug: target.subjectSlug },
    select: { id: true, status: true },
  });

  if (!subject || subject.status !== "active") {
    return {
      ok: false,
      statusCode: 404,
      body: {
        message: "The subject for this challenge is not publicly available.",
        requestId,
      },
    };
  }

  const section = await prisma.practiceSection.findFirst({
    where: {
      slug: target.sectionSlug,
      subjectId: subject.id,
    },
    select: {
      id: true,
      moduleId: true,
      module: { select: { slug: true } },
    },
  });

  if (!section || section.module?.slug !== target.moduleSlug) {
    return {
      ok: false,
      statusCode: 404,
      body: {
        message: "The published section for this challenge was not found.",
        requestId,
      },
    };
  }

  const challengeId = sharedChallengeFingerprint(token);
  const experienceKey = `public-challenge:${actorKeyOf(actor)}:${challengeId}`;
  const difficulty = "easy" as const;
  const returnUrl = buildChallengeReturnUrl({
    locale: body.locale,
    subjectSlug: target.subjectSlug,
    moduleSlug: target.moduleSlug,
    authenticated: Boolean(actor.userId),
  });
  const meta = buildSharedChallengeMeta({
    challengeId,
    subjectSlug: target.subjectSlug,
    moduleSlug: target.moduleSlug,
    sectionSlug: target.sectionSlug,
    topicSlug: target.topicSlug,
    exerciseKey: target.exerciseKey,
    exerciseTitle: target.exerciseTitle,
    exercisePurpose: target.exercisePurpose,
    locale: body.locale,
  });

  const active = await findActiveTrialSession({
    prisma,
    ownerWhere,
    sectionId: section.id,
    mode: "public_challenge",
    challengeId,
    experienceKey,
  });

  if (active) {
    await updateTrialSession({
      prisma,
      sessionId: active.id,
      experienceKey,
      mode: "public_challenge",
      difficulty,
      returnUrl,
      meta,
      targetCount: 1,
      preferPurpose: target.exercisePurpose,
    });

    return {
      ok: true,
      resumed: true,
      completed: false,
      sessionId: active.id,
      requestId,
      status: "active",
    };
  }

  const completed = await findCompletedTrialSession({
    prisma,
    ownerWhere,
    sectionId: section.id,
    mode: "public_challenge",
    challengeId,
    experienceKey,
  });

  if (completed) {
    await updateTrialSession({
      prisma,
      sessionId: completed.id,
      experienceKey,
      mode: "public_challenge",
      difficulty,
      returnUrl,
      meta,
      targetCount: 1,
      preferPurpose: target.exercisePurpose,
    });

    return {
      ok: true,
      resumed: true,
      completed: true,
      sessionId: completed.id,
      requestId,
      status: "completed",
    };
  }

  try {
    const created = await createTrialSession({
      prisma,
      mode: "public_challenge",
      experienceKey,
      userId: actor.userId ?? null,
      guestId: actor.guestId ?? null,
      sectionId: section.id,
      moduleId: section.moduleId ?? null,
      difficulty,
      returnUrl,
      meta,
      targetCount: 1,
      preferPurpose: target.exercisePurpose,
    });

    return {
      ok: true,
      resumed: false,
      completed: false,
      sessionId: created.id,
      requestId,
      status: "active",
    };
  } catch (error: any) {
    if (String(error?.code ?? "") === "P2002") {
      const raced = await prisma.practiceSession.findUnique({
        where: { experienceKey },
        select: { id: true, status: true },
      });
      if (raced) {
        return {
          ok: true,
          resumed: true,
          completed: raced.status === "completed",
          sessionId: raced.id,
          requestId,
          status: raced.status,
        };
      }
    }
    throw error;
  }
}

export async function startOrResumeOnboardingTrial(ctx: TrialStartContext): Promise<TrialStartResult> {
  const { prisma, actor, body, requestId } = ctx;
  const subject = body.subject;

  if (!subject) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "Missing subject.", requestId },
    };
  }

  const ownerWhere = ownerWhereForActor(actor);
  if (!ownerWhere) {
    return {
      ok: false,
      statusCode: 400,
      body: { message: "Missing actor.", requestId },
    };
  }

  const section = await getTrialSectionForSubject(subject);
  const difficulty = difficultyFromLevel(body.level);
  const returnUrl = buildTrialReturnUrl({
    locale: body.locale,
    subject,
  });

  const meta = buildTrialMeta({
    subject,
    level: body.level,
    locale: body.locale,
  });
  const experienceKey = `onboarding-trial:${actorKeyOf(actor)}:${subject}`;

  const active = await findActiveTrialSession({
    prisma,
    ownerWhere,
    sectionId: section.id,
    mode: "onboarding_trial",
    challengeId: null,
    experienceKey,
  });

  if (active) {
    await updateTrialSession({
      prisma,
      sessionId: active.id,
      experienceKey,
      mode: "onboarding_trial",
      difficulty,
      returnUrl,
      meta,
      targetCount: 3,
      preferPurpose: "quiz",
    });

    return {
      ok: true,
      resumed: true,
      completed: false,
      sessionId: active.id,
      requestId,
      status: "active",
    };
  }

  const completed = await findCompletedTrialSession({
    prisma,
    ownerWhere,
    sectionId: section.id,
    mode: "onboarding_trial",
    challengeId: null,
    experienceKey,
  });

  if (completed) {
    await updateTrialSession({
      prisma,
      sessionId: completed.id,
      experienceKey,
      mode: "onboarding_trial",
      difficulty,
      returnUrl,
      meta,
      targetCount: 3,
      preferPurpose: "quiz",
    });

    return {
      ok: true,
      resumed: true,
      completed: true,
      sessionId: completed.id,
      requestId,
      status: "completed",
    };
  }

  try {
    const created = await createTrialSession({
      prisma,
      mode: "onboarding_trial",
      experienceKey,
      userId: actor.userId ?? null,
      guestId: actor.guestId ?? null,
      sectionId: section.id,
      moduleId: section.moduleId ?? null,
      difficulty,
      returnUrl,
      meta,
      targetCount: 3,
      preferPurpose: "quiz",
    });

    return {
      ok: true,
      resumed: false,
      completed: false,
      sessionId: created.id,
      requestId,
      status: "active",
    };
  } catch (error: any) {
    if (String(error?.code ?? "") === "P2002") {
      const raced = await prisma.practiceSession.findUnique({
        where: { experienceKey },
        select: { id: true, status: true },
      });
      if (raced) {
        return {
          ok: true,
          resumed: true,
          completed: raced.status === "completed",
          sessionId: raced.id,
          requestId,
          status: raced.status,
        };
      }
    }
    throw error;
  }
}

export async function startOrResumeTrial(
  ctx: TrialStartContext,
): Promise<TrialStartResult> {
  if (ctx.body.challenge) {
    return startOrResumePublicChallenge(ctx, ctx.body.challenge);
  }

  return startOrResumeOnboardingTrial(ctx);
}
