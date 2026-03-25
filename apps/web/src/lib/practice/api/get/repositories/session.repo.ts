import type { Prisma, PrismaClient } from "@prisma/client";

export const practiceGetSessionSelect = {
    id: true,
    status: true,
    userId: true,
    guestId: true,
    mode: true,
    meta: true,
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
            difficulty: true,
            showDebug: true,
            questionCount: true,
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