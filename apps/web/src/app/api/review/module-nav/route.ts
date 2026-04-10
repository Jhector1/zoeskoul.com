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
import { resolveSubjectRuntimeWindow } from "@/lib/review/api/shared/resolveSubjectFinishState";
import { SUBJECTS } from "@/lib/subjects";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleSlug =
        (searchParams.get("moduleSlug") ?? searchParams.get("moduleId") ?? "").trim();

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

    const runtime = await resolveSubjectRuntimeWindow({
        subjectSlug: subject.slug,
    });

    if (!runtime.ok) {
        return bodyJsonWithGuestCookie(
            {
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
                message: "Module is not published yet.",
                detail: {
                    subjectSlug: subject.slug,
                    moduleSlug,
                },
            },
            404,
            setGuestId,
        );
    }

    const prev =
        visibleIndex > 0 ? visibleModules[visibleIndex - 1] : null;

    const next =
        visibleIndex < visibleModules.length - 1
            ? visibleModules[visibleIndex + 1]
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
            index: visibleIndex,
            total: visibleModules.length,
            prevModuleId: prev?.slug ?? null,
            nextModuleId: next?.slug ?? null,
            nextLocked,
        },
        200,
        setGuestId,
    );
}