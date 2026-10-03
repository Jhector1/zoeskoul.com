import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/lib/seo/types";
import type { LandingCopy } from "@/lib/marketing/publicLandingContent";
import { SITE_URL } from "@/lib/seo/site";

export default function PublicMarketingPage({
  locale,
  copy,
  path,
  children,
}: {
  locale: AppLocale;
  copy: LandingCopy;
  path: string;
  children?: ReactNode;
}) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ZoeSkoul", item: `${SITE_URL}/${locale}` },
      { "@type": "ListItem", position: 2, name: copy.title, item: `${SITE_URL}/${locale}${path}` },
    ],
  };

  return (
    <main className="ui-container py-8 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <section className="ui-page-surface border p-6 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[rgb(var(--ui-text-muted)/0.88)]">{copy.eyebrow}</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-[rgb(var(--ui-text)/1)] md:text-5xl">{copy.title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-[rgb(var(--ui-text-muted)/0.94)] md:text-lg">{copy.description}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={copy.primary.href} className="ui-btn-primary inline-flex items-center justify-center px-5 py-2.5">{copy.primary.label}</Link>
          {copy.secondary ? <Link href={copy.secondary.href} className="ui-btn-secondary inline-flex items-center justify-center px-5 py-2.5">{copy.secondary.label}</Link> : null}
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        {copy.features.map((feature) => (
          <article key={feature.title} className="ui-page-surface border p-5">
            <h2 className="text-lg font-semibold text-[rgb(var(--ui-text)/1)]">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">{feature.description}</p>
          </article>
        ))}
      </section>

      {children}

      <section className="mt-6 ui-page-surface border p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-[rgb(var(--ui-text)/1)]">{copy.highlightsTitle}</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {copy.highlights.map((item) => <li key={item} className="border-l-2 border-[rgb(var(--ui-border-strong)/1)] pl-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.95)]">{item}</li>)}
        </ul>
      </section>

      <section className="mt-6 border-y border-[rgb(var(--ui-border)/1)] py-8 md:flex md:items-center md:justify-between md:gap-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[rgb(var(--ui-text)/1)]">{copy.finalTitle}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">{copy.finalDescription}</p>
        </div>
        <div className="mt-5 flex shrink-0 flex-wrap gap-3 md:mt-0">
          <Link href={copy.primary.href} className="ui-btn-primary inline-flex items-center justify-center px-5 py-2.5">{copy.primary.label}</Link>
          {copy.secondary ? <Link href={copy.secondary.href} className="ui-btn-secondary inline-flex items-center justify-center px-5 py-2.5">{copy.secondary.label}</Link> : null}
        </div>
      </section>
    </main>
  );
}
