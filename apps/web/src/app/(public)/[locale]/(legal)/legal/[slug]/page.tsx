import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    LEGAL_DOCUMENTS,
    LEGAL_DOCS_BY_SLUG,
    LEGAL_VALUES,
    type LegalSlug,
} from "@/lib/legal/content";
import { AppLocale } from "@/lib/seo/types";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import LegalDocClient from "@/components/legal/LegalDocClient";

type PageProps = {
    params: Promise<{
        locale: string;
        slug: LegalSlug;
    }>;
};

export async function generateStaticParams() {
    return LEGAL_DOCUMENTS.map((doc) => ({
        slug: doc.slug,
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, slug } = await params;
    const l = locale as AppLocale;

    const doc = LEGAL_DOCS_BY_SLUG[slug];
    if (!doc) return { title: "Legal" };

    const seo = await getRouteSeo(l, slug);
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

export default async function LegalDocPage({ params }: PageProps) {
    const { slug } = await params;
    const doc = LEGAL_DOCS_BY_SLUG[slug];

    if (!doc) notFound();

    return <LegalDocClient doc={doc} values={LEGAL_VALUES} />;
}