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
    exceedsContentLength,
    getClientIp,
    readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { pickLocale } from "@/lib/review/api/shared/schemas";
import type { ReviewProgressState } from "@/lib/review/progressTypes";
import {
    normalizeProgressTopics,
    normalizeTopicProgressKey,
} from "@/lib/review/progressTopicKeys";
import {
    getReviewProgressSaveRevision,
    mergeReviewProgressForSave,
    reviewProgressStateBytes,
} from "@/lib/review/api/progress/mergeProgressForSave";
import {
    REVIEW_PROGRESS_LIMITS,
    ReviewProgressWriteSchema,
} from "@/lib/review/api/progress/schemas";
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";
import { awardReviewProgressGamification } from "@/lib/gamification/awardReviewProgressGamification";
import { rateLimit } from "@/lib/security/ratelimit";

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
    const moduleSlug = (
        searchParams.get("moduleSlug") ??
        searchParams.get("moduleId") ??
        ""
    ).trim();
    const locale = pickLocale(searchParams.get("locale"), "en");

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

    const state = (row?.state ?? null) as ReviewProgressState | null;

    return bodyJsonWithGuestCookie(
        {
            progress: state,
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

    if (exceedsContentLength(req, REVIEW_PROGRESS_LIMITS.maxPayloadBytes)) {
        return bodyJsonResponse(
            {
                message: `Payload exceeds the ${REVIEW_PROGRESS_LIMITS.maxPayloadBytes} byte limit.`,
            },
            413,
        );
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
    const rateLimitActorKey = actorKey === "g:missing" ? getClientIp(req) : actorKey;

    try {
        const rl = await rateLimit(`review-progress:${rateLimitActorKey}`, {
            bucket: "review-progress-save",
            limit: 180,
            window: "60 s",
        });

        if (!rl.ok) {
            const res = bodyJsonWithGuestCookie(
                {
                    message: "Too many requests.",
                },
                429,
                setGuestId,
            );
            const retryAfter = Math.max(1, Math.ceil((rl.resetMs - Date.now()) / 1000));
            res.headers.set("Retry-After", String(retryAfter));
            return res;
        }
    } catch {
        return bodyJsonWithGuestCookie(
            {
                message: "Service unavailable.",
            },
            503,
            setGuestId,
        );
    }

    const previous = await prisma.reviewProgress.findUnique({
        where: {
            actorKey_subjectSlug_moduleId_locale: {
                actorKey,
                subjectSlug,
                moduleId: resolved.module.slug,
                locale,
            },
        },
        select: {
            state: true,
        },
    });

    const previousState = (previous?.state ?? null) as ReviewProgressState | null;
    const existingRevision = getReviewProgressSaveRevision(previousState);
    const incomingRevision = getReviewProgressSaveRevision(state);

    if (previous && incomingRevision < existingRevision) {
        console.warn("[review-progress] ignored stale save", {
            actorKey,
            subjectSlug,
            moduleId: resolved.module.slug,
            locale,
            incomingRevision,
            existingRevision,
            incomingBytes: reviewProgressStateBytes(state),
            existingBytes: reviewProgressStateBytes(previousState),
        });

        return bodyJsonWithGuestCookie(
            {
                ok: false,
                ignored: true,
                reason: "stale_revision",
                incomingRevision,
                existingRevision,
            },
            409,
            setGuestId,
        );
    }

    const nextRevision = Math.max(existingRevision + 1, incomingRevision, Date.now());
    const stateToPersist = mergeReviewProgressForSave({
        previousState,
        incomingState: state as ReviewProgressState,
        saveRevision: nextRevision,
    });

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
            state: stateToPersist,
        },
        update: {
            state: stateToPersist,
        },
        select: {
            id: true,
            updatedAt: true,
            state: true,
        },
    });

    let gamification = null;

    try {
        gamification = await awardReviewProgressGamification({
            prisma,
            actor,
            subjectSlug,
            moduleSlug: resolved.module.slug,
            previousState,
            nextState: stateToPersist,
        });
    } catch (e) {
        console.error("awardReviewProgressGamification failed", {
            actorKey,
            subjectSlug,
            moduleSlug: resolved.module.slug,
            error: e,
        });
    }

    return bodyJsonWithGuestCookie(
        {
            ok: true,
            saved,
            state: saved.state,
            gamification,
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
    const moduleSlug = (
        searchParams.get("moduleSlug") ??
        searchParams.get("moduleId") ??
        ""
    ).trim();
    const locale = pickLocale(searchParams.get("locale"), "en");

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

    return bodyJsonWithGuestCookie(
        {
            ok: true,
        },
        200,
        setGuestId,
    );
}
