import type { PrismaClient } from "@prisma/client";
import { getLevelProgress } from "./levels";
import type { GamificationSummary } from "./types";

export function buildGamificationSummary(input?: {
    totalXp?: number | null;
    currentStreak?: number | null;
    longestStreak?: number | null;
}): GamificationSummary {
    const totalXp = Math.max(0, input?.totalXp ?? 0);
    const currentStreak = Math.max(0, input?.currentStreak ?? 0);
    const longestStreak = Math.max(0, input?.longestStreak ?? 0);

    const levelInfo = getLevelProgress(totalXp);

    return {
        totalXp,
        level: levelInfo.level,
        currentStreak,
        longestStreak,
        xpIntoLevel: levelInfo.xpIntoLevel,
        xpForNextLevel: levelInfo.xpForNextLevel,
        levelProgressPct: levelInfo.levelProgressPct,
    };
}

export async function getLearnerGamificationSummary(
    prisma: PrismaClient,
    actorKey: string,
): Promise<GamificationSummary> {
    const row = await prisma.learnerProgress.findUnique({
        where: { actorKey },
        select: {
            totalXp: true,
            currentStreak: true,
            longestStreak: true,
        },
    });

    return buildGamificationSummary(row ?? undefined);
}