import type { Prisma, PrismaClient } from "@prisma/client";

export async function findActiveTrialSession(args: {
    prisma: PrismaClient;
    ownerWhere: Prisma.PracticeSessionWhereInput;
    sectionId: string;
}) {
    return args.prisma.practiceSession.findFirst({
        where: {
            ...args.ownerWhere,
            status: "active",
            mode: "onboarding_trial",
            sectionId: args.sectionId,
        },
        orderBy: { startedAt: "desc" },
        select: { id: true },
    });
}

export async function findCompletedTrialSession(args: {
    prisma: PrismaClient;
    ownerWhere: Prisma.PracticeSessionWhereInput;
    sectionId: string;
}) {
    return args.prisma.practiceSession.findFirst({
        where: {
            ...args.ownerWhere,
            status: "completed",
            mode: "onboarding_trial",
            sectionId: args.sectionId,
        },
        orderBy: { completedAt: "desc" },
        select: { id: true },
    });
}

export async function updateTrialSession(args: {
    prisma: PrismaClient;
    sessionId: string;
    difficulty: "easy" | "medium" | "hard";
    returnUrl: string;
    meta: Prisma.InputJsonValue;
}) {
    return args.prisma.practiceSession.update({
        where: { id: args.sessionId },
        data: {
            difficulty: args.difficulty,
            returnUrl: args.returnUrl,
            meta: args.meta,
        },
        select: { id: true },
    });
}

export async function createTrialSession(args: {
    prisma: PrismaClient;
    userId: string | null;
    guestId: string | null;
    sectionId: string;
    moduleId: string | null;
    difficulty: "easy" | "medium" | "hard";
    returnUrl: string;
    meta: Prisma.InputJsonValue;
}) {
    return args.prisma.practiceSession.create({
        data: {
            userId: args.userId,
            guestId: args.userId ? null : args.guestId,
            status: "active",
            mode: "onboarding_trial",
            preferPurpose: "quiz",
            sectionId: args.sectionId,
            moduleId: args.moduleId,
            difficulty: args.difficulty,
            targetCount: 3,
            returnUrl: args.returnUrl,
            meta: args.meta,
        },
        select: { id: true },
    });
}
