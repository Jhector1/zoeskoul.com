import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
    LEGAL_DOCS_BY_SLUG,
    LEGAL_VALUES,
    isLegalSlug,
} from "@/lib/legal/content";
import LegalDocClient from "@/components/legal/LegalDocClient";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import type { AppLocale, SeoRouteKey } from "@/lib/seo/types";

type Props = {
    params: Promise<{
        locale: string;
        slug: string;
    }>;
};

export async function generateMetadata(
    { params }: Props,
): Promise<Metadata> {
    const { locale, slug } = await params;

    if (!isLegalSlug(slug)) {
        notFound();
    }

    const l = locale as AppLocale;
    const seo = await getRouteSeo(l, slug as SeoRouteKey);
    const shared = await getSharedSeo(l);

    return buildMetadata({
        locale: l,
        path: `/legal/${slug}`,
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

export default async function LegalDocPage({ params }: Props) {
    const { locale: l, slug } = await params;

    setRequestLocale(l);

    if (!isLegalSlug(slug)) {
        notFound();
    }

    const doc = LEGAL_DOCS_BY_SLUG[slug];

    await getTranslations({ locale: l });

    return <LegalDocClient doc={doc} values={LEGAL_VALUES} />;
}