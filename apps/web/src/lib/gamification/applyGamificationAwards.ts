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
): Promise<number> {
    const existing = await tx.xpEvent.findUnique({
        where: { idempotencyKey: args.award.idempotencyKey },
        select: { id: true },
    });

    if (existing) return 0;

    await tx.xpEvent.create({
        data: {
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
            reason: args.award.reason,
            idempotencyKey: args.award.idempotencyKey,
        },
    });

    return args.award.xpDelta;
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

            if (added > 0) {
                xpGained += added;
                awarded.push({
                    sourceType: award.sourceType as GamificationAwardEvent["sourceType"],
                    xpDelta: award.xpDelta,
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
                    reason: streakRule.reason,
                    idempotencyKey: `xp:streak:${actorKey}:${todayKey}`,
                    sourceId: todayKey,
                },
            });

            if (streakAdded > 0) {
                xpGained += streakAdded;
                awarded.push({
                    sourceType: "streak_bonus",
                    xpDelta: streakRule.xpDelta,
                    reason: streakRule.reason,
                });
            }
        }

        const previousTotalXp = existingProgress?.totalXp ?? 0;
        const nextTotalXp = previousTotalXp + xpGained;
        const previousLevel = getLevelForXp(previousTotalXp);
        const nextLevel = getLevelForXp(nextTotalXp);

        await tx.learnerProgress.upsert({
            where: { actorKey },
            create: {
                actorKey,
                userId,
                totalXp: nextTotalXp,
                level: nextLevel,
                currentStreak: nextCurrentStreak,
                longestStreak: nextLongestStreak,
                lastActiveOn: nextLastActiveOn,
                streakFreezes: 0,
            },
            update: {
                userId,
                totalXp: nextTotalXp,
                level: nextLevel,
                currentStreak: nextCurrentStreak,
                longestStreak: nextLongestStreak,
                lastActiveOn: nextLastActiveOn,
            },
        });

        if (xpGained > 0) {
            await tx.dailyLearningStat.update({
                where: {
                    actorKey_day: {
                        actorKey,
                        day: today,
                    },
                },
                data: {
                    xpEarned: { increment: xpGained },
                },
            });
        }

        const summary = buildGamificationSummary({
            totalXp: nextTotalXp,
            currentStreak: nextCurrentStreak,
            longestStreak: nextLongestStreak,
        });

        return {
            xpGained,
            leveledUp: nextLevel > previousLevel,
            streakExtended,
            awarded,
            summary,
        };
    });
}
