import { PracticePurpose } from "@prisma/client";

import type { PracticeGetContext, PracticeGetResult } from "./types";
import { isOnboardingTrialSession } from "@/lib/onboarding/trialPolicy";
import { assertSessionOwnerMatchesActor, enforceSessionAssignmentEntitlement } from "../shared/sessionAccess";
import { assertPracticeSessionActive } from "./guards/session.guard";
import { computePurposeDecision } from "./policies/purpose.policy";
import { getPracticeStatus } from "./useCases/getStatus";
import { generatePracticeExercise } from "./useCases/generateExercise";

function statusOf(err: any, fallback = 500) {
    return Number(err?.status) || fallback;
}

export async function handlePracticeGet(
    ctx: PracticeGetContext,
): Promise<PracticeGetResult> {
    const { prisma, actor, params, session } = ctx;

    const {
        sessionId,
        returnUrl,
        returnTo,
        statusOnly,
        preferPurpose: preferPurposeParam,
        purposePolicy: purposePolicyParam,
    } = params;

    if (sessionId && !session) {
        return {
            kind: "json",
            status: 404,
            body: { message: "Session not found." },
        };
    }

    if (session) {
        try {
            assertSessionOwnerMatchesActor(session, actor);
        } catch (e: any) {
            const code = String(e?.code ?? "");

            const recoverableTrialMismatch =
                session.mode === "onboarding_trial" &&
                code === "SESSION_OWNER_GUEST_MISMATCH";

            if (recoverableTrialMismatch) {
                return {
                    kind: "json",
                    status: 409,
                    body: {
                        message: "Session recovery required.",
                        code: "SESSION_RECOVERY_REQUIRED",
                        recoverable: true,
                        reason: code,
                        sessionId: session.id,
                    },
                };
            }

            return {
                kind: "json",
                status: statusOf(e, 400),
                body:
                    process.env.NODE_ENV === "development"
                        ? {
                            message: e.message,
                            code,
                            debug: {
                                actor,
                                session: {
                                    id: session?.id,
                                    mode: session?.mode,
                                    userId: session?.userId,
                                    guestId: session?.guestId,
                                },
                            },
                        }
                        : { message: e.message, code },
            };
        }

        const gate = await enforceSessionAssignmentEntitlement(session);
        if (gate.kind === "res") {
            return { kind: "res", res: gate.res as any };
        }

        const ru =
            typeof returnUrl === "string"
                ? returnUrl
                : typeof returnTo === "string"
                    ? returnTo
                    : null;

        if (ru && !session.returnUrl) {
            await prisma.practiceSession.update({
                where: { id: session.id },
                data: { returnUrl: ru },
                select: { id: true },
            });
            (session as any).returnUrl = ru;
        }
    }

    const isTrial = isOnboardingTrialSession(session);

    const decision = computePurposeDecision({
        session,
        preferPurposeParam,
        purposePolicyParam,
    });

    if (!decision.ok) {
        return {
            kind: "json",
            status: decision.status,
            body: { message: decision.message, detail: decision.detail },
        };
    }

    const purposeMode = decision.effective;

    if (session && !session.assignmentId && (purposeMode === "quiz" || purposeMode === "project")) {
        const cur = String(session.preferPurpose ?? "quiz");
        if (cur !== purposeMode) {
            await prisma.practiceSession.update({
                where: { id: session.id },
                data: { preferPurpose: purposeMode as PracticePurpose },
                select: { id: true },
            });
            (session as any).preferPurpose = purposeMode;
        }
    }

    if (isTrial) {
        if (session?.assignmentId) {
            return {
                kind: "json",
                status: 400,
                body: { message: "Trial sessions cannot be assignment-backed." },
            };
        }

        if (purposeMode !== "quiz" && purposeMode !== "mixed") {
            return {
                kind: "json",
                status: 403,
                body: { message: "Trial sessions only allow quiz questions." },
            };
        }
    }

    if (statusOnly === "true") {
        return getPracticeStatus(ctx, decision);
    }

    if (session) {
        try {
            assertPracticeSessionActive(session);
        } catch (e: any) {
            return {
                kind: "json",
                status: statusOf(e, 400),
                body: { message: e.message },
            };
        }
    }

    return generatePracticeExercise(ctx, decision);
}