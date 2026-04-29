import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import CatalogSubjectGridClient from "./CatalogSubjectGridClient";
import {
    getResolvedCatalogBySlug,
    getResolvedSubjectCardMap,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import { ROUTES } from "@/utils";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = {
    locale: string;
    catalogSlug: string;
};

export default async function CatalogDetailPage({
    params,
}: {
    params: Promise<Params>;
}) {
    const { catalogSlug } = await params;
    const catalog = await getResolvedCatalogBySlug(catalogSlug);

    if (!catalog || catalog.status === "disabled") {
        notFound();
    }

    const actor = await getActor();
    const actorKey =
        actor.userId || actor.guestId
            ? actorKeyOf({ userId: actor.userId ?? null, guestId: actor.guestId ?? null })
            : null;

    const subjectMap = await getResolvedSubjectCardMap();
    const subjectIdsBySlug = new Map(
        (
            await prisma.practiceSubject.findMany({
                where: {
                    slug: { in: catalog.subjects.map((subject) => subject.slug) },
                },
                select: { id: true, slug: true },
            })
        ).map((subject) => [subject.slug, subject.id] as const),
    );

    const enrolledIds = new Set<string>();

    if (actorKey && subjectIdsBySlug.size > 0) {
        const rows = await prisma.subjectEnrollment.findMany({
            where: {
                actorKey,
                subjectId: { in: Array.from(subjectIdsBySlug.values()) },
                status: { in: ["enrolled", "completed"] },
            },
            select: { subjectId: true },
        });

        rows.forEach((row) => enrolledIds.add(row.subjectId));
    }

    const subjects = catalog.subjects.map((subject) => {
        const view = subjectMap[subject.slug] ?? subject;
        const subjectId = subjectIdsBySlug.get(subject.slug);

        return {
            slug: subject.slug,
            title: view.title,
            description: view.description,
            defaultModuleSlug: view.defaultModuleSlug,
            imagePublicId: view.imagePublicId,
            imageAlt: view.imageAlt,
            enrolled: subjectId ? enrolledIds.has(subjectId) : false,
            status: subject.status,
        };
    });

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
            <div className="ui-container py-6 sm:py-8 lg:py-10">
                <div className="grid gap-4">
                    <section className="ui-page-surface p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-3">
                            <Link href={ROUTES.catalogs} className="ui-btn-secondary px-3">
                                Back to catalogs
                            </Link>
                            <Link href={ROUTES.catalog} className="ui-btn-secondary px-3">
                                My courses
                            </Link>
                            <div className="ui-kicker">{catalog.slug}</div>
                        </div>

                        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                            {catalog.title}
                        </h1>

                        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
                            {catalog.description}
                        </p>

                        <div className="mt-4 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-white/[0.06] dark:text-white/75">
                            Choosing a course here enrolls the user automatically.
                        </div>
                    </section>

                    <CatalogSubjectGridClient initialSubjects={subjects} />
                </div>
            </div>
        </div>
    );
}
