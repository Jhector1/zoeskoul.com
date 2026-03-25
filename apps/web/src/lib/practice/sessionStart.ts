import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
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

    const existing = await prisma.practiceSession.findFirst({
        where: {
            ...findWhere,
            ...ownerWhere,
        },
        orderBy,
        select,
    });

    if (existing) {
        if (resumeData && Object.keys(resumeData).length > 0) {
            await prisma.practiceSession.update({
                where: { id: (existing as any).id },
                data: resumeData,
            });
        }

        return {
            session: existing,
            resumed: true as const,
        };
    }

    const created = await prisma.practiceSession.create({
        data: {
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
}