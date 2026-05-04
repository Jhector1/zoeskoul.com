import { redirect } from "next/navigation";
import ReviewModulePageClient from "../../../../ReviewModulePageClient";
import { loadReviewModulePageData } from "../../../../loadReviewModulePageData";
import {
    buildReviewRoutePath,
    resolveReviewRouteTarget,
} from "@/components/review/module/runtime/reviewRoute";

export const runtime = "nodejs";

export default async function Page({
    params,
}: {
    params: Promise<{
        locale: string;
        subjectSlug: string;
        moduleSlug: string;
        sectionSlug: string;
        topicId: string;
        targetKind: string;
        targetSlug: string;
    }>;
}) {
    const {
        locale,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        targetKind,
        targetSlug,
    } = await params;
    const { mod, canUnlockAll, catalogSlug } = await loadReviewModulePageData({
        subjectSlug,
        moduleSlug,
    });

    if (mod && catalogSlug) {
        const target = resolveReviewRouteTarget({
            mod,
            subjectSlug,
            moduleSlug,
            route: {
                sectionSlug,
                topicId,
                targetKind,
                targetSlug,
            },
        });

        if (target) {
            redirect(
                buildReviewRoutePath({
                    locale,
                    catalogSlug,
                    subjectSlug,
                    moduleSlug,
                    target,
                }),
            );
        }
    }

    return <ReviewModulePageClient canUnlockAll={canUnlockAll} mod={mod} />;
}
