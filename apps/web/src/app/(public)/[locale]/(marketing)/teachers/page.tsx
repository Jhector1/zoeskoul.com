import type { Metadata } from "next";
    import { buildMetadata } from "@/lib/seo/buildMetadata";
    import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
    import type { AppLocale } from "@/lib/seo/types";
    import { getMarketingPageCopy } from "@/lib/marketing/publicLandingContent";
    import PublicMarketingPage from "@/components/marketing/PublicMarketingPage";

    type Props = { params: Promise<{ locale: string }> };

    export async function generateMetadata({ params }: Props): Promise<Metadata> {
      const { locale } = await params;
      const l = locale as AppLocale;
      const seo = await getRouteSeo(l, "teachers");
const shared = await getSharedSeo(l);
return buildMetadata({
  locale: l,
  path: "/teachers",
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

    export default async function Page({ params }: Props) {
      const { locale } = await params;
      const l = locale as AppLocale;
      const copy = getMarketingPageCopy(l, "teachers");
      return <PublicMarketingPage locale={l} copy={copy} path="/teachers" />;
    }
