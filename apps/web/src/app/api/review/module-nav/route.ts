import { prisma } from "@/lib/prisma";
import {
    actorKeyOf,
    ensureGuestId,
    getActor,
} from "@/lib/practice/actor";
import {
    bodyJsonResponse,
    bodyJsonWithGuestCookie,
} from "@/lib/practice/api/shared/http";
import { getLocaleFromCookie } from "@/serverUtils";
import { resolveReviewModuleForSubject } from "@/lib/review/api/shared/modules";
import { resolveSubjectRuntimeWindow } from "@/lib/review/api/shared/resolveSubjectFinishState";
import { SUBJECT_ARTIFACTS, SUBJECTS } from "@/lib/subjects";
import { buildBillingHref } from "@zoeskoul/learner-ui/lib/billing/moduleAccess";
import { loadSubscriberModulePracticeProgress } from "@/lib/practice/experience/subscriberPracticeSessions.server";
import { getAccessSnapshot } from "@/lib/access/accessSnapshot";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";

function cleanSegment(value: string | null | undefined, fallback = "") {
    const normalized = String(value ?? "").trim();
    return encodeURIComponent(normalized || fallback);
}

function buildModuleLearnHref(args: {
    locale: string;
    catalogSlug: string | null;
    subjectSlug: string;
    moduleSlug: string;
}) {
    const catalogPrefix = args.catalogSlug
        ? `/catalog/${cleanSegment(args.catalogSlug)}`
        : "";

    return (
        `/${cleanSegment(args.locale, "en")}` +
        catalogPrefix +
        `/subjects/${cleanSegment(args.subjectSlug)}` +
        `/modules/${cleanSegment(args.moduleSlug)}` +
        "/learn"
    );
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const moduleSlug =
        (searchParams.get("moduleSlug") ?? searchParams.get("moduleId") ?? "").trim();
    const catalogSlug = (searchParams.get("catalogSlug") ?? "").trim() || null;

    if (!subjectSlug || !moduleSlug) {
        return bodyJsonResponse(
            {
                message: "Missing subjectSlug/moduleId.",
            },
            400,
        );
    }

    const subject = SUBJECTS.find((item) => item.slug === subjectSlug);
    if (!subject) {
        return bodyJsonResponse(
            {
                message: "Unknown subjectSlug.",
                detail: { subjectSlug },
            },
            404,
        );
    }

    const [actor0, locale, resolved, runtime, accessSubject] = await Promise.all([
        getActor(),
        getLocaleFromCookie(),
        resolveReviewModuleForSubject(prisma, {
            subjectSlug,
            moduleSlug,
        }),
        resolveSubjectRuntimeWindow({
            subjectSlug,
        }),
        prisma.practiceSubject.findUnique({
            where: { slug: subjectSlug },
            select: {
                id: true,
                slug: true,
                accessPolicy: true as any,
                visibility: true,
                entitlementKey: true,
                modules: {
                    select: {
                        id: true,
                        slug: true,
                        accessOverride: true as any,
                        entitlementKey: true,
                    },
                },
            },
        }),
    ]);

    const { actor, setGuestId } = ensureGuestId(actor0);

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

    if (!runtime.ok) {
        return bodyJsonWithGuestCookie(
            {
                message: runtime.message,
            },
            runtime.statusCode,
            setGuestId,
        );
    }

    if (!accessSubject) {
        return bodyJsonWithGuestCookie(
            {
                message: "Subject access configuration is unavailable.",
            },
            404,
            setGuestId,
        );
    }

    const publishedSlugs = new Set(runtime.publishedModules.map((item) => item.slug));
    const visibleModules = resolved.modules.filter((item) => publishedSlugs.has(item.slug));
    const visibleIndex = visibleModules.findIndex(
        (item) => item.slug === resolved.module.slug,
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

    const currentHref = buildModuleLearnHref({
        locale,
        catalogSlug,
        subjectSlug: subject.slug,
        moduleSlug: resolved.module.slug,
    });

    const accessModulesBySlug = new Map(
        accessSubject.modules.map((item) => [item.slug, item]),
    );
    const visibleAccessModuleIds = visibleModules.flatMap((item) => {
        const accessModule = accessModulesBySlug.get(item.slug);
        return accessModule ? [accessModule.id] : [];
    });

    const actorKey = actorKeyOf(actor);
    const [snapshot, practiceProgress, reviewProgressRows] = await Promise.all([
        getAccessSnapshot(prisma, actor, {
            subjectIds: [accessSubject.id],
            moduleIds: visibleAccessModuleIds,
        }),
        loadSubscriberModulePracticeProgress({
            userId: actor.userId ?? null,
            subjectSlug: subject.slug,
            moduleSlug: resolved.module.slug,
        }),
        prisma.reviewProgress.findMany({
            where: {
                actorKey,
                subjectSlug: subject.slug,
                moduleId: { in: visibleModules.map((item) => item.slug) },
                locale,
            },
            select: {
                moduleId: true,
                state: true,
            },
        }),
    ]);

    const reviewProgressByModuleSlug = new Map(
        reviewProgressRows.map((row) => [row.moduleId, row.state as any]),
    );
    const topicCountByModuleSlug = new Map<string, number>();
    for (const topic of SUBJECT_ARTIFACTS.topics) {
        if (topic.subjectSlug !== subject.slug) continue;
        topicCountByModuleSlug.set(
            topic.moduleSlug,
            (topicCountByModuleSlug.get(topic.moduleSlug) ?? 0) + 1,
        );
    }

    const progressPctForModule = (targetModuleSlug: string) => {
        const state = reviewProgressByModuleSlug.get(targetModuleSlug);
        const totalTopics = topicCountByModuleSlug.get(targetModuleSlug) ?? 0;
        if (state?.moduleCompleted === true) return 1;
        if (totalTopics <= 0) return 0;

        const completedTopics = Object.values(state?.topics ?? {}).filter(
            (topic: any) => topic?.completed === true,
        ).length;
        return Math.max(0, Math.min(1, completedTopics / totalTopics));
    };

    const requireAll = process.env.BILLING_REQUIRE_ALL_MODULES === "1";
    const subjectAccessConfig = {
        id: accessSubject.id,
        slug: accessSubject.slug,
        accessPolicy: accessSubject.accessPolicy,
        visibility: accessSubject.visibility,
        entitlementKey: accessSubject.entitlementKey ?? null,
    };

    const modules = visibleModules.map((item, index) => {
        const current = item.slug === resolved.module.slug;

        if (current) {
            return {
                slug: item.slug,
                title: item.title,
                order: item.order,
                index,
                current: true,
                locked: false,
                billingHref: null,
                progressPct: progressPctForModule(item.slug),
            };
        }

        const accessModule = accessModulesBySlug.get(item.slug);
        const access = accessModule
            ? resolveModuleAccess({
                subject: subjectAccessConfig,
                module: {
                    id: accessModule.id,
                    slug: accessModule.slug,
                    accessOverride: accessModule.accessOverride,
                    entitlementKey: accessModule.entitlementKey ?? null,
                },
                snapshot,
                requireAll,
            })
            : { ok: false as const };

        const locked = !access.ok;
        const moduleHref = buildModuleLearnHref({
            locale,
            catalogSlug,
            subjectSlug: subject.slug,
            moduleSlug: item.slug,
        });

        return {
            slug: item.slug,
            title: item.title,
            order: item.order,
            index,
            current: false,
            locked,
            billingHref: locked
                ? buildBillingHref({
                    locale,
                    next: moduleHref,
                    back: currentHref,
                    reason: "module",
                    subject: subject.slug,
                    module: item.slug,
                })
                : null,
            progressPct: progressPctForModule(item.slug),
        };
    });

    const prev = visibleIndex > 0 ? modules[visibleIndex - 1] : null;
    const next = visibleIndex < modules.length - 1 ? modules[visibleIndex + 1] : null;

    return bodyJsonWithGuestCookie(
        {
            index: visibleIndex,
            total: modules.length,
            prevModuleId: prev?.slug ?? null,
            nextModuleId: next?.slug ?? null,
            nextLocked: Boolean(next?.locked),
            nextBillingHref: next?.billingHref ?? null,
            modules,
            practiceProgress,
        },
        200,
        setGuestId,
    );
}
