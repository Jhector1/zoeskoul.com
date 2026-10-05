import { prisma } from "@/lib/prisma";
import {
    actorKeyOf,
    ensureGuestId,
    getActor,
} from "@/lib/practice/actor";
import {
    bodyJsonResponse as baseBodyJsonResponse,
    bodyJsonWithGuestCookie as baseBodyJsonWithGuestCookie,
} from "@/lib/practice/api/shared/http";
import {
    applyAppCorsHeaders,
    isAppOriginAllowed,
} from "@/lib/http/appCors";
import { pickLocale } from "@/lib/review/api/shared/schemas";
import { loadReviewModulesForSubject } from "@/lib/review/api/shared/modules";

const MAX_MODULES = 100;

function jsonResponse(request: Request, data: unknown, status = 200) {
    return applyAppCorsHeaders(
        request,
        baseBodyJsonResponse(data, status),
    );
}

function jsonWithGuestCookie(
    request: Request,
    data: unknown,
    status: number,
    setGuestId?: string,
) {
    return applyAppCorsHeaders(
        request,
        baseBodyJsonWithGuestCookie(data, status, setGuestId),
    );
}

export async function GET(req: Request) {
    if (!isAppOriginAllowed(req)) {
        return jsonResponse(req, { message: "Forbidden." }, 403);
    }

    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const locale = pickLocale(searchParams.get("locale"), "en");
    const moduleSlugs = Array.from(
        new Set(
            (searchParams.get("moduleSlugs") ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    );

    if (!subjectSlug || moduleSlugs.length === 0) {
        return jsonResponse(
            req,
            { message: "Missing subjectSlug/moduleSlugs." },
            400,
        );
    }

    if (moduleSlugs.length > MAX_MODULES) {
        return jsonResponse(
            req,
            { message: `Too many modules. Maximum is ${MAX_MODULES}.` },
            400,
        );
    }

    const [actor0, loaded] = await Promise.all([
        getActor(),
        loadReviewModulesForSubject(prisma, subjectSlug),
    ]);
    const { actor, setGuestId } = ensureGuestId(actor0);

    if (!loaded) {
        return jsonWithGuestCookie(
            req,
            { message: "Unknown subjectSlug." },
            404,
            setGuestId,
        );
    }

    const knownModuleSlugs = new Set(loaded.modules.map((module) => module.slug));
    const unknown = moduleSlugs.filter((moduleSlug) => !knownModuleSlugs.has(moduleSlug));

    if (unknown.length > 0) {
        return jsonWithGuestCookie(
            req,
            {
                message: "One or more modules are not registered for this subject.",
                detail: { unknown },
            },
            404,
            setGuestId,
        );
    }

    const actorKey = actorKeyOf(actor);
    const rows = await prisma.reviewProgress.findMany({
        where: {
            actorKey,
            subjectSlug,
            moduleId: { in: moduleSlugs },
            locale,
        },
        select: {
            moduleId: true,
            state: true,
        },
    });

    const progressByModuleId: Record<string, unknown> = Object.fromEntries(
        moduleSlugs.map((moduleSlug) => [moduleSlug, null]),
    );

    for (const row of rows) {
        progressByModuleId[row.moduleId] = row.state ?? null;
    }

    return jsonWithGuestCookie(
        req,
        { progressByModuleId },
        200,
        setGuestId,
    );
}
