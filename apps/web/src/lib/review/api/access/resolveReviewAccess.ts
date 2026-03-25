
// src/lib/review/api/access/resolveReviewAccess.ts

import "server-only";

import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/practice/actor";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { bodyJsonResponse } from "@/lib/practice/api/shared/http";

export type ReviewAccessResolved =
    | {
    ok: true;
    mode: "standard";
    bypassBilling: false;
    scope: {
        subjectId: string;
        subjectSlug: string;
        moduleId: string;
        moduleSlug: string;
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
    moduleRef: string; // slug or id
}): Promise<ReviewAccessResolved> {
    const { prisma, actor, locale, req, subjectSlug, moduleRef } = args;

    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true, slug: true },
    });

    if (!subject) {
        return {
            ok: false,
            res: bodyJsonResponse(
                {
                    message: "Unknown subjectSlug.",
                    detail: { subjectSlug },
                },
                404,
            ),
        };
    }

    const mod = await prisma.practiceModule.findFirst({
        where: {
            subjectId: subject.id,
            OR: [{ id: moduleRef }, { slug: moduleRef }],
        },
        select: {
            id: true,
            slug: true,
        },
    });

    if (!mod) {
        return {
            ok: false,
            res: bodyJsonResponse(
                {
                    message: "Unknown module for subject.",
                    detail: { subjectSlug, moduleRef },
                },
                404,
            ),
        };
    }

    const access = await resolvePracticeAccess({
        prisma,
        actor,
        locale,
        req,
        params: {
            subject: subject.slug,
            module: mod.slug,
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

    return {
        ok: true,
        mode: "standard",
        bypassBilling: false,
        scope: {
            subjectId: subject.id,
            subjectSlug: subject.slug,
            moduleId: mod.id,
            moduleSlug: mod.slug,
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