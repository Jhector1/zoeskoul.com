import type { PrismaClient } from "@/lib/prisma";

import type { GetParams } from "./schemas";
import type { PracticeGetContext } from "./types";
import { loadPracticeGetSession } from "./repositories/session.repo";
import type { Actor } from "@/lib/practice/actor";
import { applySharedChallengeParams } from "@/lib/practice/challenges/session";
import { applyDailyFiveParams } from "@/lib/practice/experience/dailyFive";
import { applySubscriberPracticeParams } from "@/lib/practice/experience/subscriberPractice";

export async function buildPracticeGetContext(args: {
    prisma: PrismaClient;
    actor: Actor;
    params: GetParams;
    locale?: string;
    safeReturnUrl?: string | null;
    safeReturnTo?: string | null;
}): Promise<PracticeGetContext> {
    const requestedParams: GetParams = {
        ...args.params,
        returnUrl: args.safeReturnUrl ?? undefined,
        returnTo: args.safeReturnTo ?? undefined,
    };

    const session = requestedParams.sessionId
        ? await loadPracticeGetSession(args.prisma, requestedParams.sessionId)
        : null;

    const challengeParams = applySharedChallengeParams(
        requestedParams,
        session?.meta ?? null,
    );

    const dailyParams = applyDailyFiveParams(challengeParams, session);
    const params = applySubscriberPracticeParams(dailyParams, session);

    return {
        prisma: args.prisma,
        actor: args.actor,
        params,
        locale: args.locale,
        session,
    };
}
