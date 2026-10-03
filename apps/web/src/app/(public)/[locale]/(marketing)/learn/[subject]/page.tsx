import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getSharedSeo, getSubjectSeo } from "@/lib/seo/getSeo";
import type { AppLocale } from "@/lib/seo/types";
import { getLearningPathCopy, LEARNING_PATH_KEYS, type LearningPathKey } from "@/lib/marketing/publicLandingContent";
import PublicMarketingPage from "@/components/marketing/PublicMarketingPage";

type Props = { params: Promise<{ locale: string; subject: string }> };

function isLearningPath(value: string): value is LearningPathKey {
  return (LEARNING_PATH_KEYS as string[]).includes(value);
}

export function generateStaticParams() {
  return LEARNING_PATH_KEYS.map((subject) => ({ subject }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, subject } = await params;
  if (!isLearningPath(subject)) notFound();
  const l = locale as AppLocale;
  const seo = await getSubjectSeo(l, subject);
  const shared = await getSharedSeo(l);
  return buildMetadata({
    locale: l,
    path: `/learn/${subject}`,
    title: seo.title,
    description: seo.description,
    keywords: shared.keywords,
    ogTitle: seo.ogTitle,
    ogDescription: seo.ogDescription,
    imageAlt: shared.defaultOgAlt,
    noIndex: false,
  });
}

export default async function LearningPathPage({ params }: Props) {
  const { locale, subject } = await params;
  if (!isLearningPath(subject)) notFound();
  const l = locale as AppLocale;
  const copy = getLearningPathCopy(l, subject);
  return <PublicMarketingPage locale={l} copy={copy} path={`/learn/${subject}`} />;
}
