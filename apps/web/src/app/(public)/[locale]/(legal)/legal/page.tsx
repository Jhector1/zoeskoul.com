import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LEGAL_INDEX, LEGAL_VALUES } from "@/lib/legal/content";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import { AppLocale } from "@/lib/seo/types";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";

type PageProps = {
    params: Promise<{ locale: string }>;
};

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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

    setRequestLocale(l);

    const t = await getTranslations({ locale: l });

    const docs = resolveDeepTagged(
        LEGAL_INDEX,
        (key, values) => t(key, values),
        LEGAL_VALUES,
    ) as Array<{
        slug: string;
        title: string;
        description: string;
        effectiveDate: string;
        lastUpdated: string;
    }>;

    return (
        <div className="space-y-6">
            <div className="ui-page-surface p-4">
                <p className="text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)]">
                    {t("LegalUi.indexIntro")}
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {docs.map((doc) => (
                    <Link
                        key={doc.slug}
                        href={`/legal/${doc.slug}`}
                        className="ui-page-surface group p-5 transition-colors hover:border-[rgb(var(--ui-border-strong)/1)] hover:bg-[rgb(var(--ui-surface)/1)]"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="ui-title-sm text-[rgb(var(--ui-text)/0.96)] group-hover:text-[rgb(var(--ui-text)/0.9)]">
                                    {doc.title}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)]">
                                    {doc.description}
                                </p>
                            </div>

                            <span className="ui-pill-neutral">
                {t("LegalUi.view")}
              </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 ui-meta">
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