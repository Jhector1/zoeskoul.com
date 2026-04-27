import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";

import {
    getModuleCompleteXpRule,
    getTopicCompleteXpRule,
} from "./rules";
import {
    applyGamificationAwards,
    type PendingXpAward,
} from "./applyGamificationAwards";
import type { ReviewProgressGamificationResult } from "./types";

function getCompletedTopicIds(state: ReviewProgressState | null | undefined): Set<string> {
    const out = new Set<string>();
    const topics = (state as any)?.topics ?? {};

    for (const [tid, tp] of Object.entries<any>(topics)) {
        if (tp?.completed) out.add(String(tid));
    }

    return out;
}

export async function awardReviewProgressGamification(args: {
    prisma: PrismaClient;
    actor: Actor;
    subjectSlug: string;
    moduleSlug: string;
    previousState: ReviewProgressState | null;
    nextState: ReviewProgressState;
}): Promise<ReviewProgressGamificationResult | null> {
    const { prisma, actor, subjectSlug, moduleSlug, previousState, nextState } = args;

    const prevCompletedTopics = getCompletedTopicIds(previousState);
    const nextCompletedTopics = getCompletedTopicIds(nextState);

    const newlyCompletedTopics = [...nextCompletedTopics].filter(
        (tid) => !prevCompletedTopics.has(tid),
    );

    const prevModuleCompleted = Boolean((previousState as any)?.moduleCompleted);
    const nextModuleCompleted = Boolean((nextState as any)?.moduleCompleted);

    const awards: PendingXpAward[] = [];

    for (const tid of newlyCompletedTopics) {
        const rule = getTopicCompleteXpRule(tid);

        awards.push({
            sourceType: rule.sourceType,
            xpDelta: rule.xpDelta,
            reason: rule.reason,
            idempotencyKey: `xp:topic:${subjectSlug}:${moduleSlug}:${tid}:complete`,
            sourceId: tid,
            subjectId: subjectSlug,
            moduleId: moduleSlug,
            topicId: tid,
        });
    }

    if (!prevModuleCompleted && nextModuleCompleted) {
        const rule = getModuleCompleteXpRule(moduleSlug);

        awards.push({
            sourceType: rule.sourceType,
            xpDelta: rule.xpDelta,
            reason: rule.reason,
            idempotencyKey: `xp:module:${subjectSlug}:${moduleSlug}:complete`,
            sourceId: moduleSlug,
            subjectId: subjectSlug,
            moduleId: moduleSlug,
        });
    }

    if (!awards.length) return null;

    return applyGamificationAwards({
        prisma,
        actor,
        awards,
        countsAsActivity: true,
    });
}
