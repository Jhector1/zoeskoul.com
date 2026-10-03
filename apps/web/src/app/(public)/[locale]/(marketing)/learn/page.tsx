import type { Metadata } from "next";
    import { Link } from "@/i18n/navigation";
    import { buildMetadata } from "@/lib/seo/buildMetadata";
    import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
    import type { AppLocale } from "@/lib/seo/types";
    import { getMarketingPageCopy, getLearningPathCopy, LEARNING_PATH_KEYS } from "@/lib/marketing/publicLandingContent";
    import PublicMarketingPage from "@/components/marketing/PublicMarketingPage";

    type Props = { params: Promise<{ locale: string }> };

    export async function generateMetadata({ params }: Props): Promise<Metadata> {
      const { locale } = await params;
      const l = locale as AppLocale;
      const seo = await getRouteSeo(l, "learn");
const shared = await getSharedSeo(l);
return buildMetadata({
  locale: l,
  path: "/learn",
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

    export default async function LearnPage({ params }: Props) {
      const { locale } = await params;
      const l = locale as AppLocale;
      const copy = getMarketingPageCopy(l, "learn");
      const paths = LEARNING_PATH_KEYS.map((key) => ({ key, copy: getLearningPathCopy(l, key) }));
      return (
        <PublicMarketingPage locale={l} copy={copy} path="/learn">
          <section className="mt-6">
            <h2 className="text-2xl font-semibold tracking-tight text-[rgb(var(--ui-text)/1)]">
              {locale === "fr" ? "Parcours populaires" : locale === "ht" ? "Chemen popilè" : "Popular learning paths"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {paths.map((item) => (
                <Link key={item.key} href={`/learn/${item.key}`} className="ui-page-surface border p-4 transition-colors hover:border-[rgb(var(--ui-border-strong)/1)]">
                  <h3 className="font-semibold text-[rgb(var(--ui-text)/1)]">{item.copy.title}</h3>
                  <p className="mt-2 text-sm leading-5 text-[rgb(var(--ui-text-muted)/0.9)]">{item.copy.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </PublicMarketingPage>
      );
    }
