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
import { buildBillingHref } from "@/lib/billing/moduleAccess";

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

    const publishedSlugs = new Set(runtime.publishedModules.map((module) => module.slug));
    const visibleModules = resolved.modules.filter((module) => publishedSlugs.has(module.slug));

    const visibleIndex = visibleModules.findIndex(
        (module) => module.slug === resolved.module.slug,
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

    const modules = await Promise.all(
        visibleModules.map(async (module, index) => {
            const current = module.slug === resolved.module.slug;

            if (current) {
                return {
                    slug: module.slug,
                    title: module.title,
                    order: module.order,
                    index,
                    current: true,
                    locked: false,
                    billingHref: null,
                };
            }

            const access = await resolvePracticeAccess({
                prisma,
                actor,
                locale,
                req,
                params: {
                    subject: subject.slug,
                    module: module.slug,
                    sessionId: null,
                    returnUrl: null,
                    returnTo: null,
                },
                session: null,
            });

            const locked = !access.ok;
            const moduleHref = buildModuleLearnHref({
                locale,
                catalogSlug,
                subjectSlug: subject.slug,
                moduleSlug: module.slug,
            });

            return {
                slug: module.slug,
                title: module.title,
                order: module.order,
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
                        module: module.slug,
                    })
                    : null,
            };
        }),
    );

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
        },
        200,
        setGuestId,
    );
}
