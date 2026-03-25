import SandboxChooserClient from "./SandboxChooserClient";
import {Metadata} from "next";
import {AppLocale} from "@/lib/seo/types";
import {getRouteSeo, getSharedSeo} from "@/lib/seo/getSeo";
import {buildMetadata} from "@/lib/seo/buildMetadata";
export async function generateMetadata(
    { params }: { params: Promise<{ locale: string }> }
): Promise<Metadata> {
    const { locale } = await params;
    const l = locale as AppLocale;

    const seo = await getRouteSeo(l, "sandbox");
    const shared = await getSharedSeo(l);

    return buildMetadata({
        locale: l,
        path: "/sandbox",
        title: seo.title,
        description: seo.description,
        keywords: shared.keywords,
        ogTitle: seo.ogTitle,
        ogDescription: seo.ogDescription,
        twitterTitle: seo.twitterTitle,
        twitterDescription: seo.twitterDescription,
        imageAlt: shared.defaultOgAlt,
        noIndex: true
    });
}

export default async function SandboxPage({
                                              params,
                                          }: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    return (
        <div className="ui-container py-10">
            <SandboxChooserClient locale={locale} />
        </div>
    );
}