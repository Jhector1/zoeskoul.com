import { NextResponse } from "next/server";

import { attachGuestCookie } from "@/lib/practice/actor";
import { awardValidateGamification } from "@/lib/gamification/awardValidateGamification";

import type { PracticeValidateContext } from "./types";
import { getExpectedCanon } from "./mappers/expected.mapper";
import { selectExpectedCanonForValidation } from "./services/currentAuthoredSqlExpected.service";
import { gradeInstance } from "./services/grading.service";
import { assertAnswerKindMatchesInstance } from "./guards/instance.guard";
import { computeCanReveal } from "./policies/validate.policy";
import {
    loadFinalizedValidateSnapshot,
    persistValidatedAttempt,
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
    assertAssignmentSessionAccess,
} from "../shared/sessionAccess";
import { resolvePracticeRunMode } from "../shared/run";
import {
    getSessionMaxAttempts,
    readSharedChallengeMeta,
} from "@/lib/practice/challenges/session";
import {
    assertPracticeExperienceInvariant,
    resolvePracticeExperienceMode,
} from "@/lib/practice/experience/resolve";
import { readDailyFiveMeta } from "@/lib/practice/experience/dailyFive";

function duplicateValidateResponse(args: {
    req: Request;
    requestId: string;
    session: any;
    setGuestId: string | null;
    ok: boolean;
    revealUsed: boolean;
    finalized: boolean;
    attemptsUsed: number;
    maxAttempts: number | null;
    sessionComplete: boolean;
    explanation: string | null;
    feedback?: unknown;
}) {
    const left = computeAttemptsLeft({
        used: args.attemptsUsed,
        max: args.maxAttempts,
    });
    const returnUrl = safeSameOriginUrl(args.req, args.session?.returnUrl ?? null);
    const res = NextResponse.json({
        ok: args.ok,
        revealUsed: args.revealUsed,
        revealAnswer: null,
        expected: null,
        explanation: args.explanation,
        feedback: args.feedback ?? null,
        finalized: args.finalized,
        duplicate: true,
        attempts: {
            used: args.attemptsUsed,
            max: args.maxAttempts,
            left,
        },
        sessionComplete: args.sessionComplete,
        summary: null,
        gamification: null,
        returnUrl,
        requestId: args.requestId,
    });

    res.headers.set("X-Request-Id", args.requestId);
    return attachGuestCookie(
        hardenApiResponse(res),
        args.setGuestId ?? undefined,
    );
}

export async function handlePracticeValidate(ctx: PracticeValidateContext) {
    const {
        prisma,
        req,
        requestId,
        body,
        payload,
        actor,
        setGuestId,
        instance,
        session,
    } = ctx;

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

    try {
        assertPracticeExperienceInvariant(session);
    } catch (error: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: error?.message ?? "Invalid practice session state.",
                status: Number(error?.status) || 500,
                extra: { code: error?.code ?? "INVALID_PRACTICE_EXPERIENCE" },
            }),
            setGuestId ?? undefined,
        );
    }

    const experienceMode = resolvePracticeExperienceMode(session);
    const isAssignment = experienceMode === "assignment";

    try {
        assertAnswerKindMatchesInstance({
            isReveal,
            answer: answer ?? null,
            instanceKind: instance.kind,
        });
    } catch (error: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: error?.message ?? "Invalid request.",
                status: Number(error?.status) || 400,
                extra: error?.extra,
            }),
            setGuestId ?? undefined,
        );
    }

    try {
        assertSessionOwnerMatchesActor(session, actor);
    } catch (error: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: error?.message ?? "Forbidden.",
                status: Number(error?.status) || 403,
                extra:
                    process.env.NODE_ENV === "development"
                        ? {
                            code: error?.code ?? "SESSION_OWNER_MISMATCH",
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
                        : { code: error?.code ?? "SESSION_OWNER_MISMATCH" },
            }),
            setGuestId ?? undefined,
        );
    }

    try {
        assertAssignmentSessionAccess(session, actor);
    } catch (error: any) {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: error?.message ?? "Forbidden.",
                status: Number(error?.status) || 403,
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
    const challenge = readSharedChallengeMeta(session?.meta ?? null);
    const maxAttempts = computeMaxAttempts({
        mode,
        assignmentQuestionMaxAttempts:
            session?.assignment?.maxQuestionAttempts ?? null,
        sessionMaxAttempts:
            getSessionMaxAttempts(session?.meta ?? null) ??
            readDailyFiveMeta(session?.meta ?? null)?.maxAttempts ??
            null,
    });

    if (!isReveal && instance.answeredAt) {
        const snapshot = await loadFinalizedValidateSnapshot(prisma, {
            instance,
            actor,
        });

        return duplicateValidateResponse({
            req,
            requestId,
            session,
            setGuestId,
            ok: snapshot.ok,
            revealUsed: snapshot.revealUsed,
            finalized: true,
            attemptsUsed: snapshot.attemptsUsed,
            maxAttempts,
            sessionComplete: snapshot.sessionComplete,
            explanation: snapshot.ok
                ? "Already completed."
                : "This question is already finalized.",
        });
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

    const effectiveExpectedCanon = selectExpectedCanonForValidation({
        instance,
        persistedExpected: expectedCanon,
    });

    const graded = await gradeInstance({
        instance,
        expectedCanon: effectiveExpectedCanon,
        answer: isReveal ? null : answer!,
        showDebug: Boolean(session?.assignment?.showDebug),
    });

    const finalizeOnExhaust =
        mode === "assignment" ||
        mode === "public_challenge" ||
        mode === "daily_five" ||
        mode === "onboarding_trial";

    let persisted;
    try {
        persisted = await persistValidatedAttempt(prisma, {
            instance,
            actor,
            submissionId: body.submissionId ?? requestId,
            isReveal,
            answerPayload: isReveal ? { reveal: true } : answer!,
            ok: isReveal ? false : Boolean(graded.ok),
            maxAttempts,
            attemptScopeSessionId: challenge ? session?.id ?? null : null,
            finalizeOnExhaust,
        });
    } catch (error: any) {
        if (Number(error?.status) === 409) {
            return attachGuestCookie(
                jsonApiResponse({
                    requestId,
                    message: error?.message ?? "Conflicting validation request.",
                    status: 409,
                    extra: { code: error?.code ?? "VALIDATION_CONFLICT" },
                }),
                setGuestId ?? undefined,
            );
        }
        throw error;
    }

    if (persisted.kind === "attempts_exhausted") {
        return attachGuestCookie(
            jsonApiResponse({
                requestId,
                message: "No attempts left for this question.",
                status: 409,
                extra: {
                    attempts: {
                        used: persisted.attemptsUsed,
                        max: maxAttempts,
                        left: 0,
                    },
                    finalized: true,
                    sessionComplete: persisted.sessionComplete,
                },
            }),
            setGuestId ?? undefined,
        );
    }

    if (persisted.duplicate) {
        const duplicateExplanation = persisted.finalized
            ? persisted.ok
                ? "Already completed."
                : "This question is already finalized."
            : graded.explanation;

        return duplicateValidateResponse({
            req,
            requestId,
            session,
            setGuestId,
            ok: persisted.ok,
            revealUsed: persisted.revealUsed,
            finalized: persisted.finalized,
            attemptsUsed: persisted.attemptsUsed,
            maxAttempts,
            sessionComplete: persisted.sessionComplete,
            explanation: duplicateExplanation,
            feedback: persisted.finalized ? null : graded.feedback ?? null,
        });
    }

    let gamification = null;
    try {
        gamification = await awardValidateGamification({
            prisma,
            actor,
            instance,
            session,
            isReveal,
            gradedOk: Boolean(graded.ok),
            priorNonRevealAttempts: persisted.priorNonRevealAttempts,
            persisted,
        });
    } catch (error) {
        console.error("awardValidateGamification failed", {
            requestId,
            instanceId: instance?.id,
            sessionId: session?.id ?? null,
            error,
        });
    }

    let publicExplanation = graded.explanation;
    if (!isReveal && instance.kind === "numeric" && !graded.ok) {
        publicExplanation = "Not correct.";
    }

    const left = computeAttemptsLeft({
        used: persisted.attemptsUsed,
        max: maxAttempts,
    });
    const returnUrl = safeSameOriginUrl(req, session?.returnUrl ?? null);

    const res = NextResponse.json({
        ok: Boolean(graded.ok),
        revealUsed: false,
        revealAnswer: null,
        expected: null,
        explanation: publicExplanation,
        feedback: graded.feedback ?? null,
        finalized: persisted.finalized,
        duplicate: false,
        attempts: {
            used: persisted.attemptsUsed,
            max: maxAttempts,
            left,
        },
        sessionComplete: persisted.sessionComplete,
        summary: persisted.sessionSummary,
        gamification,
        returnUrl,
        requestId,
    });

    res.headers.set("X-Request-Id", requestId);
    return attachGuestCookie(hardenApiResponse(res), setGuestId ?? undefined);
}
