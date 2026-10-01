import "server-only";

import {
  DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION,
} from "@/lib/practice/challenges/presentation";

const MAX_SOCIAL_DESCRIPTION = 240;

type SocialDescriptionChallenge = {
  locale: string;
  subjectSlug: string;
  moduleSlug?: string | null;
  sectionSlug?: string | null;
  exerciseKey: string;
  shareDescription: string | null;
};

function compactDescription(value: unknown) {
  const raw =
    typeof value === "string"
      ? value
      : "";

  const cleaned = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>#~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  if (cleaned.length <= MAX_SOCIAL_DESCRIPTION) {
    return cleaned;
  }

  const clipped = cleaned.slice(
    0,
    MAX_SOCIAL_DESCRIPTION - 1,
  );

  const lastSpace = clipped.lastIndexOf(" ");
  const safeCut =
    lastSpace >= 180
      ? clipped.slice(0, lastSpace)
      : clipped;

  return `${safeCut.trimEnd()}…`;
}

async function resolvePromptReference(
  value: string,
  locale: string,
) {
  const prompt = value.trim();

  if (!prompt.startsWith("@:")) {
    return prompt;
  }

  const key = prompt.slice(2).trim();
  if (!key) return "";

  try {
    const { getTranslations } =
      await import("next-intl/server");

    const t = await getTranslations({
      locale:
        locale === "fr" || locale === "ht"
          ? locale
          : "en",
    });

    const resolved = t(key as any);

    if (
      resolved &&
      String(resolved).trim() !== key
    ) {
      return String(resolved).trim();
    }
  } catch {
    // Fail closed to the stored description below.
  }

  return "";
}

export async function resolvePublicChallengeSocialDescription(
  challenge: SocialDescriptionChallenge,
) {
  const saved = String(
    challenge.shareDescription ?? "",
  ).trim();

  const needsAuthoredPrompt =
    !saved ||
    saved === DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION ||
    saved.startsWith("@:");

  if (!needsAuthoredPrompt) {
    return saved;
  }

  try {
    const {
      listPublishedChallengeExerciseOptions,
    } = await import(
      "@/lib/practice/challenges/publishedCatalog"
    );

    const options =
      await listPublishedChallengeExerciseOptions();

    const authored = options.find(
      (option) =>
        option.subjectSlug ===
          challenge.subjectSlug &&
        option.exerciseKey ===
          challenge.exerciseKey &&
        (!challenge.moduleSlug ||
          option.moduleSlug ===
            challenge.moduleSlug) &&
        (!challenge.sectionSlug ||
          option.sectionSlug ===
            challenge.sectionSlug),
    );

    const promptReference =
      String(
        authored?.exercisePrompt ?? "",
      ).trim();

    if (promptReference) {
      const resolved =
        await resolvePromptReference(
          promptReference,
          challenge.locale,
        );

      const description =
        compactDescription(resolved);

      if (description) {
        return description;
      }
    }
  } catch {
    // Social publishing must still be able to use
    // an explicitly saved description.
  }

  return (
    saved ||
    DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION
  );
}
