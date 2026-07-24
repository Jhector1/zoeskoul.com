import "server-only";

import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import { SUBJECT_CATALOG_SLUGS } from "@/lib/subjects/catalogs.generated";
import { hasReviewModule } from "@/lib/subjects/registry";
import { getSubjectPublicationState } from "@/lib/subjects/server/subjectPublication";
import { getResolvedReviewModule } from "@/lib/subjects/server/resolveSubjectPresentation";
import { prisma } from "@/lib/prisma";
import { checkSubjectAudienceAccess } from "@/lib/access/subjectAudienceAccess";
import { canViewAssignedCourseSolutions } from "@/lib/learningAssignments/assignedCourseSolutionAccess";
import { redactReviewModuleSolutions } from "@/lib/learningAssignments/redactReviewModuleSolutions";
import {
    resolveReviewModulePageData,
    type ReviewModulePageData,
} from "./reviewModulePageData";
import { enforceModuleAccessOrRedirect } from "@/lib/billing/enforceModuleAccessOrRedirect";

export type { ReviewModulePageData } from "./reviewModulePageData";

export async function loadReviewModulePageData(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    nextPath?: string;
}): Promise<ReviewModulePageData> {
    const { subjectSlug, moduleSlug, locale } = args;
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

    if (publication.isAvailable || canUnlockAll) {
        await enforceModuleAccessOrRedirect({
            prisma,
            actor: { userId, guestId: null },
            bypass: canUnlockAll,
            locale,
            subjectSlug,
            moduleSlug,
            nextPath:
                args.nextPath ??
                `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(subjectSlug)}/modules/${encodeURIComponent(moduleSlug)}/learn`,
        });
    }

    let audienceAvailable = true;
    let canViewSolutions = true;

    if (
        !canUnlockAll &&
        publication.subjectId &&
        publication.visibility &&
        publication.visibility !== "public"
    ) {
        const audienceAccess = await checkSubjectAudienceAccess(prisma, {
            actor: { userId, guestId: null },
            subjectId: publication.subjectId,
            visibility: publication.visibility,
        });
        audienceAvailable = audienceAccess.ok;

        if (audienceAvailable && userId) {
            canViewSolutions = await canViewAssignedCourseSolutions(prisma, {
                userId,
                subjectId: publication.subjectId,
                subjectSlug,
                locale,
            });
        } else {
            canViewSolutions = false;
        }
    }

    return resolveReviewModulePageData({
        subjectSlug,
        moduleSlug,
        catalogSlug: SUBJECT_CATALOG_SLUGS[subjectSlug] ?? null,
        canUnlockAll,
        isAvailable: publication.isAvailable && audienceAvailable,
        moduleExists: hasReviewModule(subjectSlug, moduleSlug),
        resolveModule: async () => {
            const module = await getResolvedReviewModule(subjectSlug, moduleSlug);
            return module && !canViewSolutions
                ? redactReviewModuleSolutions(module)
                : module;
        },
    });
}
