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
import { getLocaleFromCookie } from "@/serverUtils";
import { resolveReviewAccess } from "@/lib/review/api/access/resolveReviewAccess";
import {resolveReviewModuleForSubject} from "@/lib/review/api/shared/modules";
// import { resolveReviewModuleForSubject } from "@/lib/review/api/modules";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleRef = (searchParams.get("moduleId") ?? "").trim();

    if (!subjectSlug || !moduleRef) {
        return bodyJsonResponse(
            {
                nextModuleId: null,
                message: "Missing subjectSlug/moduleId.",
            },
            400,
        );
    }

    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);
    const locale = await getLocaleFromCookie();

    const gate = await resolveReviewAccess({
        prisma,
        actor,
        locale,
        req,
        subjectSlug,
        moduleRef,
    });

    if (!gate.ok) {
        return attachGuestCookie(gate.res as any, setGuestId);
    }

    const resolved = await resolveReviewModuleForSubject(prisma, {
        subjectSlug: gate.scope.subjectSlug,
        moduleSlug: gate.scope.moduleSlug,
    });

    if (!resolved.ok) {
        return bodyJsonWithGuestCookie(
            {
                nextModuleId: null,
                message: resolved.message,
                detail: resolved.detail,
            },
            resolved.statusCode,
            setGuestId,
        );
    }

    const next =
        resolved.index < resolved.modules.length - 1
            ? resolved.modules[resolved.index + 1]
            : null;

    return bodyJsonWithGuestCookie(
        {
            nextModuleId: next?.slug ?? null,
        },
        200,
        setGuestId,
    );
}