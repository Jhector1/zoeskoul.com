import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import { getResolvedReviewModule } from "@/lib/subjects/server/resolveSubjectPresentation";
import ReviewModulePageClient from "./ReviewModulePageClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
                                       params,
                                   }: {
    params: Promise<{ locale: string; subjectSlug: string; moduleSlug: string }>;
}) {
    const { subjectSlug, moduleSlug } = await params;
    const session = await auth();
    const sessionUser: any = (session as any)?.user ?? null;
    const userId: string | null = sessionUser?.id ?? null;
    const email: string | null = sessionUser?.email ?? null;

    const mod = await getResolvedReviewModule(subjectSlug, moduleSlug);
    const { canUnlockAll } = await resolvePrivilegedLearningAccess({
        userId,
        email,
    });

    return <ReviewModulePageClient canUnlockAll={canUnlockAll} mod={mod} />;
}
