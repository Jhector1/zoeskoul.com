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

    const mod = await getResolvedReviewModule(subjectSlug, moduleSlug);

    const canUnlockAll = false;

    return <ReviewModulePageClient canUnlockAll={canUnlockAll} mod={mod} />;
}