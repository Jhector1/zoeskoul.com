import { prisma } from "@/lib/prisma";
import {
    attachGuestCookie,
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
import { resolveReviewAccess } from "@/lib/review/api/access/resolveReviewAccess";
// import { ReviewProgressWriteSchema } from "@/lib/review/api/progress/schema";
import { pickLocale } from "@/lib/review/api/shared/schemas";
import { hasReviewModule } from "@/lib/subjects/registry";
import { getLocaleFromCookie } from "@/serverUtils";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";
import {ReviewProgressWriteSchema} from "@/lib/review/api/progress/schemas";

async function gateReviewModule(args: {
    req: Request;
    subjectSlug: string;
    moduleRef: string;
}) {
    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);
    const locale = await getLocaleFromCookie();

    const gate = await resolveReviewAccess({
        prisma,
        actor,
        locale,
        req: args.req,
        subjectSlug: args.subjectSlug,
        moduleRef: args.moduleRef,
    });

    return { actor, setGuestId, gate };
}

function reviewRegistryMissingResponse(
    subjectSlug: string,
    moduleSlug: string,
    setGuestId?: string | null,
) {
    return bodyJsonWithGuestCookie(
        {
            message: "Module not found in review registry for this subject.",
            detail: { subjectSlug, moduleSlug },
        },
        404,
        setGuestId,
    );
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleRef = (searchParams.get("moduleId") ?? "").trim();
    const locale = pickLocale(searchParams.get("locale"), "en");

    if (!subjectSlug || !moduleRef) {
        return bodyJsonResponse({ message: "Missing subjectSlug/moduleId." }, 400);
    }

    const { actor, setGuestId, gate } = await gateReviewModule({
        req,
        subjectSlug,
        moduleRef,
    });

    if (!gate.ok) {
        return attachGuestCookie(gate.res as any, setGuestId);
    }

    if (!hasReviewModule(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
        return reviewRegistryMissingResponse(
            gate.scope.subjectSlug,
            gate.scope.moduleSlug,
            setGuestId,
        );
    }

    const actorKey = actorKeyOf(actor);

    const row = await prisma.reviewProgress.findUnique({
        where: {
            actorKey_subjectSlug_moduleId_locale: {
                actorKey,
                subjectSlug: gate.scope.subjectSlug,
                moduleId: gate.scope.moduleSlug,
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
    const moduleRef = parsed.data.moduleRef;
    const locale = pickLocale(parsed.data.locale, "en");
    const state = parsed.data.state;

    const { actor, setGuestId, gate } = await gateReviewModule({
        req,
        subjectSlug,
        moduleRef,
    });

    if (!gate.ok) {
        return attachGuestCookie(gate.res as any, setGuestId);
    }

    if (!hasReviewModule(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
        return reviewRegistryMissingResponse(
            gate.scope.subjectSlug,
            gate.scope.moduleSlug,
            setGuestId,
        );
    }

    const actorKey = actorKeyOf(actor);

    const saved = await prisma.reviewProgress.upsert({
        where: {
            actorKey_subjectSlug_moduleId_locale: {
                actorKey,
                subjectSlug: gate.scope.subjectSlug,
                moduleId: gate.scope.moduleSlug,
                locale,
            },
        },
        create: {
            actorKey,
            subjectSlug: gate.scope.subjectSlug,
            moduleId: gate.scope.moduleSlug,
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
    const moduleRef = (searchParams.get("moduleId") ?? "").trim();
    const locale = pickLocale(searchParams.get("locale"), "en");

    if (!subjectSlug || !moduleRef) {
        return bodyJsonResponse({ message: "Missing subjectSlug/moduleId." }, 400);
    }

    const { actor, setGuestId, gate } = await gateReviewModule({
        req,
        subjectSlug,
        moduleRef,
    });

    if (!gate.ok) {
        return attachGuestCookie(gate.res as any, setGuestId);
    }

    if (!hasReviewModule(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
        return reviewRegistryMissingResponse(
            gate.scope.subjectSlug,
            gate.scope.moduleSlug,
            setGuestId,
        );
    }

    const actorKey = actorKeyOf(actor);

    await prisma.$transaction([
        prisma.reviewProgress.deleteMany({
            where: {
                actorKey,
                subjectSlug: gate.scope.subjectSlug,
                moduleId: gate.scope.moduleSlug,
                locale,
            },
        }),
        prisma.reviewQuizInstance.deleteMany({
            where: {
                actorKey,
                AND: [
                    { quizKey: { startsWith: "review-quiz|" } },
                    { quizKey: { contains: `|subject=${gate.scope.subjectSlug}|` } },
                    { quizKey: { contains: `|module=${gate.scope.moduleSlug}|` } },
                ],
            },
        }),
    ]);

    return bodyJsonWithGuestCookie({ ok: true }, 200, setGuestId);
}