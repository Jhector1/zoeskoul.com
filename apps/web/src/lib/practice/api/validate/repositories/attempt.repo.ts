import type { Prisma, PrismaClient } from "@/lib/prisma";
import type { LoadedValidateInstance } from "./instance.repo";

const PRACTICE_VALIDATE_TX_OPTIONS = {
    maxWait: 5_000,
    timeout: 15_000,
} as const;

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

export async function countPriorNonRevealAttempts(
    prisma: PrismaClient,
    args: {
        instanceId: string;
        actor: { userId?: string | null; guestId?: string | null };
    },
) {
    const OR = [
        args.actor.userId ? { userId: args.actor.userId } : null,
        args.actor.guestId ? { guestId: args.actor.guestId } : null,
    ].filter(Boolean) as any[];

    return prisma.practiceAttempt.count({
        where: {
            instanceId: args.instanceId,
            revealUsed: false,
            OR,
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
    /**
     * This is intentionally outside the validate write transaction. The summary
     * can be moderately expensive on large sessions and should never hold the
     * attempt/finalization transaction open long enough to hit Prisma P2028.
     */
    const lastByInstance = await prisma.practiceAttempt.groupBy({
        by: ["instanceId"],
        where: {
            sessionId: args.session.id,
            revealUsed: false,
        },
        _max: { createdAt: true },
    });

    const or = lastByInstance
        .map((r) => {
            const createdAt = r._max.createdAt;
            if (!createdAt) return null;
            return { instanceId: r.instanceId, createdAt };
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
        .filter((a) => a.ok === false)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return {
        correct: args.session.correct,
        total: args.session.total,
        answeredCount: args.answeredCount,
        targetCount: args.session.targetCount,
        missed: missed.map((a) => ({
            instanceId: a.instanceId,
            kind: a.instance.kind,
            title: a.instance.title,
            prompt: a.instance.prompt,
            yourAnswer: a.answerPayload,
        })),
    };
}

async function finalizeSessionSummaryAfterCommit(
    prisma: PrismaClient,
    args: {
        session: SessionSnapshot;
    },
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

export async function persistAttemptAndFinalize(
    prisma: PrismaClient,
    args: {
        instance: LoadedValidateInstance;
        actor: { userId?: string | null; guestId?: string | null };
        isReveal: boolean;
        answerPayload: Prisma.InputJsonValue;
        ok: boolean;
        finalized: boolean;
    },
) {
    const instance = args.instance;

    /**
     * Keep this transaction write-only and short.
     *
     * The old implementation also counted session answers, completed the
     * session, grouped attempts, and built the missed-answer summary inside the
     * same interactive transaction. Under local dev cold compiles or a loaded DB
     * that pushed the transaction past Prisma's 5s default and caused P2028:
     * "A commit cannot be executed on an expired transaction."
     */
    const txResult = await prisma.$transaction(async (tx) => {
        await tx.practiceAttempt.create({
            data: {
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
        let session: SessionSnapshot | null = null;

        if (!args.isReveal && args.finalized) {
            const mark = await tx.practiceQuestionInstance.updateMany({
                where: {
                    id: instance.id,
                    answeredAt: null,
                },
                data: {
                    answeredAt: new Date(),
                },
            });

            wonFinalization = mark.count === 1;
        }

        if (wonFinalization && instance.sessionId) {
            session = await tx.practiceSession.update({
                where: { id: instance.sessionId },
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

        return { wonFinalization, session };
    }, PRACTICE_VALIDATE_TX_OPTIONS);

    if (txResult.wonFinalization && txResult.session) {
        return finalizeSessionSummaryAfterCommit(prisma, {
            session: txResult.session,
        });
    }

    return { sessionComplete: false, sessionSummary: null };
}
