import { prisma } from "@/lib/prisma";
import {
    actorKeyOf,
    ensureGuestId,
    getActor,
} from "@/lib/practice/actor";
import {
    bodyJsonResponse,
    bodyJsonWithGuestCookie,
    enforceSameOriginPost,
    readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { pickLocale } from "@/lib/review/api/shared/schemas";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";
import { ReviewProgressWriteSchema } from "@/lib/review/api/progress/schemas";
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";

async function resolveReviewProgressScope(args: {
    subjectSlug: string;
    moduleSlug: string;
}) {
    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);

    const resolved = await resolveReviewModuleForSubject(prisma, {
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
    });

    return { actor, setGuestId, resolved };
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleSlug = (searchParams.get("moduleSlug") ?? searchParams.get("moduleId") ?? "").trim();    const locale = pickLocale(searchParams.get("locale"), "en");

    if (!subjectSlug || !moduleSlug) {
        return bodyJsonResponse({ message: "Missing subjectSlug/moduleId." }, 400);
    }

    const { actor, setGuestId, resolved } = await resolveReviewProgressScope({
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

    const actorKey = actorKeyOf(actor);

    const row = await prisma.reviewProgress.findUnique({
        where: {
            actorKey_subjectSlug_moduleId_locale: {
                actorKey,
                subjectSlug,
                moduleId: resolved.module.slug,
                locale,
            },
        },
    });

    return bodyJsonWithGuestCookie(
        {
            progress: (row?.state ?? null) as ReviewProgressState | null,
        },
        200,
        setGuestId,
    );
}

export async function POST(req: Request) {
    return PUT(req);
}

export async function PUT(req: Request) {
    if (!enforceSameOriginPost(req)) {
        return bodyJsonResponse({ message: "Forbidden." }, 403);
    }

    const body = await readJsonSafe(req);
    if (!body) {
        return bodyJsonResponse({ message: "Invalid JSON body." }, 400);
    }

    const parsed = ReviewProgressWriteSchema.safeParse(body);
    if (!parsed.success) {
        return bodyJsonResponse(
            {
                message: "Invalid body.",
                issues: parsed.error.issues,
            },
            400,
        );
    }

    const subjectSlug = parsed.data.subjectSlug;
    const moduleSlug = parsed.data.moduleRef;
    const locale = pickLocale(parsed.data.locale, "en");
    const state = parsed.data.state;

    const { actor, setGuestId, resolved } = await resolveReviewProgressScope({
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

    const actorKey = actorKeyOf(actor);

    const saved = await prisma.reviewProgress.upsert({
        where: {
            actorKey_subjectSlug_moduleId_locale: {
                actorKey,
                subjectSlug,
                moduleId: resolved.module.slug,
                locale,
            },
        },
        create: {
            actorKey,
            subjectSlug,
            moduleId: resolved.module.slug,
            locale,
            state,
        },
        update: {
            state,
        },
        select: {
            id: true,
            updatedAt: true,
        },
    });

    return bodyJsonWithGuestCookie(
        {
            ok: true,
            saved,
        },
        200,
        setGuestId,
    );
}

export async function DELETE(req: Request) {
    if (!enforceSameOriginPost(req)) {
        return bodyJsonResponse({ message: "Forbidden." }, 403);
    }

    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleSlug =
        (searchParams.get("moduleSlug") ?? searchParams.get("moduleId") ?? "").trim();    const locale = pickLocale(searchParams.get("locale"), "en");

    if (!subjectSlug || !moduleSlug) {
        return bodyJsonResponse({ message: "Missing subjectSlug/moduleId." }, 400);
    }

    const { actor, setGuestId, resolved } = await resolveReviewProgressScope({
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

    const actorKey = actorKeyOf(actor);

    await prisma.$transaction([
        prisma.reviewProgress.deleteMany({
            where: {
                actorKey,
                subjectSlug,
                moduleId: resolved.module.slug,
                locale,
            },
        }),
        prisma.reviewQuizInstance.deleteMany({
            where: {
                actorKey,
                AND: [
                    { quizKey: { startsWith: "review-quiz|" } },
                    { quizKey: { contains: `|subject=${subjectSlug}|` } },
                    { quizKey: { contains: `|module=${resolved.module.slug}|` } },
                ],
            },
        }),
    ]);

    return bodyJsonWithGuestCookie({ ok: true }, 200, setGuestId);
}