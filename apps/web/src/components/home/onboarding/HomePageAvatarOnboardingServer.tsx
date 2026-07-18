import { auth } from "@/lib/auth";
import { getOnboardingSubjects } from "@/lib/onboarding/getOnboardingSubjects";
import { buildPublicChallengePresentation } from "@/lib/practice/challenges/presentation";
import { getLatestActivePracticeChallengeLink } from "@/lib/practice/challenges/shortLink";
import type { PublicChallengeCardData } from "@/lib/practice/challenges/types";
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
    const [session, subjects, latestChallenge] = await Promise.all([
        auth(),
        getOnboardingSubjects(),
        getLatestChallengeCard(locale),
    ]);

    return (
        <HomePageAvatarOnboardingClient
            locale={locale}
            initialSubjects={subjects}
            isAuthenticated={Boolean(session?.user)}
            latestChallenge={latestChallenge}
        />
    );
}
