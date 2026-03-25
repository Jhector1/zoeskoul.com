import type { Prisma } from "@prisma/client";
import type { TrialStartContext, TrialStartResult } from "../types";
import {
    difficultyFromLevel,
    getTrialSectionForSubject,
} from "@/lib/onboarding/trialPolicy";
import { buildTrialReturnUrl } from "@/lib/onboarding/client";
import { ownerWhereForActor } from "@/lib/practice/sessionStart";
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

async function runOnce(ctx: TrialStartContext): Promise<TrialStartResult> {
    const { prisma, actor, body, requestId } = ctx;

    const ownerWhere = ownerWhereForActor(actor);
    if (!ownerWhere) {
        return {
            ok: false,
            statusCode: 400,
            body: { message: "Missing actor.", requestId },
        };
    }

    const section = await getTrialSectionForSubject(body.subject);
    const difficulty = difficultyFromLevel(body.level);
    const returnUrl = buildTrialReturnUrl({
        locale: body.locale,
        subject: body.subject,
    });

    const meta = buildTrialMeta({
        subject: body.subject,
        level: body.level,
        locale: body.locale,
    });

    const active = await findActiveTrialSession({
        prisma,
        ownerWhere,
        sectionId: section.id,
    });

    if (active) {
        await updateTrialSession({
            prisma,
            sessionId: active.id,
            difficulty,
            returnUrl,
            meta,
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
    });

    if (completed) {
        await updateTrialSession({
            prisma,
            sessionId: completed.id,
            difficulty,
            returnUrl,
            meta,
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

    const created = await createTrialSession({
        prisma,
        userId: actor.userId ?? null,
        guestId: actor.guestId ?? null,
        sectionId: section.id,
        moduleId: section.moduleId ?? null,
        difficulty,
        returnUrl,
        meta,
    });

    return {
        ok: true,
        resumed: false,
        completed: false,
        sessionId: created.id,
        requestId,
        status: "active",
    };
}

export async function startOrResumeTrial(
    ctx: TrialStartContext,
): Promise<TrialStartResult> {
    // light retry hook for transient conflicts later if needed
    return runOnce(ctx);
}
