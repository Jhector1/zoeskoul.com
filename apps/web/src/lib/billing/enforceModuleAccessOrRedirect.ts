// src/lib/billing/enforceModuleAccessOrRedirect.ts
import "server-only";
import { redirect } from "next/navigation";
import type { PrismaClient } from "@prisma/client";
import { checkModuleAccess } from "@/lib/access/moduleAccessServer";
import { buildBillingHref } from "@/lib/billing/moduleAccess";
import type { Actor } from "@/lib/practice/actor";

export async function enforceModuleAccessOrRedirect(args: {
    prisma: PrismaClient;
    actor: Actor;
    bypass?: boolean;
    locale: string;
    subjectSlug: string;
    moduleSlug: string;
    nextPath: string;
}) {
    if (args.bypass) return;

    const decision = await checkModuleAccess(args.prisma, {
        actor: args.actor,
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
    });

    if (decision.ok) return;

    // ✅ SAFE back: modules list (never paywalled)
    const back =
        `/${encodeURIComponent(args.locale)}/subjects/${encodeURIComponent(args.subjectSlug)}/modules/${encodeURIComponent(args.moduleSlug)}/learn`;

    const billingHref = buildBillingHref({
        locale: args.locale,
        next: args.nextPath,
        back, // ✅ ADD THIS
        reason: "module",
        subject: args.subjectSlug,
        module: args.moduleSlug,
    });

    redirect(billingHref);
}