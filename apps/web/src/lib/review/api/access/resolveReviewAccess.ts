// src/lib/review/api/access/resolveReviewAccess.ts
import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { bodyJsonResponse } from "@/lib/practice/api/shared/http";
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";

export type ReviewAccessResolved =
    | {
    ok: true;
    mode: "standard";
    bypassBilling: boolean;
    scope: {
        subjectSlug: string;
        moduleSlug: string;
        subjectDbId?: string | null;
        moduleDbId?: string | null;
    };
}
    | {
    ok: false;
    res: Response;
};

export async function resolveReviewAccess(args: {
    prisma: PrismaClient;
    actor: Actor;
    locale: string;
    req: Request;
    subjectSlug: string;
    moduleSlug: string;
}): Promise<ReviewAccessResolved> {
    const { prisma, actor, locale, req, subjectSlug, moduleSlug } = args;

    const resolved = await resolveReviewModuleForSubject(prisma, {
        subjectSlug,
        moduleSlug,
    });

    if (!resolved.ok) {
        return {
            ok: false,
            res: bodyJsonResponse(
                {
                    message: resolved.message,
                    detail: resolved.detail,
                },
                resolved.statusCode,
            ),
        };
    }

    const access = await resolvePracticeAccess({
        prisma,
        actor,
        locale,
        req,
        params: {
            subject: subjectSlug,
            module: resolved.module.slug,
            sessionId: null,
            returnUrl: null,
            returnTo: null,
        },
        session: null,
    });

    if (!access.ok) {
        return {
            ok: false,
            res: access.res,
        };
    }

    const [subjectRow, moduleRow] = await Promise.all([
        prisma.practiceSubject.findUnique({
            where: { slug: subjectSlug },
            select: { id: true },
        }),
        prisma.practiceModule.findUnique({
            where: { slug: resolved.module.slug },
            select: { id: true },
        }),
    ]);

    return {
        ok: true,
        mode: "standard",
        bypassBilling: access.bypassBilling,
        scope: {
            subjectSlug,
            moduleSlug: resolved.module.slug,
            subjectDbId: subjectRow?.id ?? null,
            moduleDbId: moduleRow?.id ?? null,
        },
    };
}

export function parseReviewQuizKey(quizKey: string): {
    subjectSlug: string | null;
    moduleSlug: string | null;
} {
    const parts = String(quizKey).split("|");
    let subjectSlug: string | null = null;
    let moduleSlug: string | null = null;

    for (const part of parts) {
        if (part.startsWith("subject=")) {
            subjectSlug = part.slice("subject=".length) || null;
            continue;
        }

        if (part.startsWith("module=")) {
            moduleSlug = part.slice("module=".length) || null;
        }
    }

    return { subjectSlug, moduleSlug };
}
