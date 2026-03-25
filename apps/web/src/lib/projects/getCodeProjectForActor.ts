import "server-only";

import type { PrismaClient } from "@prisma/client";
import { Actor, actorKeyOf } from "@/lib/practice/actor";

function isWithinWindow(now: Date, startsAt?: Date | null, endsAt?: Date | null) {
    if (startsAt && startsAt > now) return false;
    if (endsAt && endsAt <= now) return false;
    return true;
}

export async function getCodeProjectForActor(
    prisma: PrismaClient,
    args: {
        actor: Actor;
        projectId: string;
    },
) {
    const now = new Date();
    const actorKey = actorKeyOf(args.actor);

    const project = await prisma.codeProject.findUnique({
        where: { id: args.projectId },
        include: {
            grants: {
                where: {
                    actorKey,
                    revokedAt: null,
                },
                orderBy: {
                    updatedAt: "desc",
                },
            },
        },
    });

    if (!project) return null;

    if (args.actor.userId && project.ownerId === args.actor.userId) {
        return {
            project,
            role: "owner" as const,
        };
    }

    const validGrant = project.grants.find((g) =>
        isWithinWindow(now, g.startsAt, g.endsAt),
    );

    if (!validGrant) return null;

    return {
        project,
        role: validGrant.role,
    };
}