import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadReviewModulePageData } from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import { resolveReviewRouteTarget } from "@/components/review/module/runtime/reviewRoute";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function Page({
    params,
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

    const { mod, canUnlockAll } = await loadReviewModulePageData({
        subjectSlug,
        moduleSlug,
    });

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

    // If the route doesn't resolve to a valid target, we might want to redirect
    // to the default target for this module.
    if (
        !target ||
        target.sectionSlug !== sectionSlug ||
        target.topicSlug !== topicSlug ||
        target.targetKind !== targetKind ||
        target.targetSlug !== targetSlug
    ) {
        // Validation failed or canonicalized.
        // For now, let's just let the client shell handle it if target exists,
        // but it's better to ensure we are on a valid canonical path.
    }

    return <ReviewModulePageClient canUnlockAll={canUnlockAll} mod={mod} />;
}
