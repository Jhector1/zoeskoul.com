import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import TrialPracticeClient from "@/app/(public)/[locale]/(learningZone)/practice/trial/trial-practice-client";
import { assertEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";
import { buildPublicChallengePresentation } from "@/lib/practice/challenges/presentation";
import { getActivePracticeChallengeLink } from "@/lib/practice/challenges/shortLink";
import { resolveSharedChallengeTarget } from "@/lib/practice/challenges/target";
import { verifySharedChallenge } from "@/lib/practice/challenges/token";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import type { AppLocale } from "@/lib/seo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShortChallengePageProps = {
  params: Promise<{ locale: string; code: string }>;
};

function resolveLocale(value: string): AppLocale {
  if (value === "fr" || value === "ht") return value;
  return "en";
}

const resolveChallenge = cache(async function resolveChallenge(code: string) {
  const link = await getActivePracticeChallengeLink(code);
  if (!link) return null;

  const claims = verifySharedChallenge(link.signedToken);
  if (!claims) return null;

  try {
    const target = resolveSharedChallengeTarget(claims);
    assertEligiblePublicChallengeTarget(target);

    if (
      target.subjectSlug !== link.subjectSlug ||
      target.moduleSlug !== link.moduleSlug ||
      target.sectionSlug !== link.sectionSlug ||
      target.topicSlug !== link.topicSlug ||
      target.exerciseKey !== link.exerciseKey
    ) {
      return null;
    }

    return { link, target };
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: ShortChallengePageProps): Promise<Metadata> {
  const { locale: rawLocale, code } = await params;
  const locale = resolveLocale(rawLocale);
  const resolved = await resolveChallenge(code);

  if (!resolved) {
    return buildMetadata({
      locale,
      path: `/c/${encodeURIComponent(code)}`,
      title: "Challenge unavailable",
      description: "This ZoeSkoul challenge is unavailable or has expired.",
      noIndex: true,
    });
  }

  const { link, target } = resolved;
  const presentation = buildPublicChallengePresentation({
    source: link,
    fallbackTitle: `${target.exerciseTitle} · ZoeSkoul challenge`,
  });

  return buildMetadata({
    locale,
    path: `/c/${link.code}`,
    title: presentation.title,
    description: presentation.description,
    ogTitle: presentation.title,
    ogDescription: presentation.description,
    twitterTitle: presentation.title,
    twitterDescription: presentation.description,
    imageUrl: presentation.imageUrl || undefined,
    imageAlt: presentation.imageAlt,
  });
}

export default async function ShortChallengePage({
  params,
}: ShortChallengePageProps) {
  const { locale: rawLocale, code } = await params;
  const locale = resolveLocale(rawLocale);
  const resolved = await resolveChallenge(code);

  if (!resolved) notFound();

  return (
    <TrialPracticeClient
      locale={locale}
      sessionId={null}
      subject={null}
      level={null}
      challenge={resolved.link.signedToken}
      canonicalPath={`/${locale}/c/${resolved.link.code}`}
    />
  );
}
