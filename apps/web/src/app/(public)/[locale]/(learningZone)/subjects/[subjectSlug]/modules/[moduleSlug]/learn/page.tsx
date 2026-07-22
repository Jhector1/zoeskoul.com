import { notFound, redirect } from "next/navigation";
import ReviewModulePageClient from "./ReviewModulePageClient";
import { loadReviewModulePageData } from "./loadReviewModulePageData";
import {
    buildDefaultReviewRouteTarget,
    buildReviewRoutePath,
} from "@/components/review/module/runtime/reviewRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
                                       params,
                                   }: {
    params: Promise<{ locale: string; subjectSlug: string; moduleSlug: string }>;
}) {
    const { locale, subjectSlug, moduleSlug } = await params;
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

    const { mod, canUnlockAll, catalogSlug } = pageData;

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
