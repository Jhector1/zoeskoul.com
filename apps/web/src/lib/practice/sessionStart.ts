import "server-only";

import type { Prisma, PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";

export function ownerWhereForActor(actor: Actor): Prisma.PracticeSessionWhereInput | null {
    if (actor.userId) return { userId: actor.userId };
    if (actor.guestId) return { guestId: actor.guestId };
    return null;
}

type StartOrResumeArgs = {
    prisma: PrismaClient;
    actor: Actor;

    findWhere: Prisma.PracticeSessionWhereInput;
    createData: Prisma.PracticeSessionUncheckedCreateInput;
    resumeData?: Prisma.PracticeSessionUncheckedUpdateInput;

    select?: Prisma.PracticeSessionSelect;
    orderBy?: Prisma.PracticeSessionOrderByWithRelationInput;
};

function isUniqueConstraintError(error: unknown) {
    return String((error as any)?.code ?? "") === "P2002";
}

async function applyResumeData(args: {
    prisma: PrismaClient;
    session: any;
    resumeData?: Prisma.PracticeSessionUncheckedUpdateInput;
}) {
    if (!args.resumeData || Object.keys(args.resumeData).length === 0) return;

    await args.prisma.practiceSession.update({
        where: { id: args.session.id },
        data: args.resumeData,
    });
}

export async function startOrResumePracticeSession(args: StartOrResumeArgs) {
    const {
        prisma,
        actor,
        findWhere,
        createData,
        resumeData,
        select = { id: true },
        orderBy = { startedAt: "desc" },
    } = args;

    const ownerWhere = ownerWhereForActor(actor);
    if (!ownerWhere) {
        const err = new Error("Missing actor.");
        (err as any).status = 400;
        throw err;
    }

    const winnerWhere = {
        ...findWhere,
        ...ownerWhere,
    } satisfies Prisma.PracticeSessionWhereInput;

    const existing = await prisma.practiceSession.findFirst({
        where: winnerWhere,
        orderBy,
        select,
    });

    if (existing) {
        await applyResumeData({ prisma, session: existing, resumeData });
        return {
            session: existing,
            resumed: true as const,
        };
    }

    try {
        const created = await prisma.practiceSession.create({
            data: {
                mode: createData.mode ?? "standard",
                ...createData,
                userId: actor.userId ?? null,
                guestId: actor.userId ? null : actor.guestId ?? null,
            },
            select,
        });

        return {
            session: created,
            resumed: false as const,
        };
    } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;

        // Another request/tab can win after our initial read but before create.
        // Reload that canonical row instead of surfacing a false 500. If the
        // unique error came from an unrelated constraint, no winner will match
        // and the original error is preserved.
        const raced = await prisma.practiceSession.findFirst({
            where: winnerWhere,
            orderBy,
            select,
        });

        if (!raced) throw error;

        await applyResumeData({ prisma, session: raced, resumeData });
        return {
            session: raced,
            resumed: true as const,
        };
    }
}
