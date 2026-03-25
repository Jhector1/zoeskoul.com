import "server-only";

import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/practice/actor";
import { gatePracticeModuleAccess } from "@/lib/billing/gatePracticeModuleAccess";
import { isOnboardingTrialSession } from "@/lib/onboarding/trialPolicy";

export type PracticeAccessResolved =
    | {
    ok: true;
    mode: "standard" | "onboarding_trial";
    bypassBilling: boolean;
}
    | {
    ok: false;
    res: Response;
};

export async function resolvePracticeAccess(args: {
    prisma: PrismaClient;
    actor: Actor;
    locale: string;
    req: Request;
    params: {
        subject?: string | null;
        module?: string | null;
        sessionId?: string | null;
        returnUrl?: string | null;
        returnTo?: string | null;
    };
    session?: {
        id?: string | null;
        mode?: string | null;
    } | null;
}): Promise<PracticeAccessResolved> {
    const { prisma, actor, locale, params, session } = args;

    if (isOnboardingTrialSession(session)) {
        return {
            ok: true,
            mode: "onboarding_trial",
            bypassBilling: true,
        };
    }

    const gate = await gatePracticeModuleAccess({
        prisma,
        actor,
        locale,
        subject: params.subject ?? null,
        module: params.module ?? null,
        sessionId: params.sessionId ?? null,
        returnUrl: params.returnUrl ?? null,
        returnTo: params.returnTo ?? null,
        bypass: false,
    });

    if (!gate.ok) {
        return { ok: false, res: gate.res };
    }

    return {
        ok: true,
        mode: "standard",
        bypassBilling: false,
    };
}