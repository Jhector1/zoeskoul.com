import "server-only";

import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import type { SaveOnboardingInput } from "@/lib/onboarding/schema";

const GUEST_TTL_DAYS = 30;

function guestExpiryDate() {
    const d = new Date();
    d.setDate(d.getDate() + GUEST_TTL_DAYS);
    return d;
}

function actorWhere(actor: Actor) {
    if (actor.userId) return { userId: actor.userId };
    if (actor.guestId) return { guestId: actor.guestId };
    throw new Error("Actor must have either userId or guestId.");
}

export async function getOnboardingProfile(actor: Actor) {
    if (!actor.userId && !actor.guestId) return null;

    return prisma.userOnboardingProfile.findFirst({
        where: actor.userId ? { userId: actor.userId } : { guestId: actor.guestId! },
        include: {
            interests: {
                include: {
                    subject: {
                        select: {
                            id: true,
                            slug: true,
                            title: true,
                        },
                    },
                },
                orderBy: { createdAt: "asc" },
            },
        },
    });
}

export async function upsertOnboardingProfile(
    actor: Actor,
    input: SaveOnboardingInput,
) {
    const where = actorWhere(actor);

    const existing = await prisma.userOnboardingProfile.findFirst({
        where,
        select: { id: true },
    });

    const profile = existing
        ? await prisma.userOnboardingProfile.update({
            where: { id: existing.id },
            data: {
                preferredLanguage: input.preferredLanguage,
                level: input.level,
                studyTime: input.studyTime,
                completedAt: input.completed ? new Date() : undefined,
                skippedAt: input.skipped ? new Date() : undefined,
                expiresAt: actor.userId ? null : guestExpiryDate(),
            },
        })
        : await prisma.userOnboardingProfile.create({
            data: {
                userId: actor.userId,
                guestId: actor.guestId,
                preferredLanguage: input.preferredLanguage,
                level: input.level,
                studyTime: input.studyTime,
                completedAt: input.completed ? new Date() : undefined,
                skippedAt: input.skipped ? new Date() : undefined,
                expiresAt: actor.userId ? null : guestExpiryDate(),
            },
        });

    if (input.learningInterests) {
        const validSubjects = await prisma.practiceSubject.findMany({
            where: {
                slug: { in: input.learningInterests },
                status: "active",
                showInOnboarding: true,
            },
            select: { id: true },
        });

        await prisma.userOnboardingInterest.deleteMany({
            where: { profileId: profile.id },
        });

        if (validSubjects.length > 0) {
            await prisma.userOnboardingInterest.createMany({
                data: validSubjects.map((subject) => ({
                    profileId: profile.id,
                    subjectId: subject.id,
                })),
                skipDuplicates: true,
            });
        }
    }

    if (input.discoverySource) {
        await prisma.onboardingAnalyticsEvent.create({
            data: {
                profileId: profile.id,
                discoverySource: input.discoverySource,
                eventType: "discovery_source_captured",
            },
        });
    }

    return profile;
}

export async function claimGuestOnboardingForUser(params: {
    guestId: string;
    userId: string;
}) {
    const { guestId, userId } = params;

    const guestProfile = await prisma.userOnboardingProfile.findUnique({
        where: { guestId },
        include: { interests: true },
    });

    if (!guestProfile) return null;

    const userProfile = await prisma.userOnboardingProfile.findUnique({
        where: { userId },
        include: { interests: true },
    });

    if (userProfile) {
        const mergedLanguage =
            userProfile.preferredLanguage ?? guestProfile.preferredLanguage;
        const mergedLevel = userProfile.level ?? guestProfile.level;
        const mergedStudyTime = userProfile.studyTime ?? guestProfile.studyTime;
        const mergedCompletedAt =
            userProfile.completedAt ?? guestProfile.completedAt;
        const mergedSkippedAt = userProfile.skippedAt ?? guestProfile.skippedAt;

        const mergedSubjectIds = new Set<string>([
            ...userProfile.interests.map((x) => x.subjectId),
            ...guestProfile.interests.map((x) => x.subjectId),
        ]);

        await prisma.$transaction([
            prisma.userOnboardingProfile.update({
                where: { id: userProfile.id },
                data: {
                    preferredLanguage: mergedLanguage,
                    level: mergedLevel,
                    studyTime: mergedStudyTime,
                    completedAt: mergedCompletedAt,
                    skippedAt: mergedSkippedAt,
                    claimedAt: new Date(),
                    expiresAt: null,
                },
            }),
            prisma.userOnboardingInterest.deleteMany({
                where: { profileId: userProfile.id },
            }),
            ...(mergedSubjectIds.size
                ? [
                    prisma.userOnboardingInterest.createMany({
                        data: [...mergedSubjectIds].map((subjectId) => ({
                            profileId: userProfile.id,
                            subjectId,
                        })),
                        skipDuplicates: true,
                    }),
                ]
                : []),
            prisma.onboardingAnalyticsEvent.updateMany({
                where: { profileId: guestProfile.id },
                data: { profileId: userProfile.id },
            }),
            prisma.userOnboardingInterest.deleteMany({
                where: { profileId: guestProfile.id },
            }),
            prisma.userOnboardingProfile.delete({
                where: { id: guestProfile.id },
            }),
        ]);

        return prisma.userOnboardingProfile.findUnique({
            where: { id: userProfile.id },
            include: {
                interests: {
                    include: {
                        subject: {
                            select: { slug: true, title: true },
                        },
                    },
                },
            },
        });
    }

    return prisma.userOnboardingProfile.update({
        where: { id: guestProfile.id },
        data: {
            userId,
            guestId: null,
            claimedAt: new Date(),
            expiresAt: null,
        },
        include: {
            interests: {
                include: {
                    subject: {
                        select: { slug: true, title: true },
                    },
                },
            },
        },
    });
}