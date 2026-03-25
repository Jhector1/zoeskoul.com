import { prisma } from "@/lib/prisma";

async function main() {
    const now = new Date();

    const staleProfiles = await prisma.userOnboardingProfile.findMany({
        where: {
            userId: null,
            expiresAt: { lt: now },
        },
        select: { id: true },
    });

    if (!staleProfiles.length) {
        console.log("No stale guest onboarding profiles found.");
        return;
    }

    const ids = staleProfiles.map((p) => p.id);

    await prisma.$transaction([
        prisma.onboardingAnalyticsEvent.deleteMany({
            where: { profileId: { in: ids } },
        }),
        prisma.userOnboardingInterest.deleteMany({
            where: { profileId: { in: ids } },
        }),
        prisma.userOnboardingProfile.deleteMany({
            where: { id: { in: ids } },
        }),
    ]);

    console.log(`Deleted ${ids.length} stale guest onboarding profile(s).`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });