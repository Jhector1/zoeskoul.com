import { PracticePurpose } from "@zoeskoul/db";

import type { PracticeGetContext, PracticeGetResult } from "./types";
import { isOnboardingTrialSession } from "@/lib/onboarding/trialPolicy";
import { assertSessionOwnerMatchesActor, assertAssignmentSessionAccess } from "../shared/sessionAccess";
import { assertPracticeSessionActive } from "./guards/session.guard";
import { computePurposeDecision } from "./policies/purpose.policy";
import { getPracticeStatus } from "./useCases/getStatus";
import { generatePracticeExercise } from "./useCases/generateExercise";
import { readSharedChallengeMeta } from "@/lib/practice/challenges/session";
import {
    assertPracticeExperienceInvariant,
    resolvePracticeExperienceMode,
} from "@/lib/practice/experience/resolve";
import { applyAuthoredPracticeTarget } from "@/lib/practice/experience/authoredPracticeQueue";
import { loadSelfPacedPracticeState } from "@/lib/practice/experience/selfPacedPracticeState.server";

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
            assertPracticeExperienceInvariant(session);
            assertSessionOwnerMatchesActor(session, actor);
        } catch (e: any) {
            const code = String(e?.code ?? "");

            const experienceMode = resolvePracticeExperienceMode(session);
            const recoverableTrialMismatch =
                (experienceMode === "onboarding_trial" ||
                    experienceMode === "public_challenge") &&
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

        assertAssignmentSessionAccess(session, actor);

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

    const experienceMode = resolvePracticeExperienceMode(session);
    const isOnboardingTrial = isOnboardingTrialSession(session);
    const isSharedChallenge = experienceMode === "public_challenge" && Boolean(
        readSharedChallengeMeta(session?.meta ?? null),
    );

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

    if (
        session &&
        !session.assignmentId &&
        (purposeMode === "quiz" ||
            purposeMode === "project" ||
            purposeMode === "practice")
    ) {
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

    if (isOnboardingTrial) {
        if (session?.assignmentId) {
            return {
                kind: "json",
                status: 400,
                body: { message: "Trial sessions cannot be assignment-backed." },
            };
        }

        if (
            !isSharedChallenge &&
            purposeMode !== "quiz" &&
            purposeMode !== "mixed"
        ) {
            return {
                kind: "json",
                status: 403,
                body: { message: "Standard trial sessions only allow quiz questions." },
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

    if (!session && decision.effective === "practice") {
        if (!actor.userId) {
            return {
                kind: "json",
                status: 401,
                body: {
                    code: "PRACTICE_LEARNER_REQUIRED",
                    message:
                        "An authenticated learner is required for canonical Practice progress.",
                },
            };
        }

        const subjectSlug = String(params.subject ?? "").trim();
        const moduleSlug = String(params.module ?? "").trim();
        const practiceRunId = String(params.practiceRunId ?? "").trim();
        const practiceRunStartedAt = String(
            params.practiceRunStartedAt ?? "",
        ).trim();
        if (
            !subjectSlug ||
            !moduleSlug ||
            !practiceRunId ||
            !practiceRunStartedAt
        ) {
            return {
                kind: "json",
                status: 400,
                body: {
                    code: "PRACTICE_RUN_REQUIRED",
                    message:
                        "Start Practice from the shared Practice entrypoint before loading exercises.",
                },
            };
        }

        const selfPacedPractice = await loadSelfPacedPracticeState({
            userId: actor.userId,
            subjectSlug,
            moduleSlug,
            practiceRunId,
            practiceRunStartedAt,
        });
        const nextParams =
            selfPacedPractice.nextTarget &&
            params.keyRefreshOnly !== "true"
                ? applyAuthoredPracticeTarget({
                    params,
                    target: selfPacedPractice.nextTarget,
                    salt:
                        `self-paced:${practiceRunId}:` +
                        `${selfPacedPractice.nextTarget.topicSlug}:` +
                        `${selfPacedPractice.nextTarget.exerciseKey}`,
                })
                : params;

        return generatePracticeExercise(
            {
                ...ctx,
                params: nextParams,
                selfPacedPractice,
            },
            decision,
        );
    }

    return generatePracticeExercise(ctx, decision);
}
