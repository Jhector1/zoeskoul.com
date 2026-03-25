// src/lib/access/moduleAccessServer.ts
import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getAccessSnapshot } from "./accessSnapshot";
import { resolveModuleAccess } from "./resolveModuleAccess";
import {Actor} from "@/lib/practice/actor";

export async function checkModuleAccess(prisma: PrismaClient, args: {
    actor: Actor;
    subjectSlug?: string | null; // optional; we can derive from module relation
    moduleSlug: string;
    requireAll?: boolean;
}) {
    const mod = await prisma.practiceModule.findUnique({
        where: { slug: args.moduleSlug },
        select: {
            id: true,
            slug: true,
            accessOverride: true,
            entitlementKey: true,
            subject: {
                select: {
                    id: true,
                    slug: true,
                    accessPolicy: true,
                    entitlementKey: true,
                },
            },
        },
    });

    if (!mod) {
        return { ok: true as const, paid: false as const, subjectSlug: args.subjectSlug ?? null };
    }

    const subject = mod.subject ?? null;

    const snapshot = await getAccessSnapshot(prisma, args.actor, {
        subjectIds: subject ? [subject.id] : [],
        moduleIds: [mod.id],
    });

    const decision = resolveModuleAccess({
        subject: subject
            ? {
                id: subject.id,
                slug: subject.slug,
                accessPolicy: subject.accessPolicy as any,
                entitlementKey: subject.entitlementKey,
            }
            : null,
        module: {
            id: mod.id,
            slug: mod.slug,
            accessOverride: mod.accessOverride as any,
            entitlementKey: mod.entitlementKey,
        },
        snapshot,
        requireAll: args.requireAll ?? (process.env.BILLING_REQUIRE_ALL_MODULES === "1"),
    });

    return {
        ...decision,
        subjectSlug: (args.subjectSlug ?? subject?.slug ?? null),
        moduleSlug: mod.slug,
    };
}