import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadReviewModulePageData } from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import { resolveReviewRouteTarget } from "@/components/review/module/runtime/reviewRoute";
import { notFound } from "next/navigation";

export const runtime = "nodejs";

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
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicSlug,
        targetKind,
        targetSlug,
    } = await params;

    const resolvedSearchParams = (await searchParams) ?? {};

    const { mod, canUnlockAll } = await loadReviewModulePageData({
        subjectSlug,
        moduleSlug,
    });

    if (!mod) {
        notFound();
    }

    const target = resolveReviewRouteTarget({
        mod,
        subjectSlug,
        moduleSlug,
        route: {
            sectionSlug,
            topicSlug,
            targetKind,
            targetSlug,
        },
    });

    if (
        !target ||
        target.sectionSlug !== sectionSlug ||
        target.topicSlug !== topicSlug ||
        target.targetKind !== targetKind ||
        target.targetSlug !== targetSlug
    ) {
        // Keep current behavior: let the client shell handle canonicalization.
    }

    return (
        <ReviewModulePageClient
            canUnlockAll={canUnlockAll || allowE2eUnlockAll(resolvedSearchParams)}
            mod={mod}
        />
    );
}