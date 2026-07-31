import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cloudinaryImageUrl } from "@/lib/cloudinary/url";
import { ROUTES } from "@/utils";
import { getAvailableVisibleCatalogsForActor } from "@/lib/subjects/server/catalogVisibility";
import { resolveCatalogCourseStatusPresentation } from "@/lib/subjects/catalogCourseStatus";

export const runtime = "nodejs";

export default async function CatalogsPage() {
    const catalogs = await getAvailableVisibleCatalogsForActor();

    const totalSubjects = catalogs.reduce(
        (total, catalog) => total + catalog.subjects.length,
        0,
    );

    const isAdminView = catalogs.some(
        (catalog) => catalog.actorAccess.canSeeAllCatalogSubjects,
    );

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-[#0b0d12] dark:text-white">
            <main className="ui-container py-8 sm:py-10">
                <section className="mb-8 max-w-4xl">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="ui-kicker">Catalog library</div>

                        {isAdminView ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                                Admin: all public versions visible
                            </span>
                        ) : null}
                    </div>

                    <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                        Browse course catalogs
                    </h1>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/65 sm:text-base">
                        Catalogs group related courses together. A catalog can contain
                        current, legacy, draft, and upcoming course versions without
                        mixing up learner progress.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2 text-sm text-neutral-600 dark:text-white/55">
                        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                            {catalogs.length} catalog{catalogs.length === 1 ? "" : "s"}
                        </span>
                        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                            {totalSubjects} course{totalSubjects === 1 ? "" : "s"}
                        </span>
                        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                            Course versions
                        </span>
                    </div>
                </section>

                <section className="grid gap-3">
                    {catalogs.map((catalog) => {
                        const courseCount = catalog.subjects.length;
                        const previewSubjects = catalog.subjects.slice(0, 3);
                        const defaultSubject =
                            catalog.subjects.find(
                                (subject) => subject.slug === catalog.defaultSubjectSlug,
                            ) ?? catalog.subjects[0];

                        return (
                            <Link
                                key={catalog.slug}
                                href={ROUTES.catalogDetail(
                                    encodeURIComponent(catalog.slug),
                                )}
                                data-testid={`catalog-card-${catalog.slug}`}

                                className="group block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20 dark:hover:bg-white/[0.055]"
                            >
                                <article className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
                                    <div className="flex min-w-0 gap-4">
                                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.06]">
                                            {catalog.imagePublicId ? (
                                                <Image
                                                    src={
                                                        cloudinaryImageUrl(catalog.imagePublicId, {
                                                            w: 240,
                                                            h: 240,
                                                            crop: "fill",
                                                            gravity: "auto",
                                                            quality: "auto",
                                                            format: "auto",
                                                            dpr: "auto",
                                                        }) ?? "/subjects/_default.png"
                                                    }
                                                    alt={catalog.imageAlt ?? catalog.title}
                                                    fill
                                                    sizes="64px"
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-xl font-semibold">
                                                    {catalog.title.charAt(0)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="truncate text-lg font-semibold tracking-tight">
                                                    {catalog.title}
                                                </h2>

                                                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-white/[0.07] dark:text-white/60">
                                                    {courseCount} course{courseCount === 1 ? "" : "s"}
                                                </span>

                                                {catalog.actorAccess.canSeeAllCatalogSubjects ? (
                                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                                                        Admin view
                                                    </span>
                                                ) : null}
                                            </div>

                                            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/60">
                                                {catalog.description}
                                            </p>

                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-white/45">
                                                <span className="rounded-full bg-neutral-100 px-2.5 py-1 dark:bg-white/[0.06]">
                                                    {catalog.slug}
                                                </span>

                                                {defaultSubject ? (
                                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                                                        Recommended: {defaultSubject.title}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-black/20">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 dark:text-white/40">
                                                Courses
                                            </div>
                                            <div className="text-xs text-neutral-500 dark:text-white/40">
                                                View catalog →
                                            </div>
                                        </div>

                                        <div className="grid gap-1.5">
                                            {previewSubjects.map((subject) => {
                                                const statusPresentation =
                                                    resolveCatalogCourseStatusPresentation(subject);

                                                return (
                                                    <div
                                                        key={subject.slug}
                                                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm dark:bg-white/[0.04]"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="truncate font-medium">
                                                                {subject.title}
                                                            </div>
                                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-white/40">
                                                                <span>
                                                                    {statusPresentation.availabilityLabel}
                                                                </span>

                                                                {catalog.actorAccess.canSeeAllCatalogSubjects ? (
                                                                    <>
                                                                        <span>·</span>
                                                                        <span>
                                                                            {statusPresentation.lifecycleLabel ??
                                                                                (subject.versioning
                                                                                    ? "Active version"
                                                                                    : "Unversioned")}
                                                                        </span>
                                                                        <span>·</span>
                                                                        <span>
                                                                            {subject.availabilityStatus === "seeded"
                                                                                ? "Seeded"
                                                                                : "Not seeded"}
                                                                        </span>
                                                                    </>
                                                                ) : null}
                                                            </div>
                                                        </div>

                                                        {catalog.actorAccess.canSeeAllCatalogSubjects &&
                                                        subject.availabilityStatus === "unseeded" ? (
                                                            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">
                                                                Unseeded
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}

                                            {courseCount > previewSubjects.length ? (
                                                <div className="px-3 pt-1 text-xs text-neutral-500 dark:text-white/40">
                                                    +{courseCount - previewSubjects.length} more course
                                                    {courseCount - previewSubjects.length === 1 ? "" : "s"}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </article>
                            </Link>
                        );
                    })}
                </section>
            </main>
        </div>
    );
}