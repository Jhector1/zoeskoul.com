import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import CatalogSubjectGridClient from "./CatalogSubjectGridClient";

import {ROUTES} from "@/utils";
import {getAvailableVisibleCatalogForActor} from "@/lib/subjects/server/catalogVisibility";

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
    const catalog = await getAvailableVisibleCatalogForActor(catalogSlug);

    if (!catalog) {
        notFound();
    }

    const subjects = catalog.subjects;
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
