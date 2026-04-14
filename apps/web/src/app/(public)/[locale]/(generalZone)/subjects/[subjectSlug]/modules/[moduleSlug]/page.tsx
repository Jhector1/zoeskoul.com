import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

    const [sectionsCount, topicsCount, manifestView] = await Promise.all([
        prisma.practiceSection.count({ where: { moduleId: moduleDb.id } }),
        prisma.practiceTopic.count({ where: { moduleId: moduleDb.id } }),
        getResolvedModuleIntroFromManifest(subjectSlug, moduleSlug),
    ]);

    if (!manifestView) notFound();

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