import { notFound, redirect } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadReviewModulePageData } from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import {
    buildDefaultReviewRouteTarget,
    buildReviewRoutePath,
} from "@/components/review/module/runtime/reviewRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
                                       params,
                                   }: {
    params: Promise<{
        locale: string;
        catalogSlug: string;
        subjectSlug: string;
        moduleSlug: string;
    }>;
}) {
    const {
        locale,
        catalogSlug,
        subjectSlug,
        moduleSlug,
    } = await params;

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

    const defaultTarget = buildDefaultReviewRouteTarget(mod);

    if (defaultTarget) {
        redirect(
            buildReviewRoutePath({
                locale,
                catalogSlug,
                subjectSlug,
                moduleSlug,
                target: defaultTarget,
            }),
        );
    }

    return (
        <ReviewModulePageClient
            canUnlockAll={canUnlockAll}
            mod={mod}
            pageStatus="ready"
        />
    );
}
