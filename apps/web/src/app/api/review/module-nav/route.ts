import { prisma } from "@/lib/prisma";
import {
    attachGuestCookie,
    ensureGuestId,
    getActor,
} from "@/lib/practice/actor";
import {
    bodyJsonResponse,
    bodyJsonWithGuestCookie,
} from "@/lib/practice/api/shared/http";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { getLocaleFromCookie } from "@/serverUtils";
import {resolveReviewModuleForSubject} from "@/lib/review/api/shared/modules";
// import { resolveReviewModuleForSubject } from "@/lib/review/api/modules";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleRef = (searchParams.get("moduleId") ?? "").trim();

    if (!subjectSlug || !moduleRef) {
        return bodyJsonResponse(
            {
                message: "Missing subjectSlug/moduleId.",
            },
            400,
        );
    }

    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);
    const locale = await getLocaleFromCookie();

    // 1) Resolve current subject/module WITHOUT billing gate.
    //    We only need canonical module slug + subject ownership to compute nav.
    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true, slug: true },
    });

    if (!subject) {
        return bodyJsonWithGuestCookie(
            {
                message: "Unknown subjectSlug.",
                detail: { subjectSlug },
            },
            404,
            setGuestId,
        );
    }

    const current = await prisma.practiceModule.findFirst({
        where: {
            subjectId: subject.id,
            OR: [{ id: moduleRef }, { slug: moduleRef }],
        },
        select: {
            id: true,
            slug: true,
        },
    });

    if (!current) {
        return bodyJsonWithGuestCookie(
            {
                message: "Unknown module for subject.",
                detail: { subjectSlug, moduleRef },
            },
            404,
            setGuestId,
        );
    }

    // 2) Resolve review-registry order for this subject/module.
    const resolved = await resolveReviewModuleForSubject(prisma, {
        subjectSlug: subject.slug,
        moduleSlug: current.slug,
    });

    if (!resolved.ok) {
        return bodyJsonWithGuestCookie(
            {
                message: resolved.message,
                detail: resolved.detail,
            },
            resolved.statusCode,
            setGuestId,
        );
    }

    const prev =
        resolved.index > 0 ? resolved.modules[resolved.index - 1] : null;

    const next =
        resolved.index < resolved.modules.length - 1
            ? resolved.modules[resolved.index + 1]
            : null;

    // 3) Billing only affects the next CTA state, not whether nav exists.
    let nextLocked = false;

    if (next) {
        const nextAccess = await resolvePracticeAccess({
            prisma,
            actor,
            locale,
            req,
            params: {
                subject: subject.slug,
                module: next.slug,
                sessionId: null,
                returnUrl: null,
                returnTo: null,
            },
            session: null,
        });

        nextLocked = !nextAccess.ok;
    }

    return bodyJsonWithGuestCookie(
        {
            index: resolved.index,
            total: resolved.modules.length,
            prevModuleId: prev?.slug ?? null,
            nextModuleId: next?.slug ?? null,
            nextLocked,
        },
        200,
        setGuestId,
    );
}