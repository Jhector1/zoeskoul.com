import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { LEGAL_INDEX, LEGAL_VALUES } from "@/lib/legal/content";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import { AppLocale } from "@/lib/seo/types";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import {resolveDeepTagged} from "@/i18n/resolveDeepTagged";
// import { resolveDeepTagged } from "@/lib/i18n/resolveDeepTagged";

type PageProps = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata(
    { params }: PageProps
): Promise<Metadata> {
    const { locale } = await params;
    const l = locale as AppLocale;

    const seo = await getRouteSeo(l, "legal-index");
    const shared = await getSharedSeo(l);

    return buildMetadata({
        locale: l,
        path: "/legal",
        title: seo.title,
        description: seo.description,
        keywords: shared.keywords,
        ogTitle: seo.ogTitle,
        ogDescription: seo.ogDescription,
        twitterTitle: seo.twitterTitle,
        twitterDescription: seo.twitterDescription,
        imageAlt: shared.defaultOgAlt,
        noIndex: false,
    });
}

export default async function LegalIndexPage({ params }: PageProps) {
    const { locale } = await params;
    const l = locale as AppLocale;

    const t = await getTranslations({ locale: l });

    const docs = resolveDeepTagged(
        LEGAL_INDEX,
        (key, values) => t(key, values),
        LEGAL_VALUES
    ) as Array<{
        slug: string;
        title: string;
        description: string;
        effectiveDate: string;
        lastUpdated: string;
    }>;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-sm leading-6 text-neutral-700 dark:text-white/70">
                    {t("LegalUi.indexIntro")}
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {docs.map((doc) => (
                    <Link
                        key={doc.slug}
                        href={`/legal/${doc.slug}`}
                        className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/20"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-black tracking-tight text-neutral-900 group-hover:text-neutral-700 dark:text-white dark:group-hover:text-white/85">
                                    {doc.title}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/65">
                                    {doc.description}
                                </p>
                            </div>

                            <span className="rounded-full border border-neutral-200 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500 dark:border-white/10 dark:text-white/50">
                {t("LegalUi.view")}
              </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-white/45">
              <span>
                {t("LegalUi.effective")}: {doc.effectiveDate}
              </span>
                            <span>
                {t("LegalUi.updated")}: {doc.lastUpdated}
              </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}