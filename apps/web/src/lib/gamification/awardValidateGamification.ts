import type {
    XpSourceType,
} from "@zoeskoul/db";
import type { Prisma, PrismaClient } from "@/lib/prisma";

import type { Actor } from "@/lib/practice/actor";
import { actorKeyOf } from "@/lib/practice/actor";

import { startOfUtcDay, toUtcDayKey, isSameUtcDay, isYesterdayUtc } from "./dates";
import { getLevelForXp } from "./levels";
import {
    getAttemptXpRule,
    getDailyStreakBonusRule,
    getSessionCompleteXpRule,
} from "./rules";
import { buildGamificationSummary } from "./summary";
import type {
    GamificationAwardEvent,
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

async function createXpEventIfMissing(
    tx: TxClient,
    args: {
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
        reason: string;
        idempotencyKey: string;
    },
): Promise<number> {
    const existing = await tx.xpEvent.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true },
    });

    if (existing) return 0;

    await tx.xpEvent.create({
        data: {
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
            reason: args.reason,
            idempotencyKey: args.idempotencyKey,
        },
    });

    return args.xpDelta;
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

    const now = new Date();
    const today = startOfUtcDay(now);
    const todayKey = toUtcDayKey(now);

    const topicId = String(instance?.topicId ?? instance?.topic?.id ?? "");
    const moduleId =
        (instance?.topic?.moduleId as string | null | undefined) ??
        (session?.moduleId as string | null | undefined) ??
        null;
    const subjectId =
        (instance?.topic?.subjectId as string | null | undefined) ??
        (instance?.topic?.subject?.id as string | null | undefined) ??
        null;
    const instanceId = String(instance?.id ?? "");
    const sessionId = (session?.id as string | null | undefined) ?? null;

    const result = await prisma.$transaction(async (tx) => {
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
            (existingDaily?.sessionCount ?? 0) > 0;

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

        const attemptRule = getAttemptXpRule({
            ok: gradedOk,
            isReveal,
            priorNonRevealAttempts,
        });

        if (attemptRule) {
            const attemptNo = priorNonRevealAttempts + 1;
            const attemptIdempotencyKey = [
                "xp",
                "attempt",
                actorKey,
                instanceId,
                String(attemptNo),
                attemptRule.sourceType,
            ].join(":");

            const added = await createXpEventIfMissing(tx, {
                actorKey,
                userId,
                sourceType: attemptRule.sourceType,
                sourceId: instanceId,
                subjectId,
                moduleId,
                topicId,
                instanceId,
                sessionId,
                xpDelta: attemptRule.xpDelta,
                reason: attemptRule.reason,
                idempotencyKey: attemptIdempotencyKey,
            });

            if (added > 0) {
                xpGained += added;
                awarded.push({
                    sourceType: attemptRule.sourceType,
                    xpDelta: attemptRule.xpDelta,
                    reason: attemptRule.reason,
                });
            }
        }

        if (persisted.sessionComplete && sessionId) {
            const sessionRule = getSessionCompleteXpRule();

            const added = await createXpEventIfMissing(tx, {
                actorKey,
                userId,
                sourceType: sessionRule.sourceType,
                sourceId: sessionId,
                subjectId,
                moduleId,
                topicId,
                instanceId,
                sessionId,
                xpDelta: sessionRule.xpDelta,
                reason: sessionRule.reason,
                idempotencyKey: `xp:session:${actorKey}:${sessionId}:complete`,
            });

            if (added > 0) {
                xpGained += added;
                awarded.push({
                    sourceType: sessionRule.sourceType,
                    xpDelta: sessionRule.xpDelta,
                    reason: sessionRule.reason,
                });
            }
        }

        const shouldCountForStreak =
            (!isReveal && gradedOk) || Boolean(persisted.sessionComplete);

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
            const added = await createXpEventIfMissing(tx, {
                actorKey,
                userId,
                sourceType: streakRule.sourceType,
                sourceId: todayKey,
                subjectId,
                moduleId,
                topicId,
                instanceId,
                sessionId,
                xpDelta: streakRule.xpDelta,
                reason: streakRule.reason,
                idempotencyKey: `xp:streak:${actorKey}:${todayKey}`,
            });

            if (added > 0) {
                xpGained += added;
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
        } satisfies ValidateGamificationResult;
    });

    return result;
}
