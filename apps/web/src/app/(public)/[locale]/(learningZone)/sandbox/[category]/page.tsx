import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";
import type { AppLocale } from "@/lib/seo/types";
import {
  PROGRAMMING_TOOL_ORDER,
  buildProgrammingToolHref,
  resolveSandboxToolEntry,
} from "@/lib/sandbox/toolRegistry";
import { SITE_URL } from "@/lib/seo/site";
import PublicSiteShell from "@/components/marketing/PublicSiteShell";

type PageProps = { params: Promise<{ locale: string; category: string }> };

function legacySandboxRedirect(locale: string, sandboxSlug: string) {
  switch (sandboxSlug) {
    case "online-python-compiler": return `/${locale}/sandbox/programming/python`;
    case "online-java-compiler": return `/${locale}/sandbox/programming/java`;
    case "online-javascript-editor": return `/${locale}/sandbox/programming/javascript`;
    case "online-c-compiler": return `/${locale}/sandbox/programming/c`;
    case "online-cpp-compiler": return `/${locale}/sandbox/programming/cpp`;
    case "online-sql-editor": return `/${locale}/sandbox/programming/sql`;
    case "linear-algebra": return `/${locale}/sandbox/math/linear-algebra`;
    default: return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, category } = await params;
  if (category !== "programming") {
    const target = legacySandboxRedirect(locale, category);
    if (!target) notFound();
    return {};
  }
  const l = locale as AppLocale;
  const seo = await getRouteSeo(l, "sandbox-programming");
  const shared = await getSharedSeo(l);
  return buildMetadata({
    locale: l,
    path: "/sandbox/programming",
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

export default async function SandboxCategoryPage({ params }: PageProps) {
  const { locale, category } = await params;
  const target = legacySandboxRedirect(locale, category);
  if (target) redirect(target);
  if (category !== "programming") notFound();

  const tools = PROGRAMMING_TOOL_ORDER.flatMap((toolSlug) => {
    const entry = resolveSandboxToolEntry("programming", toolSlug);
    return entry ? [{ toolSlug, entry }] : [];
  });
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: tools.map(({ entry, toolSlug }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.title,
      url: `${SITE_URL}${buildProgrammingToolHref(locale, toolSlug)}`,
    })),
  };

  return (
    <PublicSiteShell badge="Sandbox">
      <main className="ui-container py-8 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <section className="ui-page-surface border p-6 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[rgb(var(--ui-text-muted)/0.88)]">
          {locale === "fr" ? "Outils de programmation" : locale === "ht" ? "Zouti pwogramasyon" : "Programming tools"}
        </p>
        <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-[rgb(var(--ui-text)/1)] md:text-5xl">
          {locale === "fr" ? "Écrivez et exécutez du code directement dans votre navigateur" : locale === "ht" ? "Ekri epi kouri kòd dirèkteman nan navigatè ou" : "Write and run code directly in your browser"}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-[rgb(var(--ui-text-muted)/0.94)] md:text-lg">
          {locale === "fr" ? "Choisissez un langage, essayez du code et utilisez les outils publics ZoeSkoul pour passer rapidement de l'idée à la pratique." : locale === "ht" ? "Chwazi yon langaj, eseye kòd epi sèvi ak zouti piblik ZoeSkoul pou pase rapidman soti nan lide pou rive nan pratik." : "Choose a language, try code, and use ZoeSkoul's public tools to move quickly from explanation to practice."}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/learn/programming" className="ui-btn-primary inline-flex items-center justify-center px-5 py-2.5">
            {locale === "fr" ? "Apprendre la programmation" : locale === "ht" ? "Aprann pwogramasyon" : "Learn programming"}
          </Link>
          <Link href="/authenticate" className="ui-btn-secondary inline-flex items-center justify-center px-5 py-2.5">
            {locale === "fr" ? "Créer un compte" : locale === "ht" ? "Kreye yon kont" : "Create an account"}
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(({ entry, toolSlug }) => (
          <Link key={toolSlug} href={buildProgrammingToolHref(locale, toolSlug)} className="ui-page-surface border p-5 transition-colors hover:border-[rgb(var(--ui-border-strong)/1)]">
            <h2 className="text-xl font-semibold text-[rgb(var(--ui-text)/1)]">{entry.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
              {locale === "fr" ? "Ouvrez l'outil et commencez à pratiquer immédiatement." : locale === "ht" ? "Louvri zouti a epi kòmanse pratike touswit." : "Open the tool and start practicing immediately."}
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-[rgb(var(--ui-text)/0.92)]">
              {locale === "fr" ? "Ouvrir →" : locale === "ht" ? "Louvri →" : "Open tool →"}
            </span>
          </Link>
        ))}
      </section>
      </main>
    </PublicSiteShell>
  );
}
