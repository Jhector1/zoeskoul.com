import type { PrismaClient } from "@prisma/client";

export async function loadValidateInstance(prisma: PrismaClient, instanceId: string) {
    return prisma.practiceQuestionInstance.findUnique({
        where: { id: instanceId },
        select: {
            id: true,
            kind: true,
            title: true,
            prompt: true,
            answeredAt: true,
            publicPayload: true,
            secretPayload: true,
            sessionId: true,

            topic: {
                select: {
                    id: true,
                    slug: true,
                    subject: {
                        select: { slug: true },
                    },
                    module: {
                        select: {
                            slug: true,
                            subject: {
                                select: { slug: true },
                            },
                        },
                    },
                },
            },

            session: {
                select: {
                    id: true,
                    status: true,
                    mode: true,
                    meta: true,
                    userId: true,
                    guestId: true,
                    assignmentId: true,
                    targetCount: true,
                    total: true,
                    correct: true,
                    returnUrl: true,
                    assignment: {
                        select: {
                            id: true,
                            allowReveal: true,
                            maxAttempts: true,
                            difficulty: true,
                            showDebug: true,
                        },
                    },
                },
            },
        },
    });
}

export type LoadedValidateInstance = NonNullable<
    Awaited<ReturnType<typeof loadValidateInstance>>
>;
