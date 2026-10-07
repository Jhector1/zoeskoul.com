import { auth } from "@/lib/auth";
import {
    getOnboardingSubjects,
    getPublicOnboardingSubjects,
} from "@/lib/onboarding/getOnboardingSubjects";
import { buildPublicChallengePresentation } from "@/lib/practice/challenges/presentation";
import {
    getLatestActivePracticeChallengeLink,
    getLatestDailyPracticeChallengeLink,
} from "@/lib/practice/challenges/shortLink";
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
        const challengeLocale = supportedLocale(locale);
        const link =
            (await getLatestDailyPracticeChallengeLink(challengeLocale)) ??
            (await getLatestActivePracticeChallengeLink(challengeLocale));
        if (!link) return null;

        const presentation = buildPublicChallengePresentation({
            source: link,
            fallbackTitle: "A new coding challenge",
        });
        const linkLocale = supportedLocale(link.locale);

        return {
            href: `/${linkLocale}/c/${encodeURIComponent(link.code)}`,
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
    const rawUserId = (
        session?.user as { id?: unknown } | undefined
    )?.id;
    const userId =
        typeof rawUserId === "string" ? rawUserId : undefined;

    if (!userId) {
        const subjects = await getPublicOnboardingSubjects();

        return (
            <HomePageAvatarOnboardingClient
                locale={locale}
                initialSubjects={subjects}
                isAuthenticated={Boolean(session?.user)}
                isSubscriber={false}
                latestChallenge={null}
                dailyPracticeTargetCount={DAILY_PRACTICE_TARGET_COUNT}
            />
        );
    }

    const [subjects, latestChallenge, viewer] = await Promise.all([
        getOnboardingSubjects(),
        getLatestChallengeCard(locale),
        resolvePracticeViewer(prisma, { userId, guestId: null }),
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
