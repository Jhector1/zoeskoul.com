import { FeatureKey } from "@zoeskoul/db";
import type { PrismaClient } from "@/lib/prisma";
import { Actor, actorKeyOf } from "@/lib/practice/actor";
import { getAssignedSubjectIdsForUser } from "@/lib/learningAssignments/assignmentAccessServer";
import { resolveActorRoleCapabilities } from "@/lib/access/roleCapabilitiesServer";

function isWithinWindow(now: Date, startsAt?: Date | null, endsAt?: Date | null) {
    if (startsAt && startsAt > now) return false;
    if (endsAt && endsAt <= now) return false;
    return true;
}

export type AccessSnapshot = {
    actorKey: string;
    hasUser: boolean;
    isSubscribed: boolean;
    subjectAccess: Set<string>;
    moduleAccess: Set<string>;
    featureAccess: Set<FeatureKey>;
};

export async function getAccessSnapshot(
    prisma: PrismaClient,
    actor: Actor,
    args?: {
        subjectIds?: string[];
        moduleIds?: string[];
        featureKeys?: FeatureKey[];
    },
): Promise<AccessSnapshot> {
    const now = new Date();
    const actorKey = actorKeyOf(actor);
    const hasUser = Boolean(actor.userId);

    let isSubscribed = false;
    let canUnlockAll = false;

    if (actor.userId) {
        const [sub, capabilities] = await Promise.all([
            prisma.subscription.findFirst({
                where: {
                    userId: actor.userId,
                    status: { in: ["active", "trialing"] },
                },
                select: {
                    currentPeriodEnd: true,
                    status: true,
                },
                orderBy: {
                    updatedAt: "desc",
                },
            }),
            resolveActorRoleCapabilities(prisma, actor),
        ]);

        canUnlockAll = capabilities.canUnlockAll;
        isSubscribed = capabilities.canBypassBilling;

        if (sub && (!sub.currentPeriodEnd || sub.currentPeriodEnd > now)) {
            isSubscribed = true;
        }
    }

    const subjectAccess = new Set<string>();
    const moduleAccess = new Set<string>();
    const featureAccess = new Set<FeatureKey>();

    const subjectIds = args?.subjectIds?.length ? args.subjectIds : null;
    if (subjectIds) {
        if (canUnlockAll) {
            for (const subjectId of subjectIds) subjectAccess.add(subjectId);
        }

        const grants = await prisma.subjectAccessGrant.findMany({
            where: {
                actorKey,
                subjectId: { in: subjectIds },
                revokedAt: null,
            },
            select: {
                subjectId: true,
                startsAt: true,
                endsAt: true,
            },
        });

        for (const g of grants) {
            if (isWithinWindow(now, g.startsAt, g.endsAt)) {
                subjectAccess.add(g.subjectId);
            }
        }

        if (actor.userId) {
            const assignedSubjectIds = await getAssignedSubjectIdsForUser(prisma, {
                userId: actor.userId,
                subjectIds,
                now,
            });
            for (const subjectId of assignedSubjectIds) {
                subjectAccess.add(subjectId);
            }
        }
    }

    const moduleIds = args?.moduleIds?.length ? args.moduleIds : null;
    if (moduleIds) {
        if (canUnlockAll) {
            for (const moduleId of moduleIds) moduleAccess.add(moduleId);
        }

        const grants = await prisma.moduleAccessGrant.findMany({
            where: {
                actorKey,
                moduleId: { in: moduleIds },
                revokedAt: null,
            },
            select: {
                moduleId: true,
                startsAt: true,
                endsAt: true,
            },
        });

        for (const g of grants) {
            if (isWithinWindow(now, g.startsAt, g.endsAt)) {
                moduleAccess.add(g.moduleId);
            }
        }
    }

    const featureKeys = args?.featureKeys?.length ? args.featureKeys : null;
    if (featureKeys) {
        const grants = await prisma.featureGrant.findMany({
            where: {
                actorKey,
                feature: { in: featureKeys },
                revokedAt: null,
            },
            select: {
                feature: true,
                startsAt: true,
                endsAt: true,
            },
        });

        for (const g of grants) {
            if (isWithinWindow(now, g.startsAt, g.endsAt)) {
                featureAccess.add(g.feature);
            }
        }
    }

    return {
        actorKey,
        hasUser,
        isSubscribed,
        subjectAccess,
        moduleAccess,
        featureAccess,
    };
}
