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
import HomePageAvatarOnboardingClient, {
    type OnboardingInitialState,
} from "./HomePageAvatarOnboardingClient";
import { getOnboardingProfile } from "@/lib/onboarding/service";
import {
    LevelSchema,
    parseStoredOnboardingChoice,
    PreferredLanguageSchema,
    StudyTimeSchema,
} from "@/lib/onboarding/schema";
import { getActor } from "@/lib/practice/actor";

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
    forceOnboarding = false,
    completionHref,
}: {
    locale: string;
    forceOnboarding?: boolean;
    completionHref?: string | null;
}) {
    const actor = await getActor();
    const userId = actor.userId ?? undefined;

    if (!userId) {
        const subjects = await getPublicOnboardingSubjects();

        return (
            <HomePageAvatarOnboardingClient
                locale={locale}
                initialSubjects={subjects}
                isAuthenticated={false}
                isSubscriber={false}
                latestChallenge={null}
                dailyPracticeTargetCount={DAILY_PRACTICE_TARGET_COUNT}
                forceOnboarding={false}
                completionHref={null}
                initialOnboarding={null}
            />
        );
    }

    const [subjects, latestChallenge, viewer, profile] = await Promise.all([
        getOnboardingSubjects(),
        getLatestChallengeCard(locale),
        resolvePracticeViewer(prisma, { userId, guestId: null }),
        getOnboardingProfile({ userId, guestId: null }),
    ]);

    const initialOnboarding: OnboardingInitialState | null = profile
        ? {
            completed: Boolean(profile.completedAt),
            skipped: Boolean(profile.skippedAt),
            data: {
                useMode: profile.useMode ?? "",
                learnerAffiliation: profile.learnerAffiliation ?? "",
                teacherAffiliation: profile.teacherAffiliation ?? "",
                learnerDepartments: profile.departments
                    .filter((item) => item.context === "learner")
                    .map((item) => item.departmentKey),
                teacherDepartments: profile.departments
                    .filter((item) => item.context === "teacher")
                    .map((item) => item.departmentKey),
                preferredLanguage: parseStoredOnboardingChoice(
                    PreferredLanguageSchema,
                    profile.preferredLanguage,
                ),
                learningInterests: profile.interests
                    .map((item) => item.subject?.slug)
                    .filter((slug): slug is string => Boolean(slug)),
                level: parseStoredOnboardingChoice(
                    LevelSchema,
                    profile.level,
                ),
                studyTime: parseStoredOnboardingChoice(
                    StudyTimeSchema,
                    profile.studyTime,
                ),
            },
        }
        : null;

    return (
        <HomePageAvatarOnboardingClient
            locale={locale}
            initialSubjects={subjects}
            isAuthenticated
            isSubscriber={viewer.subscribed}
            latestChallenge={latestChallenge}
            dailyPracticeTargetCount={DAILY_PRACTICE_TARGET_COUNT}
            forceOnboarding={forceOnboarding}
            completionHref={completionHref ?? null}
            initialOnboarding={initialOnboarding}
        />
    );
}
