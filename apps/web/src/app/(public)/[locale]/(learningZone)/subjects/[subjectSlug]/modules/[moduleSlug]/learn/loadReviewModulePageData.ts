import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import {
    getResolvedCatalogMap,
    getResolvedReviewModule,
} from "@/lib/subjects/server/resolveSubjectPresentation";

export async function loadReviewModulePageData(args: {
    subjectSlug: string;
    moduleSlug: string;
}) {
    const { subjectSlug, moduleSlug } = args;
    const session = await auth();
    const sessionUser: any = (session as any)?.user ?? null;
    const userId: string | null = sessionUser?.id ?? null;
    const email: string | null = sessionUser?.email ?? null;

    const mod = await getResolvedReviewModule(subjectSlug, moduleSlug);
    const catalogs = await getResolvedCatalogMap();
    const catalogSlug =
        Object.values(catalogs).find((catalog) =>
            catalog.subjects.some((subject) => subject.slug === subjectSlug),
        )?.slug ?? null;
    const { canUnlockAll } = await resolvePrivilegedLearningAccess({
        userId,
        email,
    });

    return {
        mod,
        catalogSlug,
        canUnlockAll,
    };
}
