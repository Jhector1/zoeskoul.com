import { NextResponse } from "next/server";

import { attachGuestCookie } from "@/lib/practice/actor";
import { isOnboardingTrialSession } from "@/lib/onboarding/trialPolicy";

import type { PracticeValidateContext } from "./types";
import { getExpectedCanon } from "./mappers/expected.mapper";
import { gradeInstance } from "./services/grading.service";
import {
    assertAnswerKindMatchesInstance,
    assertInstanceNotFinalized,
} from "./guards/instance.guard";
import { computeCanReveal } from "./policies/validate.policy";
import {
    countPriorNonRevealAttempts,
    persistAttemptAndFinalize,
} from "./repositories/attempt.repo";
import {
    computeMaxAttempts,
    computeAttemptsLeft,
} from "../shared/attempts";
import {
    jsonApiResponse,
    safeSameOriginUrl,
    hardenApiResponse,
} from "../shared/http";
import {
    assertSessionOwnerMatchesActor,
    enforceSessionAssignmentEntitlement,
} from "../shared/sessionAccess";
import { resolvePracticeRunMode } from "../shared/run";

export async function handlePracticeValidate(ctx: PracticeValidateContext) {
    const { prisma, req, requestId, body, payload, actor, setGuestId, instance, session } = ctx;

    const isReveal = Boolean(body.reveal);
    const answer = body.answer;

    if (!isReveal && !answer) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: "Missing answer.",
                status: 400,
            }),
            setGuestId ?? undefined,
        );
    }

    const isAssignment = Boolean(session?.assignmentId);

    if (isOnboardingTrialSession(session) && isAssignment) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: "Invalid trial session state.",
                status: 400,
            }),
            setGuestId ?? undefined,
        );
    }

    try {
        assertAnswerKindMatchesInstance({
            isReveal,
            answer: answer ?? null,
            instanceKind: instance.kind,
        });

        assertInstanceNotFinalized({
            isReveal,
            answeredAt: instance.answeredAt,
        });
    } catch (e: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: e?.message ?? "Invalid request.",
                status: Number(e?.status) || 400,
                extra: e?.extra,
            }),
            setGuestId ?? undefined,
        );
    }

    try {
        assertSessionOwnerMatchesActor(session, actor);
    } catch (e: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: e?.message ?? "Forbidden.",
                status: Number(e?.status) || 403,
                extra:
                    process.env.NODE_ENV === "development"
                        ? {
                            code: e?.code ?? "SESSION_OWNER_MISMATCH",
                            debug: {
                                actor,
                                session: {
                                    id: session?.id ?? null,
                                    mode: session?.mode ?? null,
                                    userId: session?.userId ?? null,
                                    guestId: session?.guestId ?? null,
                                },
                            },
                        }
                        : { code: e?.code ?? "SESSION_OWNER_MISMATCH" },
            }),
            setGuestId ?? undefined,
        );
    }

    try {
        const gate = await enforceSessionAssignmentEntitlement(session);
        if (gate.kind === "res") {
            return attachGuestCookie(gate.res as NextResponse, setGuestId ?? undefined);
        }
    } catch (e: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: e?.message ?? "Forbidden.",
                status: Number(e?.status) || 403,
            }),
            setGuestId ?? undefined,
        );
    }

    const canReveal = computeCanReveal({
        isAssignment,
        allowRevealFromKey: Boolean((payload as any).allowReveal),
        allowRevealFromAssignment: Boolean(session?.assignment?.allowReveal),
    });

    if (isReveal && !canReveal) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: "Reveal is disabled for this question.",
                status: 403,
            }),
            setGuestId ?? undefined,
        );
    }

    const mode = resolvePracticeRunMode(session);
    const maxAttempts = computeMaxAttempts({
        mode,
        assignmentMaxAttempts: session?.assignment?.maxAttempts ?? null,
    });

    const priorNonRevealAttempts = await countPriorNonRevealAttempts(prisma, {
        instanceId: instance.id,
        actor,
    });

    if (!isReveal && maxAttempts != null && priorNonRevealAttempts >= maxAttempts) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: "No attempts left for this question.",
                status: 409,
                extra: {
                    attempts: { used: priorNonRevealAttempts, max: maxAttempts, left: 0 },
                    finalized: true,
                },
            }),
            setGuestId ?? undefined,
        );
    }

    const expectedCanon = getExpectedCanon(instance);
    if (!expectedCanon) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: "Server bug: missing secretPayload.expected.",
                status: 500,
            }),
            setGuestId ?? undefined,
        );
    }

    const showDebug = Boolean(session?.assignment?.showDebug);

    const graded = await gradeInstance({
        instance,
        expectedCanon,
        answer: isReveal ? null : answer!,
        isReveal,
        showDebug,
    });

    const nextNonRevealAttempts =
        isReveal ? priorNonRevealAttempts : priorNonRevealAttempts + 1;

    const finalizeOnExhaust =
        mode === "assignment" || mode === "session" || mode === "onboarding_trial";

    const exhausted = maxAttempts != null && nextNonRevealAttempts >= maxAttempts;
    const finalized = isReveal ? false : Boolean(graded.ok) || (finalizeOnExhaust && exhausted);

    const persisted = await persistAttemptAndFinalize(prisma, {
        instance,
        actor,
        isReveal,
        answerPayload: isReveal ? { reveal: true } : answer!,
        ok: isReveal ? false : Boolean(graded.ok),
        finalized,
    });

    const includeExpected = isReveal;

    let publicExplanation = graded.explanation;
    if (!includeExpected && instance.kind === "numeric" && !graded.ok) {
        publicExplanation = "Not correct.";
    }

    const left = computeAttemptsLeft({
        used: nextNonRevealAttempts,
        max: maxAttempts,
    });

    const returnUrl = safeSameOriginUrl(req, session?.returnUrl ?? null);

    const res = NextResponse.json({
        ok: isReveal ? null : Boolean(graded.ok),
        revealUsed: isReveal,
        revealAnswer: isReveal ? graded.revealAnswer : null,
        expected: null,
        explanation: includeExpected ? graded.explanation : publicExplanation,
        finalized,
        attempts: { used: nextNonRevealAttempts, max: maxAttempts, left },
        sessionComplete: persisted.sessionComplete,
        summary: persisted.sessionSummary,
        returnUrl,
        requestId,
    });

    res.headers.set("X-Request-Id", requestId);
    return attachGuestCookie(hardenApiResponse(res), setGuestId ?? undefined);
}