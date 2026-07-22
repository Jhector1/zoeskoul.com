import "server-only";

import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import { SUBJECT_CATALOG_SLUGS } from "@/lib/subjects/catalogs.generated";
import { hasReviewModule } from "@/lib/subjects/registry";
import { getSubjectPublicationState } from "@/lib/subjects/server/subjectPublication";
import { getResolvedReviewModule } from "@/lib/subjects/server/resolveSubjectPresentation";
import {
    resolveReviewModulePageData,
    type ReviewModulePageData,
} from "./reviewModulePageData";

export type { ReviewModulePageData } from "./reviewModulePageData";

export async function loadReviewModulePageData(args: {
    subjectSlug: string;
    moduleSlug: string;
}): Promise<ReviewModulePageData> {
    const { subjectSlug, moduleSlug } = args;
    const session = await auth();
    const sessionUser: any = (session as any)?.user ?? null;
    const userId: string | null = sessionUser?.id ?? null;
    const email: string | null = sessionUser?.email ?? null;

    const [{ canUnlockAll }, publication] = await Promise.all([
        resolvePrivilegedLearningAccess({
            userId,
            email,
        }),
        getSubjectPublicationState(subjectSlug),
    ]);

    return resolveReviewModulePageData({
        subjectSlug,
        moduleSlug,
        catalogSlug: SUBJECT_CATALOG_SLUGS[subjectSlug] ?? null,
        canUnlockAll,
        isAvailable: publication.isAvailable,
        moduleExists: hasReviewModule(subjectSlug, moduleSlug),
        resolveModule: () => getResolvedReviewModule(subjectSlug, moduleSlug),
    });
}
