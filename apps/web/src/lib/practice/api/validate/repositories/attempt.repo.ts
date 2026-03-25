import type { Prisma, PrismaClient } from "@prisma/client";
import type { LoadedValidateInstance } from "./instance.repo";

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

    return prisma.$transaction(async (tx) => {
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

        let sessionComplete = false;
        let sessionSummary: null | {
            correct: number;
            total: number;
            missed: Array<any>;
            answeredCount: number;
            targetCount: number;
        } = null;

        if (wonFinalization && instance.sessionId) {
            const updated = await tx.practiceSession.update({
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

            const answeredCount = await tx.practiceQuestionInstance.count({
                where: {
                    sessionId: updated.id,
                    answeredAt: { not: null },
                },
            });

            if (answeredCount >= updated.targetCount) {
                if (updated.status !== "completed") {
                    await tx.practiceSession.update({
                        where: { id: updated.id },
                        data: { status: "completed", completedAt: new Date() },
                    });
                }

                sessionComplete = true;

                const lastByInstance = await tx.practiceAttempt.groupBy({
                    by: ["instanceId"],
                    where: {
                        sessionId: updated.id,
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
                        : await tx.practiceAttempt.findMany({
                            where: {
                                sessionId: updated.id,
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

                sessionSummary = {
                    correct: updated.correct,
                    total: updated.total,
                    answeredCount,
                    targetCount: updated.targetCount,
                    missed: missed.map((a) => ({
                        instanceId: a.instanceId,
                        kind: a.instance.kind,
                        title: a.instance.title,
                        prompt: a.instance.prompt,
                        yourAnswer: a.answerPayload,
                    })),
                };
            }
        }

        return { sessionComplete, sessionSummary };
    });
}
