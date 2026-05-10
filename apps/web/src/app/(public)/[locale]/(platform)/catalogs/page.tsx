import Image from "next/image";
import {Link} from "@/i18n/navigation";
import {getResolvedCatalogMap} from "@/lib/subjects/server/resolveSubjectPresentation";
import {cloudinaryImageUrl} from "@/lib/cloudinary/url";
import { ROUTES } from "@/utils";
import {
    selectVisibleSubjectsForActor,
    withSubjectEnrollment,
} from "@/lib/subjects/server/subjectVisibility";
export const runtime = "nodejs";

export default async function CatalogsPage() {
    const rawCatalogs = Object.values(await getResolvedCatalogMap()).filter(
        (catalog) => catalog.status !== "disabled",
    );

    const catalogs = (
        await Promise.all(
            rawCatalogs.map(async (catalog) => {
                const subjectsWithEnrollment = await withSubjectEnrollment(
                    catalog.subjects,
                );

                return {
                    ...catalog,
                    subjects: selectVisibleSubjectsForActor(subjectsWithEnrollment),
                };
            }),
        )
    ).filter((catalog) => catalog.subjects.length > 0);
    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
            <div className="ui-container py-6 sm:py-8 lg:py-10">
                <div className="grid gap-4">
                    <section className="ui-page-surface p-5 sm:p-6">
                        <div className="ui-kicker">Catalogs</div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                            Browse learning catalogs
                        </h1>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
                            Catalogs group related courses together, so Python can hold beginner,
                            intermediate, and advanced tracks without changing how courses,
                            modules, and topics work underneath.
                        </p>
                    </section>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {catalogs.map((catalog) => {

                            const courseCount = catalog.subjects.length;
                            return (

                                <Link
                                    key={catalog.slug}
                                    href={ROUTES.catalogDetail(encodeURIComponent(catalog.slug))}
                                    className="ui-page-surface block overflow-hidden p-0 transition-colors hover:border-neutral-300 dark:hover:border-white/15"
                                >
                                    <div
                                        className="relative h-40 border-b border-neutral-200 dark:border-white/10 sm:h-44">
                                        {catalog.imagePublicId ? (
                                            <>
                                                <Image
                                                    src={cloudinaryImageUrl(catalog.imagePublicId, {
                                                        w: 1400,
                                                        h: 760,
                                                        crop: "fill",
                                                        gravity: "auto",
                                                        quality: "auto",
                                                        format: "auto",
                                                        dpr: "auto",
                                                    }) ?? "/subjects/_default.png"}
                                                    alt={catalog.imageAlt ?? catalog.title}
                                                    fill
                                                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                                                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                />
                                                <div
                                                    className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/12 to-transparent"/>
                                            </>
                                        ) : (
                                            <div
                                                className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
                                                <div
                                                    className="absolute inset-0 opacity-[0.22] [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.7),transparent_28%),radial-gradient(circle_at_60%_70%,rgba(255,255,255,0.55),transparent_34%)]"/>
                                            </div>
                                        )}

                                        <div
                                            className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                                            <div
                                                className="inline-flex rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                                                Catalog
                                            </div>
                                            <div
                                                className="rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                                                {courseCount} course
                                                {courseCount === 1 ? "" : "s"}
                                            </div>
                                        </div>

                                        <div className="absolute inset-x-4 bottom-4">
                                            <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                                {catalog.title}
                                            </h2>
                                        </div>
                                    </div>

                                    <div className="p-5">
                                        <p className="text-sm leading-6 text-neutral-600 dark:text-white/68">
                                            {catalog.description}
                                        </p>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {catalog.subjects.slice(0, 3).map((subject) => (
                                                <span
                                                    key={subject.slug}
                                                    className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 dark:bg-white/[0.06] dark:text-white/75"
                                                >
                                                {subject.title}
                                            </span>
                                            ))}
                                        </div>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
