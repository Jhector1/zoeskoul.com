import { notFound, redirect } from "next/navigation";
import ReviewModulePageClient from "../../../../ReviewModulePageClient";
import { loadReviewModulePageData } from "../../../../loadReviewModulePageData";
import {
    buildDefaultReviewRouteTarget,
    buildReviewRoutePath,
    resolveReviewRouteTarget,
} from "@/components/review/module/runtime/reviewRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const pageData = await loadReviewModulePageData({
        subjectSlug,
        moduleSlug,
        locale,
        nextPath: [
            "",
            encodeURIComponent(locale),
            "subjects",
            encodeURIComponent(subjectSlug),
            "modules",
            encodeURIComponent(moduleSlug),
            "learn",
            encodeURIComponent(sectionSlug),
            encodeURIComponent(topicId),
            encodeURIComponent(targetKind),
            encodeURIComponent(targetSlug),
        ].join("/"),
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

    const target =
        resolveReviewRouteTarget({
            mod,
            subjectSlug,
            moduleSlug,
            route: {
                sectionSlug,
                topicId,
                targetKind,
                targetSlug,
            },
        }) ?? buildDefaultReviewRouteTarget(mod);

    if (target) {
        const routeIsCanonical =
            target.sectionSlug === sectionSlug &&
            target.topicSlug === topicId &&
            target.targetKind === targetKind &&
            target.targetSlug === targetSlug;

        if (catalogSlug || !routeIsCanonical) {
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

    return (
        <ReviewModulePageClient
            canUnlockAll={canUnlockAll}
            mod={mod}
            pageStatus="ready"
        />
    );
}
