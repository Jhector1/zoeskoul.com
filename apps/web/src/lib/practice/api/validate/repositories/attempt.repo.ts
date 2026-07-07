import { createHash, randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/lib/prisma";
import type { LoadedValidateInstance } from "./instance.repo";

const PRACTICE_VALIDATE_TX_OPTIONS = {
    maxWait: 5_000,
    timeout: 15_000,
} as const;

type ActorIdentity = {
    userId?: string | null;
    guestId?: string | null;
};

type SessionSummary = {
    correct: number;
    total: number;
    missed: Array<any>;
    answeredCount: number;
    targetCount: number;
};

type SessionSnapshot = {
    id: string;
    total: number;
    correct: number;
    targetCount: number;
    status: string | null;
};

export type PersistValidatedAttemptResult = {
    kind: "persisted" | "duplicate" | "already_finalized" | "attempts_exhausted";
    created: boolean;
    duplicate: boolean;
    ok: boolean;
    revealUsed: boolean;
    finalized: boolean;
    priorNonRevealAttempts: number;
    attemptsUsed: number;
    sessionComplete: boolean;
    sessionSummary: SessionSummary | null;
};

function actorOrWhere(actor: ActorIdentity) {
    const OR = [
        actor.userId ? { userId: actor.userId } : null,
        actor.guestId ? { guestId: actor.guestId } : null,
    ].filter(Boolean) as Array<{ userId: string } | { guestId: string }>;

    if (OR.length === 0) {
        const error = new Error("Missing practice actor identity.");
        (error as any).status = 400;
        throw error;
    }

    return OR;
}

/**
 * PracticeAttempt already has a unique primary key, so use it as the durable
 * idempotency gate instead of adding a second schema column. The client sends a
 * UUID per intentional submit; retries for the same submit derive the same id.
 */
export function buildPracticeAttemptId(instanceId: string, submissionId: string) {
    const hex = createHash("sha256")
        .update(`${instanceId}\u0000${submissionId}`)
        .digest("hex")
        .slice(0, 32)
        .split("");

    // Keep the derived primary key valid for both plain String ids and Prisma
    // schemas backed by PostgreSQL UUID columns. Version/variant bits follow
    // the UUID layout while the value remains deterministic for retries.
    hex[12] = "5";
    hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
    const value = hex.join("");
    return [
        value.slice(0, 8),
        value.slice(8, 12),
        value.slice(12, 16),
        value.slice(16, 20),
        value.slice(20, 32),
    ].join("-");
}

export async function countPriorNonRevealAttempts(
    prisma: PrismaClient,
    args: {
        instanceId: string;
        sessionId?: string | null;
        actor: ActorIdentity;
    },
) {
    return prisma.practiceAttempt.count({
        where: {
            ...(args.sessionId
                ? { sessionId: args.sessionId }
                : { instanceId: args.instanceId }),
            revealUsed: false,
            OR: actorOrWhere(args.actor),
        },
    });
}

async function buildCompletedSessionSummary(
    prisma: PrismaClient,
    args: {
        session: SessionSnapshot;
        answeredCount: number;
    },
): Promise<SessionSummary> {
    const lastByInstance = await prisma.practiceAttempt.groupBy({
        by: ["instanceId"],
        where: {
            sessionId: args.session.id,
            revealUsed: false,
        },
        _max: { createdAt: true },
    });

    const or = lastByInstance
        .map((row) => {
            const createdAt = row._max.createdAt;
            return createdAt ? { instanceId: row.instanceId, createdAt } : null;
        })
        .filter(Boolean) as Array<{ instanceId: string; createdAt: Date }>;

    const lastAttempts =
        or.length === 0
            ? []
            : await prisma.practiceAttempt.findMany({
                where: {
                    sessionId: args.session.id,
                    revealUsed: false,
                    OR: or,
                },
                select: {
                    instanceId: true,
                    answerPayload: true,
                    createdAt: true,
                    ok: true,
                    instance: {
                        select: {
                            kind: true,
                            title: true,
                            prompt: true,
                        },
                    },
                },
            });

    const missed = lastAttempts
        .filter((attempt) => attempt.ok === false)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return {
        correct: args.session.correct,
        total: args.session.total,
        answeredCount: args.answeredCount,
        targetCount: args.session.targetCount,
        missed: missed.map((attempt) => ({
            instanceId: attempt.instanceId,
            kind: attempt.instance.kind,
            title: attempt.instance.title,
            prompt: attempt.instance.prompt,
            yourAnswer: attempt.answerPayload,
        })),
    };
}

async function finalizeSessionSummaryAfterCommit(
    prisma: PrismaClient,
    args: { session: SessionSnapshot },
): Promise<{ sessionComplete: boolean; sessionSummary: SessionSummary | null }> {
    const answeredCount = await prisma.practiceQuestionInstance.count({
        where: {
            sessionId: args.session.id,
            answeredAt: { not: null },
        },
    });

    if (answeredCount < args.session.targetCount) {
        return { sessionComplete: false, sessionSummary: null };
    }

    if (args.session.status !== "completed") {
        await prisma.practiceSession.updateMany({
            where: {
                id: args.session.id,
                status: { not: "completed" },
            },
            data: {
                status: "completed",
                completedAt: new Date(),
            },
        });
    }

    return {
        sessionComplete: true,
        sessionSummary: await buildCompletedSessionSummary(prisma, {
            session: args.session,
            answeredCount,
        }),
    };
}

export async function loadFinalizedValidateSnapshot(
    prisma: PrismaClient,
    args: {
        instance: LoadedValidateInstance;
        actor: ActorIdentity;
    },
) {
    const OR = actorOrWhere(args.actor);
    const [latestAttempt, nonRevealAttempts, answeredCount] = await Promise.all([
        prisma.practiceAttempt.findFirst({
            where: { instanceId: args.instance.id, OR },
            orderBy: { createdAt: "desc" },
            select: { ok: true, revealUsed: true, createdAt: true },
        }),
        prisma.practiceAttempt.count({
            where: {
                instanceId: args.instance.id,
                revealUsed: false,
                OR,
            },
        }),
        args.instance.sessionId
            ? prisma.practiceQuestionInstance.count({
                where: {
                    sessionId: args.instance.sessionId,
                    answeredAt: { not: null },
                },
            })
            : Promise.resolve(0),
    ]);

    const targetCount = Number(args.instance.session?.targetCount ?? 0);
    return {
        ok: Boolean(latestAttempt?.ok),
        revealUsed: Boolean(latestAttempt?.revealUsed),
        attemptsUsed: nonRevealAttempts,
        sessionComplete:
            Boolean(args.instance.sessionId) &&
            targetCount > 0 &&
            answeredCount >= targetCount,
    };
}

function sameAttemptOwner(attempt: any, actor: ActorIdentity) {
    if (actor.userId) return attempt.userId === actor.userId;
    if (actor.guestId) return attempt.guestId === actor.guestId;
    return false;
}

/**
 * Serializes all writes for one question instance and performs the attempt
 * count, idempotency check, attempt insert, finalization, and session counters
 * in one transaction. This closes the race where two requests both observed an
 * unanswered instance and each wrote attempts/stats before one finalization won.
 */
export async function persistValidatedAttempt(
    prisma: PrismaClient,
    args: {
        instance: LoadedValidateInstance;
        actor: ActorIdentity;
        submissionId: string;
        isReveal: boolean;
        answerPayload: Prisma.InputJsonValue;
        ok: boolean;
        maxAttempts: number | null;
        attemptScopeSessionId?: string | null;
        finalizeOnExhaust: boolean;
        forceFinalize?: boolean;
    },
): Promise<PersistValidatedAttemptResult> {
    const instance = args.instance;
    const OR = actorOrWhere(args.actor);
    const attemptId = buildPracticeAttemptId(instance.id, args.submissionId);

    const txResult = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practice-validate:${instance.id}`}))`;

        const liveInstance = await tx.practiceQuestionInstance.findUnique({
            where: { id: instance.id },
            select: {
                answeredAt: true,
                sessionId: true,
                session: {
                    select: {
                        id: true,
                        total: true,
                        correct: true,
                        targetCount: true,
                        status: true,
                    },
                },
            },
        });

        if (!liveInstance) {
            const error = new Error("Practice instance disappeared during validation.");
            (error as any).status = 404;
            throw error;
        }

        const attemptScope = args.attemptScopeSessionId
            ? { sessionId: args.attemptScopeSessionId }
            : { instanceId: instance.id };

        const existingAttempt = await tx.practiceAttempt.findUnique({
            where: { id: attemptId },
            select: {
                id: true,
                instanceId: true,
                sessionId: true,
                userId: true,
                guestId: true,
                ok: true,
                revealUsed: true,
            },
        });

        const priorNonRevealAttempts = await tx.practiceAttempt.count({
            where: {
                ...attemptScope,
                revealUsed: false,
                OR,
            },
        });

        if (existingAttempt) {
            if (
                existingAttempt.instanceId !== instance.id ||
                !sameAttemptOwner(existingAttempt, args.actor)
            ) {
                const error = new Error("Submission id is already bound to another attempt.");
                (error as any).status = 409;
                (error as any).code = "SUBMISSION_ID_CONFLICT";
                throw error;
            }

            // A retry of an earlier wrong submit can arrive after another tab
            // has already finalized the question correctly. Once finalized,
            // report the canonical latest result rather than reviving the stale
            // wrong result tied to this submission id.
            const canonicalAttempt = liveInstance.answeredAt
                ? await tx.practiceAttempt.findFirst({
                    where: { instanceId: instance.id, OR },
                    orderBy: { createdAt: "desc" },
                    select: { ok: true, revealUsed: true },
                })
                : existingAttempt;

            return {
                kind: "duplicate" as const,
                created: false,
                duplicate: true,
                ok: Boolean(canonicalAttempt?.ok),
                revealUsed: Boolean(canonicalAttempt?.revealUsed),
                finalized: Boolean(liveInstance.answeredAt),
                priorNonRevealAttempts: Math.max(
                    0,
                    priorNonRevealAttempts - (existingAttempt.revealUsed ? 0 : 1),
                ),
                attemptsUsed: priorNonRevealAttempts,
                session: liveInstance.session,
            };
        }

        if (liveInstance.answeredAt) {
            const latestAttempt = await tx.practiceAttempt.findFirst({
                where: { instanceId: instance.id, OR },
                orderBy: { createdAt: "desc" },
                select: { ok: true, revealUsed: true },
            });

            return {
                kind: "already_finalized" as const,
                created: false,
                duplicate: true,
                ok: Boolean(latestAttempt?.ok),
                revealUsed: Boolean(latestAttempt?.revealUsed),
                finalized: true,
                priorNonRevealAttempts,
                attemptsUsed: priorNonRevealAttempts,
                session: liveInstance.session,
            };
        }

        if (
            !args.isReveal &&
            args.maxAttempts != null &&
            priorNonRevealAttempts >= args.maxAttempts
        ) {
            // Repair legacy rows that exhausted attempts before finalization was
            // made atomic. This prevents a permanently stuck question/session.
            const latestAttempt = await tx.practiceAttempt.findFirst({
                where: {
                    ...attemptScope,
                    revealUsed: false,
                    OR,
                },
                orderBy: { createdAt: "desc" },
                select: { ok: true },
            });

            const mark = await tx.practiceQuestionInstance.updateMany({
                where: { id: instance.id, answeredAt: null },
                data: { answeredAt: new Date() },
            });

            let session = liveInstance.session;
            if (mark.count === 1 && liveInstance.sessionId) {
                session = await tx.practiceSession.update({
                    where: { id: liveInstance.sessionId },
                    data: {
                        total: { increment: 1 },
                        correct: { increment: latestAttempt?.ok ? 1 : 0 },
                    },
                    select: {
                        id: true,
                        total: true,
                        correct: true,
                        targetCount: true,
                        status: true,
                    },
                });
            }

            return {
                kind: "attempts_exhausted" as const,
                created: false,
                duplicate: false,
                ok: Boolean(latestAttempt?.ok),
                revealUsed: false,
                finalized: true,
                priorNonRevealAttempts,
                attemptsUsed: priorNonRevealAttempts,
                session,
            };
        }

        const attemptsUsed = priorNonRevealAttempts + (args.isReveal ? 0 : 1);
        const exhausted =
            args.maxAttempts != null && attemptsUsed >= args.maxAttempts;
        const shouldFinalize = Boolean(
            args.forceFinalize ||
            (!args.isReveal &&
                (args.ok || (args.finalizeOnExhaust && exhausted))),
        );

        await tx.practiceAttempt.create({
            data: {
                id: attemptId,
                sessionId: instance.sessionId ?? null,
                instanceId: instance.id,
                userId: args.actor.userId ?? null,
                guestId: args.actor.guestId ?? null,
                answerPayload: args.answerPayload,
                ok: args.ok,
                revealUsed: args.isReveal,
            },
        });

        let wonFinalization = false;
        let session = liveInstance.session;

        if (shouldFinalize) {
            const mark = await tx.practiceQuestionInstance.updateMany({
                where: { id: instance.id, answeredAt: null },
                data: { answeredAt: new Date() },
            });
            wonFinalization = mark.count === 1;
        }

        if (wonFinalization && liveInstance.sessionId) {
            session = await tx.practiceSession.update({
                where: { id: liveInstance.sessionId },
                data: {
                    total: { increment: 1 },
                    correct: { increment: args.ok ? 1 : 0 },
                },
                select: {
                    id: true,
                    total: true,
                    correct: true,
                    targetCount: true,
                    status: true,
                },
            });
        }

        return {
            kind: "persisted" as const,
            created: true,
            duplicate: false,
            ok: args.ok,
            revealUsed: args.isReveal,
            finalized: shouldFinalize,
            priorNonRevealAttempts,
            attemptsUsed,
            session,
        };
    }, PRACTICE_VALIDATE_TX_OPTIONS);

    const completion =
        txResult.finalized && txResult.session
            ? await finalizeSessionSummaryAfterCommit(prisma, {
                session: txResult.session,
            })
            : { sessionComplete: false, sessionSummary: null };

    return {
        kind: txResult.kind,
        created: txResult.created,
        duplicate: txResult.duplicate,
        ok: txResult.ok,
        revealUsed: txResult.revealUsed,
        finalized: txResult.finalized,
        priorNonRevealAttempts: txResult.priorNonRevealAttempts,
        attemptsUsed: txResult.attemptsUsed,
        sessionComplete: completion.sessionComplete,
        sessionSummary: completion.sessionSummary,
    };
}

/**
 * Compatibility wrapper used by the reveal-help endpoint. It now shares the
 * same instance lock/finalization transaction, so concurrent reveal requests do
 * not create duplicate attempts or increment session totals twice.
 */
export async function persistAttemptAndFinalize(
    prisma: PrismaClient,
    args: {
        instance: LoadedValidateInstance;
        actor: ActorIdentity;
        isReveal: boolean;
        answerPayload: Prisma.InputJsonValue;
        ok: boolean;
        finalized: boolean;
    },
) {
    const result = await persistValidatedAttempt(prisma, {
        instance: args.instance,
        actor: args.actor,
        submissionId: randomUUID(),
        isReveal: args.isReveal,
        answerPayload: args.answerPayload,
        ok: args.ok,
        maxAttempts: null,
        attemptScopeSessionId: null,
        finalizeOnExhaust: false,
        forceFinalize: args.finalized,
    });

    return {
        created: result.created,
        duplicate: result.duplicate,
        finalized: result.finalized,
        sessionComplete: result.sessionComplete,
        sessionSummary: result.sessionSummary,
    };
}
