import { redirect } from "next/navigation";
import ReviewModulePageClient from "./ReviewModulePageClient";
import { loadReviewModulePageData } from "./loadReviewModulePageData";
import {
    buildDefaultReviewRouteTarget,
    buildReviewRoutePath,
} from "@/components/review/module/runtime/reviewRoute";

export const runtime = "nodejs";

export default async function Page({
                                       params,
                                   }: {
    params: Promise<{ locale: string; subjectSlug: string; moduleSlug: string }>;
}) {
    const { locale, subjectSlug, moduleSlug } = await params;
    const { mod, canUnlockAll, catalogSlug } = await loadReviewModulePageData({
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
