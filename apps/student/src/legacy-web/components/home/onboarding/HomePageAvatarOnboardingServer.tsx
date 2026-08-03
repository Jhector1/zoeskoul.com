import { auth } from "@/lib/auth";
import { getOnboardingSubjects } from "@/lib/onboarding/getOnboardingSubjects";
import { buildPublicChallengePresentation } from "@/lib/practice/challenges/presentation";
import { getLatestActivePracticeChallengeLink } from "@/lib/practice/challenges/shortLink";
import type { PublicChallengeCardData } from "@/lib/practice/challenges/types";
import { DAILY_PRACTICE_TARGET_COUNT } from "@/lib/practice/experience/config";
import { resolvePracticeViewer } from "@/lib/practice/experience/viewer";
import { prisma } from "@/lib/prisma";
import HomePageAvatarOnboardingClient from "./HomePageAvatarOnboardingClient";

function supportedLocale(value: string) {
    if (value === "fr" || value === "ht") return value;
    return "en";
}

async function getLatestChallengeCard(
    locale: string,
): Promise<PublicChallengeCardData | null> {
    try {
        const link = await getLatestActivePracticeChallengeLink(
            supportedLocale(locale),
        );
        if (!link) return null;

        const presentation = buildPublicChallengePresentation({
            source: link,
            fallbackTitle: "A new coding challenge",
        });
        const challengeLocale = supportedLocale(link.locale);

        return {
            href: `/${challengeLocale}/c/${encodeURIComponent(link.code)}`,
            ...presentation,
        };
    } catch (error) {
        console.error("[home-latest-challenge] Could not load the latest challenge", error);
        return null;
    }
}

export default async function HomePageAvatarOnboardingServer({
                                                                 locale,
                                                             }: {
    locale: string;
}) {
    const session = await auth();
    const userId = (session?.user as any)?.id as string | undefined;
    const [subjects, latestChallenge, viewer] = await Promise.all([
        getOnboardingSubjects(),
        getLatestChallengeCard(locale),
        userId
            ? resolvePracticeViewer(prisma, { userId, guestId: null })
            : Promise.resolve({
                  tier: "guest" as const,
                  authenticated: false,
                  subscribed: false,
              }),
    ]);

    return (
        <HomePageAvatarOnboardingClient
            locale={locale}
            initialSubjects={subjects}
            isAuthenticated={Boolean(session?.user)}
            isSubscriber={viewer.subscribed}
            latestChallenge={latestChallenge}
            dailyPracticeTargetCount={DAILY_PRACTICE_TARGET_COUNT}
        />
    );
}
