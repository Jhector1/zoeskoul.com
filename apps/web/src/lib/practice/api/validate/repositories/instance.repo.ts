import type { PrismaClient } from "@/lib/prisma";

export async function loadValidateInstance(prisma: PrismaClient, instanceId: string) {
    return prisma.practiceQuestionInstance.findUnique({
        where: { id: instanceId },
        select: {
            id: true,
            kind: true,
            difficulty: true,
            exerciseKey: true,
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
                    subjectId: true,
                    moduleId: true,
                    subject: {
                        select: { id: true, slug: true },
                    },
                    module: {
                        select: {
                            id: true,
                            slug: true,
                            subject: {
                                select: { id: true, slug: true },
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
                    moduleId: true,
                    difficulty: true,
                    targetCount: true,
                    total: true,
                    correct: true,
                    returnUrl: true,
                    assignment: {
                        select: {
                            id: true,
                            allowReveal: true,
                            maxAttempts: true,
                            maxQuestionAttempts: true,
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
