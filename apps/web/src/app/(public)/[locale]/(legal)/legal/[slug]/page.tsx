import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
    LEGAL_DOCS_BY_SLUG,
    LEGAL_VALUES,
    isLegalSlug,
} from "@/lib/legal/content";
import LegalDocClient from "@/components/legal/LegalDocClient";

type Props = {
    params: Promise<{
        locale: string;
        slug: string;
    }>;
};

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