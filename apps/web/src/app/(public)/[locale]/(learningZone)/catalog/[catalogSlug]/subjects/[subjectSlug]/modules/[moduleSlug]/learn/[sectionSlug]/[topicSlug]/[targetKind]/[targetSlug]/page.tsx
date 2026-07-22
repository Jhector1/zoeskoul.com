import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadReviewModulePageData } from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import {
    buildDefaultReviewRouteTarget,
    buildReviewRoutePath,
    resolveReviewRouteTarget,
} from "@/components/review/module/runtime/reviewRoute";
import { notFound, redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

function searchParamIsTrue(
    searchParams: PageSearchParams,
    key: string,
) {
    const value = searchParams[key];

    if (Array.isArray(value)) {
        return value.includes("1") || value.includes("true");
    }

    return value === "1" || value === "true";
}

function allowE2eUnlockAll(searchParams: PageSearchParams) {
    /**
     * E2E-only escape hatch for tests that are not testing progressive locking.
     * The progressive-lock behavior has its own dedicated tests.
     */
    if (process.env.E2E_ALLOW_DEV_ROUTES !== "1") {
        return false;
    }

    return searchParamIsTrue(searchParams, "e2eUnlockAll");
}

function appendSearchParams(pathname: string, searchParams: PageSearchParams) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams)) {
        if (Array.isArray(value)) {
            for (const item of value) query.append(key, item);
        } else if (typeof value === "string") {
            query.set(key, value);
        }
    }

    const serialized = query.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
}

export default async function Page({
                                       params,
                                       searchParams,
                                   }: {
    params: Promise<{
        locale: string;
        catalogSlug: string;
        subjectSlug: string;
        moduleSlug: string;
        sectionSlug: string;
        topicSlug: string;
        targetKind: string;
        targetSlug: string;
    }>;
    searchParams?: Promise<PageSearchParams>;
}) {
    const {
        locale,
        catalogSlug,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicSlug,
        targetKind,
        targetSlug,
    } = await params;

    const resolvedSearchParams = (await searchParams) ?? {};

    const pageData = await loadReviewModulePageData({
        subjectSlug,
        moduleSlug,
    });

    if (pageData.status === "missing") {
        return notFound();
    }

    if (pageData.status === "unavailable") {
        return (
            <ReviewModulePageClient
                canUnlockAll={pageData.canUnlockAll}
                mod={null}
                pageStatus="unavailable"
            />
        );
    }

    const { mod, canUnlockAll } = pageData;

    const requestedRoute = {
        sectionSlug,
        topicSlug,
        targetKind,
        targetSlug,
    };
    const resolvedTarget = resolveReviewRouteTarget({
        mod,
        subjectSlug,
        moduleSlug,
        route: requestedRoute,
    });
    const canonicalTarget = resolvedTarget ?? buildDefaultReviewRouteTarget(mod);

    if (canonicalTarget) {
        const routeIsCanonical =
            resolvedTarget !== null &&
            canonicalTarget.sectionSlug === sectionSlug &&
            canonicalTarget.topicSlug === topicSlug &&
            canonicalTarget.targetKind === targetKind &&
            canonicalTarget.targetSlug === targetSlug;

        if (!routeIsCanonical) {
            redirect(
                appendSearchParams(
                    buildReviewRoutePath({
                        locale,
                        catalogSlug,
                        subjectSlug,
                        moduleSlug,
                        target: canonicalTarget,
                    }),
                    resolvedSearchParams,
                ),
            );
        }
    }

    return (
        <ReviewModulePageClient
            canUnlockAll={canUnlockAll || allowE2eUnlockAll(resolvedSearchParams)}
            mod={mod}
            pageStatus="ready"
        />
    );
}
