// src/lib/billing/enforceModuleAccessOrRedirect.ts
import "server-only";
import { redirect } from "next/navigation";
import type { PrismaClient } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/access/moduleAccessServer";
import { buildBillingHref } from "@/lib/billing/moduleAccess";
import type { Actor } from "@/lib/practice/actor";
import { describeModuleAccessDenial } from "@/lib/access/moduleAccessDenial";

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

    const denial = describeModuleAccessDenial(decision);
    if (denial.kind === "assignment") {
        redirect(`/${encodeURIComponent(args.locale)}/assignments`);
    }
    if (denial.kind === "auth") {
        redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(args.nextPath)}`);
    }

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
