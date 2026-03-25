import type { PrismaClient } from "@prisma/client";

import type { GetParams } from "./schemas";
import type { PracticeGetContext } from "./types";
import { loadPracticeGetSession } from "./repositories/session.repo";
import {Actor} from "@/lib/practice/actor";

export async function buildPracticeGetContext(args: {
    prisma: PrismaClient;
    actor: Actor;
    params: GetParams;
    locale?: string;
    safeReturnUrl?: string | null;
    safeReturnTo?: string | null;
}): Promise<PracticeGetContext> {
    const params: GetParams = {
        ...args.params,
        returnUrl: args.safeReturnUrl ?? undefined,
        returnTo: args.safeReturnTo ?? undefined,
    };

    const session = params.sessionId
        ? await loadPracticeGetSession(args.prisma, params.sessionId)
        : null;

    return {
        prisma: args.prisma,
        actor: args.actor,
        params,
        locale: args.locale,
        session,
    };
}