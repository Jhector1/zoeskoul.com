import "server-only";

import { cloudinaryServerImageUrl } from "@/lib/cloudinary/server";

export const DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION =
  "Can you complete this coding project challenge? No account is required to try it.";

type ChallengePresentationSource = {
  shareTitle: string | null;
  shareDescription: string | null;
  ogImagePublicId: string | null;
  ogImageAlt: string | null;
};

export function buildPublicChallengePresentation(args: {
  source: ChallengePresentationSource;
  fallbackTitle: string;
}) {
  const title = args.source.shareTitle || args.fallbackTitle;
  const description =
    args.source.shareDescription || DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION;
  const imageUrl = args.source.ogImagePublicId
    ? cloudinaryServerImageUrl(args.source.ogImagePublicId, {
        w: 1200,
        h: 630,
        crop: "fill",
        gravity: "auto",
        quality: "auto",
        format: "jpg",
      })
    : null;

  return {
    title,
    description,
    imageUrl,
    imageAlt: args.source.ogImageAlt || `${title} preview`,
  };
}
