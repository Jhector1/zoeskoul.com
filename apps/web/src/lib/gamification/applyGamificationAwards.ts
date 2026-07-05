import type {
    XpSourceType,
} from "@zoeskoul/db";
import type { Prisma, PrismaClient } from "@/lib/prisma";

import type { Actor } from "@/lib/practice/actor";
import { actorKeyOf } from "@/lib/practice/actor";

import { startOfUtcDay, toUtcDayKey, isSameUtcDay, isYesterdayUtc } from "./dates";
import { getLevelForXp } from "./levels";
import { getDailyStreakBonusRule } from "./rules";
import { buildGamificationSummary } from "./summary";
import type {
    GamificationApplyResult,
    GamificationAwardEvent,
} from "./types";

export type PendingXpAward = {
    sourceType: XpSourceType;
    xpDelta: number;
    rankedXpDelta?: number;
    reason: string;
    idempotencyKey: string;
    sourceId?: string | null;
    subjectId?: string | null;
    moduleId?: string | null;
    topicId?: string | null;
    instanceId?: string | null;
    sessionId?: string | null;
};

type TxClient = Prisma.TransactionClient;

async function createXpEventIfMissing(
    tx: TxClient,
    args: {
        actorKey: string;
        userId: string | null;
        award: PendingXpAward;
    },
): Promise<{ xp: number; rankedXp: number }> {
    const inserted = await tx.xpEvent.createMany({
        data: [
            {
                actorKey: args.actorKey,
                userId: args.userId,
                sourceType: args.award.sourceType,
                sourceId: args.award.sourceId ?? null,
                subjectId: args.award.subjectId ?? null,
                moduleId: args.award.moduleId ?? null,
                topicId: args.award.topicId ?? null,
                instanceId: args.award.instanceId ?? null,
                sessionId: args.award.sessionId ?? null,
                xpDelta: args.award.xpDelta,
                rankedXpDelta: args.award.rankedXpDelta ?? 0,
                reason: args.award.reason,
                idempotencyKey: args.award.idempotencyKey,
            },
        ],
        skipDuplicates: true,
    });

    return inserted.count === 1
        ? { xp: args.award.xpDelta, rankedXp: args.award.rankedXpDelta ?? 0 }
        : { xp: 0, rankedXp: 0 };
}

export async function applyGamificationAwards(args: {
    prisma: PrismaClient;
    actor: Actor;
    awards: PendingXpAward[];
    countsAsActivity: boolean;
}): Promise<GamificationApplyResult> {
    const { prisma, actor, awards, countsAsActivity } = args;

    const actorKey = actorKeyOf(actor);
    const userId = actor.userId ?? null;

    const now = new Date();
    const today = startOfUtcDay(now);
    const todayKey = toUtcDayKey(now);

    return prisma.$transaction(async (tx) => {
        const [existingProgress, existingDaily] = await Promise.all([
            tx.learnerProgress.findUnique({
                where: { actorKey },
            }),
            tx.dailyLearningStat.findUnique({
                where: {
                    actorKey_day: {
                        actorKey,
                        day: today,
                    },
                },
            }),
        ]);

        const awarded: GamificationAwardEvent[] = [];
        let xpGained = 0;
        let rankedXpGained = 0;

        const hadMeaningfulActivityToday =
            (existingDaily?.correctCount ?? 0) > 0 ||
            (existingDaily?.sessionCount ?? 0) > 0 ||
            (existingDaily?.answeredCount ?? 0) > 0 ||
            (existingDaily?.xpEarned ?? 0) > 0;

        await tx.dailyLearningStat.upsert({
            where: {
                actorKey_day: {
                    actorKey,
                    day: today,
                },
            },
            create: {
                actorKey,
                userId,
                day: today,
                xpEarned: 0,
                rankedXpEarned: 0,
                answeredCount: 0,
                correctCount: 0,
                sessionCount: 0,
                minutesStudied: 0,
            },
            update: {
                userId,
            },
        });

        for (const award of awards) {
            const added = await createXpEventIfMissing(tx, {
                actorKey,
                userId,
                award,
            });

            if (added.xp > 0 || added.rankedXp > 0) {
                xpGained += added.xp;
                rankedXpGained += added.rankedXp;
                awarded.push({
                    sourceType: award.sourceType as GamificationAwardEvent["sourceType"],
                    xpDelta: added.xp,
                    rankedXpDelta: added.rankedXp,
                    reason: award.reason,
                });
            }
        }

        let nextCurrentStreak = existingProgress?.currentStreak ?? 0;
        let nextLongestStreak = existingProgress?.longestStreak ?? 0;
        let nextLastActiveOn = existingProgress?.lastActiveOn ?? null;
        let streakExtended = false;

        if (countsAsActivity && !hadMeaningfulActivityToday) {
            if (isSameUtcDay(existingProgress?.lastActiveOn, today)) {
                nextCurrentStreak = existingProgress?.currentStreak ?? 0;
            } else if (isYesterdayUtc(existingProgress?.lastActiveOn, today)) {
                nextCurrentStreak = (existingProgress?.currentStreak ?? 0) + 1;
            } else {
                nextCurrentStreak = 1;
            }

            nextLongestStreak = Math.max(existingProgress?.longestStreak ?? 0, nextCurrentStreak);
            nextLastActiveOn = today;
            streakExtended = true;

            const streakRule = getDailyStreakBonusRule(nextCurrentStreak);

            const streakAdded = await createXpEventIfMissing(tx, {
                actorKey,
                userId,
                award: {
                    sourceType: streakRule.sourceType,
                    xpDelta: streakRule.xpDelta,
                    rankedXpDelta: 0,
                    reason: streakRule.reason,
                    idempotencyKey: `xp:streak:${actorKey}:${todayKey}`,
                    sourceId: todayKey,
                },
            });

            if (streakAdded.xp > 0 || streakAdded.rankedXp > 0) {
                xpGained += streakAdded.xp;
                rankedXpGained += streakAdded.rankedXp;
                awarded.push({
                    sourceType: "streak_bonus",
                    xpDelta: streakAdded.xp,
                    rankedXpDelta: streakAdded.rankedXp,
                    reason: streakRule.reason,
                });
            }
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
                where: {
                    actorKey_day: {
                        actorKey,
                        day: today,
                    },
                },
                data: {
                    xpEarned: { increment: xpGained },
                    rankedXpEarned: { increment: rankedXpGained },
                },
            });
        }

        const summary = buildGamificationSummary({
            totalXp: nextTotalXp,
            rankedXp: nextRankedXp,
            currentStreak: nextCurrentStreak,
            longestStreak: nextLongestStreak,
        });

        return {
            xpGained,
            rankedXpGained,
            leveledUp: nextLevel > previousLevel,
            streakExtended,
            awarded,
            summary,
        };
    });
}
