import { redirect } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadReviewModulePageData } from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import {
    buildDefaultReviewRouteTarget,
    buildReviewRoutePath,
} from "@/components/review/module/runtime/reviewRoute";

export const runtime = "nodejs";

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

    const { mod, canUnlockAll } = await loadReviewModulePageData({
        subjectSlug,
        moduleSlug,
    });

    if (!mod) {
        return <ReviewModulePageClient canUnlockAll={canUnlockAll} mod={mod} />;
    }

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

    return <ReviewModulePageClient canUnlockAll={canUnlockAll} mod={mod} />;
}
