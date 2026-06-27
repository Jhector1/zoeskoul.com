import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import ModuleIntroClient from "./ModuleIntroClient";
import { getResolvedModuleIntroFromManifest } from "@/lib/subjects/server/resolveSubjectPresentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ModuleIntroPage({
                                                  params,
                                              }: {
    params: Promise<{ locale: string; subjectSlug: string; moduleSlug: string }>;
}) {
    const { locale, subjectSlug, moduleSlug } = await params;
    if (!subjectSlug || !moduleSlug) notFound();

    const moduleDb = await prisma.practiceModule.findFirst({
        where: {
            slug: moduleSlug,
            subject: { slug: subjectSlug },
        },
        select: {
            id: true,
            slug: true,
            order: true,
            weekStart: true,
            weekEnd: true,
        },
    });

    if (!moduleDb) notFound();

    const manifestView = await getResolvedModuleIntroFromManifest(subjectSlug, moduleSlug);

    if (!manifestView) notFound();

    const manifestSections = SUBJECT_ARTIFACTS.sections.filter(
        (s) => s.subjectSlug === subjectSlug && s.moduleSlug === moduleSlug,
    );
    const manifestTopicSlugs = new Set<string>();
    for (const section of manifestSections) {
        for (const topicSlug of section.topicSlugs) manifestTopicSlugs.add(topicSlug);
    }

    const sectionsCount = manifestSections.length;
    const topicsCount = manifestTopicSlugs.size;

    return (
        <ModuleIntroClient
            locale={locale}
            subject={{
                slug: manifestView.subject.slug,
                title: manifestView.subject.title,
                description: manifestView.subject.description || null,
                imagePublicId: manifestView.subject.imagePublicId ?? null,
                imageAlt: manifestView.subject.imageAlt ?? null,
            }}
            module={{
                id: moduleDb.id,
                slug: moduleDb.slug,
                title: manifestView.module.title,
                description: manifestView.module.description || null,
                order: moduleDb.order ?? manifestView.module.order ?? 0,
                weekStart: moduleDb.weekStart ?? manifestView.module.weekStart ?? null,
                weekEnd: moduleDb.weekEnd ?? manifestView.module.weekEnd ?? null,
                meta: {
                    estimatedMinutes: manifestView.module.meta.estimatedMinutes ?? undefined,
                    prereqs: manifestView.module.meta.prereqs ?? [],
                    outcomes: manifestView.module.meta.outcomes ?? [],
                    why: manifestView.module.meta.why ?? [],
                    videoUrl: manifestView.module.meta.videoUrl ?? undefined,
                },
            }}
            stats={{ sectionsCount, topicsCount }}
        />
    );
}