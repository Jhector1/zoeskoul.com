import { auth } from "@/lib/auth";
import { getOnboardingSubjects } from "@/lib/onboarding/getOnboardingSubjects";
import HomePageAvatarOnboardingClient from "./HomePageAvatarOnboardingClient";

export default async function HomePageAvatarOnboardingServer({
                                                                 locale,
                                                             }: {
    locale: string;
}) {
    const [session, subjects] = await Promise.all([
        auth(),
        getOnboardingSubjects(),
    ]);

    return (
        <HomePageAvatarOnboardingClient
            locale={locale}
            initialSubjects={subjects}
            isAuthenticated={Boolean(session?.user)}
        />
    );
}