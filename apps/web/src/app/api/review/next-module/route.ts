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
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";
import { resolveSubjectRuntimeWindow } from "@/lib/review/api/shared/resolveSubjectFinishState";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleSlug =
        (searchParams.get("moduleSlug") ?? searchParams.get("moduleId") ?? "").trim();

    if (!subjectSlug || !moduleSlug) {
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
        moduleSlug,
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

    const runtime = await resolveSubjectRuntimeWindow({
        subjectSlug: gate.scope.subjectSlug,
    });

    if (!runtime.ok) {
        return bodyJsonWithGuestCookie(
            {
                nextModuleId: null,
                message: runtime.message,
            },
            runtime.statusCode,
            setGuestId,
        );
    }

    const visibleModules = resolved.modules.filter((m) =>
        runtime.publishedModules.some((pm) => pm.slug === m.slug),
    );

    const visibleIndex = visibleModules.findIndex(
        (m) => m.slug === resolved.module.slug,
    );

    if (visibleIndex < 0) {
        return bodyJsonWithGuestCookie(
            {
                nextModuleId: null,
                message: "Module is not published yet.",
            },
            404,
            setGuestId,
        );
    }

    const next =
        visibleIndex < visibleModules.length - 1
            ? visibleModules[visibleIndex + 1]
            : null;

    return bodyJsonWithGuestCookie(
        {
            nextModuleId: next?.slug ?? null,
        },
        200,
        setGuestId,
    );
}