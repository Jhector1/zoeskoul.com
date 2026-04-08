import { prisma } from "@/lib/prisma";
import {
    ensureGuestId,
    getActor,
} from "@/lib/practice/actor";
import {
    bodyJsonResponse,
    bodyJsonWithGuestCookie,
} from "@/lib/practice/api/shared/http";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";
import { getLocaleFromCookie } from "@/serverUtils";
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";
import { SUBJECTS } from "@/lib/subjects";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleSlug = (searchParams.get("moduleSlug") ?? searchParams.get("moduleId") ?? "").trim();
    if (!subjectSlug || !moduleSlug) {
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

    const subject = SUBJECTS.find((s) => s.slug === subjectSlug);

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

    const resolved = await resolveReviewModuleForSubject(prisma, {
        subjectSlug,
        moduleSlug,
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