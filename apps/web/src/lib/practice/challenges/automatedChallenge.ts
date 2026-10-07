import "server-only";

import { prisma } from "@/lib/prisma";
import { assertEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";
import { DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION } from "@/lib/practice/challenges/presentation";
import type { PublishedChallengeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { assertPublishedChallengeTargetAvailable } from "@/lib/practice/challenges/publishedAvailability";
import {
  createPracticeChallengeLinkRecord,
  practiceChallengeLinkExpiresAt,
} from "@/lib/practice/challenges/shortLink";
import { resolveSharedChallengeTarget } from "@/lib/practice/challenges/target";
import { signSharedChallenge } from "@/lib/practice/challenges/token";

export type PublicChallengeLocale = "en" | "fr" | "ht";

type ExerciseIdentity = Pick<
  PublishedChallengeExerciseOption,
  "subjectSlug" | "moduleSlug" | "sectionSlug" | "topicSlug" | "exerciseKey"
>;

export function publicChallengeExerciseIdentity(value: ExerciseIdentity) {
  return [
    value.subjectSlug,
    value.moduleSlug,
    value.sectionSlug,
    value.topicSlug,
    value.exerciseKey,
  ].join("::");
}

export async function createOrReuseAutomatedPracticeChallenge(args: {
  locale: PublicChallengeLocale;
  option: PublishedChallengeExerciseOption;
  now?: Date;
}) {
  const now = args.now ?? new Date();

  const target = resolveSharedChallengeTarget({
    subjectSlug: args.option.subjectSlug,
    moduleSlug: args.option.moduleSlug,
    sectionSlug: args.option.sectionSlug,
    topicSlug: args.option.topicSlug,
    exerciseKey: args.option.exerciseKey,
    exercisePurpose: "practice",
  });

  assertEligiblePublicChallengeTarget(target);
  await assertPublishedChallengeTargetAvailable({
    prisma,
    target,
  });

  const existing = await prisma.practiceChallengeLink.findFirst({
    where: {
      locale: args.locale,
      subjectSlug: target.subjectSlug,
      moduleSlug: target.moduleSlug,
      sectionSlug: target.sectionSlug,
      topicSlug: target.topicSlug,
      exerciseKey: target.exerciseKey,
      exercisePurpose: "practice",
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  const expiresAt = practiceChallengeLinkExpiresAt(now);
  const signedToken = signSharedChallenge(target, { expiresAt });

  return createPracticeChallengeLinkRecord({
    locale: args.locale,
    subjectSlug: target.subjectSlug,
    moduleSlug: target.moduleSlug,
    sectionSlug: target.sectionSlug,
    topicSlug: target.topicSlug,
    exerciseKey: target.exerciseKey,
    exercisePurpose: "practice",
    signedToken,
    shareTitle: target.exerciseTitle,
    shareDescription: DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION,
    ogImagePublicId: null,
    ogImageAlt: null,
    createdById: null,
    expiresAt,
  });
}
