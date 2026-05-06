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
import type { ReviewProgressState, ReviewTopicProgress } from "@/lib/review/progressTypes";
import {
    mergeTopicProgressStates,
    normalizeProgressTopics,
    normalizeTopicProgressKey,
} from "@/lib/review/progressTopicKeys";
import { ReviewProgressWriteSchema } from "@/lib/review/api/progress/schemas";
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";
import { awardReviewProgressGamification } from "@/lib/gamification/awardReviewProgressGamification";

const REVIEW_PROGRESS_DEBUG = process.env.REVIEW_PROGRESS_DEBUG === "true";

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

function getSaveRevision(state: any) {
    const n = Number(state?.__saveRevision ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function stateBytes(state: any) {
    try {
        return JSON.stringify(state ?? null).length;
    } catch {
        return 0;
    }
}

function reviewProgressDebug(message: string, data: Record<string, unknown>) {
    if (!REVIEW_PROGRESS_DEBUG) return;
    console.log(message, data);
}

function timeMs(value: unknown) {
    const n = Number(new Date(String(value ?? "")));
    return Number.isFinite(n) ? n : 0;
}

function pickLatestIso(a: unknown, b: unknown) {
    const aMs = timeMs(a);
    const bMs = timeMs(b);
    if (!aMs && !bMs) return undefined;
    return bMs >= aMs ? (b as string | undefined) : (a as string | undefined);
}

function mergeReviewProgressForSave(args: {
    previousState: ReviewProgressState | null;
    incomingState: ReviewProgressState;
    saveRevision: number;
}) {
    const previous = normalizeProgressTopics(args.previousState ?? {});
    const incoming = normalizeProgressTopics(args.incomingState ?? {});
    const nextTopics: Record<string, ReviewTopicProgress> = {
        ...(previous.topics ?? {}),
    };

    for (const [topicKey, incomingTopic] of Object.entries(incoming.topics ?? {})) {
        const normalizedTopicKey = normalizeTopicProgressKey(topicKey);
        const previousTopic = nextTopics[normalizedTopicKey];
        const mergedTopic = mergeTopicProgressStates(previousTopic, incomingTopic);

        if (previousTopic?.completed || incomingTopic?.completed) {
            mergedTopic.completed = true;
        }

        mergedTopic.completedAt = pickLatestIso(
            previousTopic?.completedAt,
            incomingTopic?.completedAt,
        );

        nextTopics[normalizedTopicKey] = mergedTopic;
    }

    return {
        ...previous,
        ...incoming,
        quizVersion: Math.max(Number(previous.quizVersion ?? 0), Number(incoming.quizVersion ?? 0)),
        moduleCompleted: Boolean(previous.moduleCompleted || incoming.moduleCompleted),
        moduleCompletedAt: pickLatestIso(previous.moduleCompletedAt, incoming.moduleCompletedAt),
        activeTopicId: normalizeTopicProgressKey(incoming.activeTopicId ?? previous.activeTopicId),
        assignmentSessionId: incoming.assignmentSessionId ?? previous.assignmentSessionId,
        topics: nextTopics,
        __saveRevision: args.saveRevision,
    } as ReviewProgressState & { __saveRevision: number };
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

    reviewProgressDebug("[review-progress-debug] load", {
        subjectSlug,
        moduleId: resolved.module.slug,
        locale,
        hasState: Boolean(state),
        saveRevision: getSaveRevision(state),
        stateBytes: stateBytes(state),
    });

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
    const existingRevision = getSaveRevision(previousState);
    const incomingRevision = getSaveRevision(state);

    if (previous && incomingRevision < existingRevision) {
        reviewProgressDebug("[review-progress-debug] stale-save", {
            subjectSlug,
            moduleId: resolved.module.slug,
            locale,
            incomingRevision,
            existingRevision,
        });

        return bodyJsonWithGuestCookie(
            {
                ok: true,
                ignored: true,
                reason: "stale_revision",
                incomingRevision,
                existingRevision,
            },
            200,
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
        },
    });

    reviewProgressDebug("[review-progress-debug] save", {
        subjectSlug,
        moduleId: resolved.module.slug,
        locale,
        incomingRevision,
        saveRevision: getSaveRevision(stateToPersist),
        stateBytes: stateBytes(stateToPersist),
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
