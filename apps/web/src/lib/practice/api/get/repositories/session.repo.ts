import type { Prisma, PrismaClient } from "@/lib/prisma";

export const practiceGetSessionSelect = {
    id: true,
    status: true,
    userId: true,
    guestId: true,
    mode: true,
    meta: true,
    experienceKey: true,
    dayKey: true,
    helpPolicy: true,
    preferPurpose: true,

    difficulty: true,
    targetCount: true,
    total: true,
    correct: true,
    returnUrl: true,

    presetId: true,
    preset: {
        select: {
            id: true,
            key: true,
            allowedKinds: true,
            allowedPurposes: true,
            lockDifficulty: true,
            lockTopic: true,
            allowReveal: true,
        },
    },

    assignmentId: true,
    assignment: {
        select: {
            allowReveal: true,
            maxAttempts: true,
            maxQuestionAttempts: true,
            difficulty: true,
            showDebug: true,
            questionCount: true,
        },
    },

    instances: {
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            exerciseKey: true,
            answeredAt: true,
        },
    },

    section: {
        select: {
            subjectId: true,
            slug: true,
            moduleId: true,
            subject: {
                select: {
                    slug: true,
                },
            },
            module: {
                select: {
                    id: true,
                    slug: true,
                    practicePresetId: true,
                    practicePreset: {
                        select: {
                            id: true,
                            key: true,
                            allowedKinds: true,
                            allowedPurposes: true,
                            lockDifficulty: true,
                            lockTopic: true,
                            allowReveal: true,
                        },
                    },
                },
            },
        },
    },
} satisfies Prisma.PracticeSessionSelect;

export type PracticeGetSession = Prisma.PracticeSessionGetPayload<{
    select: typeof practiceGetSessionSelect;
}>;

export async function loadPracticeGetSession(
    prisma: PrismaClient,
    sessionId?: string,
): Promise<PracticeGetSession | null> {
    if (!sessionId) return null;

    return prisma.practiceSession.findUnique({
        where: { id: sessionId },
        select: practiceGetSessionSelect,
    });
}
