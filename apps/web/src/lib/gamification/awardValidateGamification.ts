import type { XpSourceType } from "@zoeskoul/db";
import type { Prisma, PrismaClient } from "@/lib/prisma";

import type { Actor } from "@/lib/practice/actor";
import { actorKeyOf } from "@/lib/practice/actor";
import { getPracticeExperiencePolicy } from "@/lib/practice/experience/policy";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";

import {
  startOfUtcDay,
  toUtcDayKey,
  isSameUtcDay,
  isYesterdayUtc,
} from "./dates";
import { getLevelForXp } from "./levels";
import {
  getAttemptXpRule,
  getDailyStreakBonusRule,
  getSessionCompleteXpRule,
} from "./rules";
import { buildGamificationSummary } from "./summary";
import type {
  GamificationAwardEvent,
  GamificationAwardSourceType,
  ValidateGamificationResult,
} from "./types";

type AwardValidateGamificationArgs = {
  prisma: PrismaClient;
  actor: Actor;
  instance: any;
  session: any;
  isReveal: boolean;
  gradedOk: boolean;
  priorNonRevealAttempts: number;
  persisted: {
    sessionComplete?: boolean | null;
    sessionSummary?: unknown;
  };
};

type TxClient = Prisma.TransactionClient;

type XpWrite = {
  actorKey: string;
  userId: string | null;
  sourceType: XpSourceType;
  sourceId?: string | null;
  subjectId?: string | null;
  moduleId?: string | null;
  topicId?: string | null;
  instanceId?: string | null;
  sessionId?: string | null;
  xpDelta: number;
  rankedXpDelta: number;
  reason: string;
  idempotencyKey: string;
};

async function createXpEventIfMissing(
  tx: TxClient,
  args: XpWrite,
): Promise<{ xp: number; rankedXp: number }> {
  // createMany + skipDuplicates turns the unique idempotency key into an
  // atomic award gate. A double submit or concurrent retry cannot award twice.
  const inserted = await tx.xpEvent.createMany({
    data: [
      {
        actorKey: args.actorKey,
        userId: args.userId,
        sourceType: args.sourceType,
        sourceId: args.sourceId ?? null,
        subjectId: args.subjectId ?? null,
        moduleId: args.moduleId ?? null,
        topicId: args.topicId ?? null,
        instanceId: args.instanceId ?? null,
        sessionId: args.sessionId ?? null,
        xpDelta: args.xpDelta,
        rankedXpDelta: args.rankedXpDelta,
        reason: args.reason,
        idempotencyKey: args.idempotencyKey,
      },
    ],
    skipDuplicates: true,
  });

  return inserted.count === 1
    ? { xp: args.xpDelta, rankedXp: args.rankedXpDelta }
    : { xp: 0, rankedXp: 0 };
}

function emptyResult(progress?: {
  totalXp?: number | null;
  rankedXp?: number | null;
  currentStreak?: number | null;
  longestStreak?: number | null;
} | null): ValidateGamificationResult {
  return {
    xpGained: 0,
    rankedXpGained: 0,
    leveledUp: false,
    streakExtended: false,
    awarded: [],
    summary: buildGamificationSummary(progress ?? undefined),
  };
}

function completionRule(mode: ReturnType<typeof resolvePracticeExperienceMode>) {
  switch (mode) {
    case "daily_five":
      return getSessionCompleteXpRule({
        sourceType: "daily_five_complete",
        xpDelta: 20,
        reason: "Daily practice complete",
      });
    case "assignment":
      return getSessionCompleteXpRule({
        sourceType: "assignment_complete",
        xpDelta: 20,
        reason: "Assignment complete",
      });
    case "public_challenge":
      return getSessionCompleteXpRule({
        sourceType: "public_challenge_complete",
        xpDelta: 5,
        reason: "Public challenge complete",
      });
    case "standard":
    case "practice":
      return getSessionCompleteXpRule();
    case "onboarding_trial":
    default:
      return null;
  }
}

export async function awardValidateGamification(
  args: AwardValidateGamificationArgs,
): Promise<ValidateGamificationResult> {
  const {
    prisma,
    actor,
    instance,
    session,
    isReveal,
    gradedOk,
    priorNonRevealAttempts,
    persisted,
  } = args;

  const actorKey = actorKeyOf(actor);
  const userId = actor.userId ?? null;
  const mode = resolvePracticeExperienceMode(session);
  const policy = getPracticeExperiencePolicy({
    mode,
    viewerTier: userId ? "free" : "guest",
    difficulty: session?.difficulty ?? instance?.difficulty ?? "easy",
    targetCount: session?.targetCount ?? null,
    assignmentAllowReveal: session?.assignment?.allowReveal ?? false,
    assignmentQuestionMaxAttempts: session?.assignment?.maxQuestionAttempts ?? null,
  });

  // Onboarding is acquisition analytics, not learner progression. Anonymous
  // public challenges also do not create a shadow guest XP profile.
  if (!policy.rewards.learningXp && !policy.rewards.rankedXp) {
    const progress = await prisma.learnerProgress.findUnique({
      where: { actorKey },
      select: {
        totalXp: true,
        rankedXp: true,
        currentStreak: true,
        longestStreak: true,
      },
    });
    return emptyResult(progress);
  }

  const now = new Date();
  const today = startOfUtcDay(now);
  const todayKey = toUtcDayKey(now);

  const topicId = String(instance?.topicId ?? instance?.topic?.id ?? "") || null;
  const moduleId =
    (instance?.topic?.moduleId as string | null | undefined) ??
    (instance?.topic?.module?.id as string | null | undefined) ??
    (session?.moduleId as string | null | undefined) ??
    null;
  const subjectId =
    (instance?.topic?.subjectId as string | null | undefined) ??
    (instance?.topic?.subject?.id as string | null | undefined) ??
    null;
  const instanceId = String(instance?.id ?? "");
  const exerciseKey = String(instance?.exerciseKey ?? instanceId);
  const sessionId = (session?.id as string | null | undefined) ?? null;

  const helpRows =
    gradedOk && !isReveal
      ? await prisma.practiceHelpEvent.findMany({
          where: { instanceId },
          select: { stepKey: true },
        })
      : [];
  const helpStepKeys = [...new Set(helpRows.map((row) => row.stepKey))];

  return prisma.$transaction(async (tx) => {
    // Serialize reward projection writes per actor. XpEvent idempotency prevents
    // duplicate events; this transaction-scoped PostgreSQL advisory lock also
    // prevents a concurrent zero-award retry from overwriting a freshly updated
    // LearnerProgress projection with a stale total.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actorKey}))`;

    const [existingProgress, existingDaily] = await Promise.all([
      tx.learnerProgress.findUnique({ where: { actorKey } }),
      tx.dailyLearningStat.findUnique({
        where: { actorKey_day: { actorKey, day: today } },
      }),
    ]);

    const awarded: GamificationAwardEvent[] = [];
    let xpGained = 0;
    let rankedXpGained = 0;

    const hadMeaningfulActivityToday =
      (existingDaily?.correctCount ?? 0) > 0 ||
      (existingDaily?.sessionCount ?? 0) > 0;

    await tx.dailyLearningStat.upsert({
      where: { actorKey_day: { actorKey, day: today } },
      create: {
        actorKey,
        userId,
        day: today,
        xpEarned: 0,
        rankedXpEarned: 0,
        answeredCount: isReveal ? 0 : 1,
        correctCount: gradedOk && !isReveal ? 1 : 0,
        sessionCount: persisted.sessionComplete ? 1 : 0,
        minutesStudied: 0,
      },
      update: {
        userId,
        answeredCount: { increment: isReveal ? 0 : 1 },
        correctCount: { increment: gradedOk && !isReveal ? 1 : 0 },
        sessionCount: { increment: persisted.sessionComplete ? 1 : 0 },
      },
    });

    const addAward = async (write: Omit<XpWrite, "actorKey" | "userId">) => {
      const added = await createXpEventIfMissing(tx, {
        actorKey,
        userId,
        ...write,
      });
      if (added.xp <= 0 && added.rankedXp <= 0) return;
      xpGained += added.xp;
      rankedXpGained += added.rankedXp;
      awarded.push({
        sourceType: write.sourceType as GamificationAwardSourceType,
        xpDelta: added.xp,
        rankedXpDelta: added.rankedXp,
        reason: write.reason,
      });
    };

    const attemptRule = getAttemptXpRule({
      ok: gradedOk,
      isReveal,
      priorNonRevealAttempts,
      difficulty: instance?.difficulty ?? session?.difficulty ?? "easy",
      helpStepKeys,
    });

    if (attemptRule && policy.rewards.learningXp) {
      const attemptNo = priorNonRevealAttempts + 1;
      const publicChallengeKey =
        mode === "public_challenge"
          ? `xp:public-challenge:${actorKey}:${todayKey}:${exerciseKey}`
          : null;

      await addAward({
        sourceType: attemptRule.sourceType,
        sourceId: exerciseKey,
        subjectId,
        moduleId,
        topicId,
        instanceId,
        sessionId,
        xpDelta: attemptRule.xpDelta,
        rankedXpDelta: policy.rewards.rankedXp ? attemptRule.xpDelta : 0,
        reason: attemptRule.reason,
        idempotencyKey:
          publicChallengeKey ??
          [
            "xp",
            "attempt",
            actorKey,
            instanceId,
            String(attemptNo),
            attemptRule.sourceType,
          ].join(":"),
      });
    }

    const sessionRule = persisted.sessionComplete ? completionRule(mode) : null;
    if (sessionRule && sessionId && policy.rewards.learningXp) {
      const idempotencyKey =
        mode === "public_challenge"
          ? `xp:public-challenge-complete:${actorKey}:${todayKey}:${exerciseKey}`
          : `xp:session:${actorKey}:${sessionId}:complete`;

      await addAward({
        sourceType: sessionRule.sourceType,
        sourceId: sessionId,
        subjectId,
        moduleId,
        topicId,
        instanceId,
        sessionId,
        xpDelta: sessionRule.xpDelta,
        rankedXpDelta: policy.rewards.rankedXp ? sessionRule.xpDelta : 0,
        reason: sessionRule.reason,
        idempotencyKey,
      });
    }

    const shouldCountForStreak =
      userId != null && ((!isReveal && gradedOk) || Boolean(persisted.sessionComplete));

    let nextCurrentStreak = existingProgress?.currentStreak ?? 0;
    let nextLongestStreak = existingProgress?.longestStreak ?? 0;
    let nextLastActiveOn = existingProgress?.lastActiveOn ?? null;
    let streakExtended = false;

    if (shouldCountForStreak && !hadMeaningfulActivityToday) {
      if (isSameUtcDay(existingProgress?.lastActiveOn, today)) {
        nextCurrentStreak = existingProgress?.currentStreak ?? 0;
      } else if (isYesterdayUtc(existingProgress?.lastActiveOn, today)) {
        nextCurrentStreak = (existingProgress?.currentStreak ?? 0) + 1;
      } else {
        nextCurrentStreak = 1;
      }

      nextLongestStreak = Math.max(
        existingProgress?.longestStreak ?? 0,
        nextCurrentStreak,
      );
      nextLastActiveOn = today;
      streakExtended = true;

      const streakRule = getDailyStreakBonusRule(nextCurrentStreak);
      await addAward({
        sourceType: streakRule.sourceType,
        sourceId: todayKey,
        subjectId,
        moduleId,
        topicId,
        instanceId,
        sessionId,
        xpDelta: streakRule.xpDelta,
        rankedXpDelta: 0,
        reason: streakRule.reason,
        idempotencyKey: `xp:streak:${actorKey}:${todayKey}`,
      });
    }

    const previousTotalXp = existingProgress?.totalXp ?? 0;
    const previousRankedXp = existingProgress?.rankedXp ?? 0;
    const nextTotalXp = previousTotalXp + xpGained;
    const nextRankedXp = previousRankedXp + rankedXpGained;
    const previousLevel = getLevelForXp(previousTotalXp);
    const nextLevel = getLevelForXp(nextTotalXp);

    await tx.learnerProgress.upsert({
      where: { actorKey },
      create: {
        actorKey,
        userId,
        totalXp: nextTotalXp,
        rankedXp: nextRankedXp,
        level: nextLevel,
        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,
        lastActiveOn: nextLastActiveOn,
        streakFreezes: 0,
      },
      update: {
        userId,
        totalXp: nextTotalXp,
        rankedXp: nextRankedXp,
        level: nextLevel,
        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,
        lastActiveOn: nextLastActiveOn,
      },
    });

    if (xpGained > 0 || rankedXpGained > 0) {
      await tx.dailyLearningStat.update({
        where: { actorKey_day: { actorKey, day: today } },
        data: {
          xpEarned: { increment: xpGained },
          rankedXpEarned: { increment: rankedXpGained },
        },
      });
    }

    return {
      xpGained,
      rankedXpGained,
      leveledUp: nextLevel > previousLevel,
      streakExtended,
      awarded,
      summary: buildGamificationSummary({
        totalXp: nextTotalXp,
        rankedXp: nextRankedXp,
        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,
      }),
    } satisfies ValidateGamificationResult;
  });
}
