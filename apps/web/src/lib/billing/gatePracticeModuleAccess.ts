// src/lib/billing/gatePracticeModuleAccess.ts
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { checkModuleAccess } from "@/lib/access/moduleAccessServer";
import { buildBillingHref, safeInternalPath } from "@/lib/billing/moduleAccess";
import type { Actor } from "@/lib/practice/actor";

export async function gatePracticeModuleAccess(args: {
    prisma: PrismaClient;
    actor: Actor;
    locale: string;

    subject?: string | null;
    module?: string | null;
    sessionId?: string | null;

    returnUrl?: string | null;
    returnTo?: string | null;

    back?: string | null; // optional caller-provided
    bypass?: boolean;
}) {
    if (args.bypass) return { ok: true as const };

    let moduleSlug = args.module ?? null;
    let subjectSlug = args.subject ?? null;

    if (!moduleSlug && args.sessionId) {
        const sess = await args.prisma.practiceSession.findUnique({
            where: { id: args.sessionId },
            select: {
                module: { select: { slug: true, subject: { select: { slug: true } } } },
                section: { select: { subject: { select: { slug: true } } } },
            },
        });

        moduleSlug = sess?.module?.slug ?? null;
        subjectSlug =
            subjectSlug ??
            sess?.module?.subject?.slug ??
            sess?.section?.subject?.slug ??
            null;
    }

    if (!moduleSlug) return { ok: true as const };

    const decision = await checkModuleAccess(args.prisma, {
        actor: args.actor,
        subjectSlug,
        moduleSlug,
    });

    if (decision.ok) return { ok: true as const };

    const resolvedSubject = decision.subjectSlug ?? subjectSlug ?? "";

    // where to return AFTER subscribing
    const defaultNext =
        `/${encodeURIComponent(args.locale)}/subjects/${encodeURIComponent(resolvedSubject)}` +
        `/modules/${encodeURIComponent(moduleSlug)}/practice`;

    // ✅ IMPORTANT: only use returnUrl/returnTo if provided
    const nextPath =
        (args.returnUrl ? safeInternalPath(args.returnUrl) : null) ??
        (args.returnTo ? safeInternalPath(args.returnTo) : null) ??
        defaultNext;

    // safe back (NOT paywalled)
    const defaultBack =
        `/${encodeURIComponent(args.locale)}/subjects/${encodeURIComponent(resolvedSubject)}/modules`;

    const backPath =
        (args.back ? safeInternalPath(args.back) : null) ??
        defaultBack;

    const billingHref = buildBillingHref({
        locale: args.locale,
        next: nextPath,
        back: backPath,
        reason: "module",
        subject: resolvedSubject || undefined,
        module: moduleSlug,
    });

    return {
        ok: false as const,
        res: NextResponse.json(
            {
                message:
                    decision.reason === "requires_login"
                        ? "Sign in to subscribe and unlock this module."
                        : "This module requires payment.",
                paywall: true,
                reason: "module",
                redirectTo: billingHref,
                subject: resolvedSubject || null,
                module: moduleSlug,
            },
            { status: 402 },
        ),
    };
}