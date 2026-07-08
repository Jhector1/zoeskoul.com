import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import TrialPracticeClient from "@/app/(public)/[locale]/(learningZone)/practice/trial/trial-practice-client";
import { cloudinaryServerImageUrl } from "@/lib/cloudinary/server";
import { assertEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";
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
  const title = link.shareTitle || `${target.exerciseTitle} · ZoeSkoul challenge`;
  const description =
    link.shareDescription ||
    "Can you complete this coding project challenge? No account is required to try it.";
  const imageUrl = link.ogImagePublicId
    ? cloudinaryServerImageUrl(link.ogImagePublicId, {
        w: 1200,
        h: 630,
        crop: "fill",
        gravity: "auto",
        quality: "auto",
        format: "jpg",
      })
    : undefined;

  return buildMetadata({
    locale,
    path: `/c/${link.code}`,
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    twitterTitle: title,
    twitterDescription: description,
    imageUrl: imageUrl || undefined,
    imageAlt: link.ogImageAlt || `${title} preview`,
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
