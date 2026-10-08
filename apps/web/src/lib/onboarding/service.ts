import "server-only";

import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import {
    ONBOARDING_VERSION,
    type SaveOnboardingInput,
} from "@/lib/onboarding/schema";

function requireAuthenticatedActor(actor: Actor) {
    if (!actor.userId) {
        throw new Error("Onboarding requires an authenticated user.");
    }

    return { userId: actor.userId, guestId: null } satisfies Actor;
}

export function onboardingStatusFromProfile(
    profile:
        | {
            completedAt: Date | null;
            skippedAt: Date | null;
        }
        | null
        | undefined,
) {
    if (!profile) return "not_started" as const;
    if (profile.completedAt || profile.skippedAt) return "completed" as const;
    return "in_progress" as const;
}

export async function getOnboardingProfile(actor: Actor) {
    if (!actor.userId) return null;

    return prisma.userOnboardingProfile.findUnique({
        where: { userId: actor.userId },
        include: {
            departments: {
                orderBy: [{ context: "asc" }, { createdAt: "asc" }],
            },
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
    const saveActor = requireAuthenticatedActor(actor);

    const existing = await prisma.userOnboardingProfile.findUnique({
        where: { userId: saveActor.userId },
        select: { id: true },
    });

    const profile = existing
        ? await prisma.userOnboardingProfile.update({
            where: { id: existing.id },
            data: {
                version: ONBOARDING_VERSION,
                useMode: input.useMode,
                learnerAffiliation: input.learnerAffiliation,
                teacherAffiliation: input.teacherAffiliation,
                preferredLanguage: input.preferredLanguage,
                level: input.level,
                studyTime: input.studyTime,
                completedAt: input.completed ? new Date() : undefined,
                skippedAt: input.skipped ? new Date() : undefined,
                expiresAt: null,
            },
        })
        : await prisma.userOnboardingProfile.create({
            data: {
                userId: saveActor.userId,
                guestId: null,
                version: ONBOARDING_VERSION,
                useMode: input.useMode,
                learnerAffiliation: input.learnerAffiliation,
                teacherAffiliation: input.teacherAffiliation,
                preferredLanguage: input.preferredLanguage,
                level: input.level,
                studyTime: input.studyTime,
                completedAt: input.completed ? new Date() : undefined,
                skippedAt: input.skipped ? new Date() : undefined,
                expiresAt: null,
            },
        });

    if (input.departmentSelections) {
        await prisma.userOnboardingDepartment.deleteMany({
            where: { profileId: profile.id },
        });

        if (input.departmentSelections.length > 0) {
            await prisma.userOnboardingDepartment.createMany({
                data: input.departmentSelections.map((selection) => ({
                    profileId: profile.id,
                    departmentKey: selection.departmentKey,
                    context: selection.context,
                })),
                skipDuplicates: true,
            });
        }
    }

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

/**
 * Compatibility bridge for onboarding answers collected before the
 * authenticated-only boundary. No new guest onboarding rows are created.
 * Existing guest rows can still be claimed once after sign-in so historical
 * answers are not stranded during rollout.
 */
export async function claimGuestOnboardingForUser(params: {
    guestId: string;
    userId: string;
}) {
    const { guestId, userId } = params;

    const guestProfile = await prisma.userOnboardingProfile.findUnique({
        where: { guestId },
        include: { interests: true, departments: true },
    });

    if (!guestProfile) return null;

    const userProfile = await prisma.userOnboardingProfile.findUnique({
        where: { userId },
        include: { interests: true, departments: true },
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
        const mergedDepartments = new Map<string, {
            departmentKey: string;
            context: "learner" | "teacher";
        }>();

        for (const item of [...userProfile.departments, ...guestProfile.departments]) {
            mergedDepartments.set(`${item.context}:${item.departmentKey}`, {
                departmentKey: item.departmentKey,
                context: item.context,
            });
        }

        await prisma.$transaction([
            prisma.userOnboardingProfile.update({
                where: { id: userProfile.id },
                data: {
                    version: Math.max(userProfile.version, guestProfile.version),
                    useMode: userProfile.useMode ?? guestProfile.useMode,
                    learnerAffiliation:
                        userProfile.learnerAffiliation ??
                        guestProfile.learnerAffiliation,
                    teacherAffiliation:
                        userProfile.teacherAffiliation ??
                        guestProfile.teacherAffiliation,
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
            prisma.userOnboardingDepartment.deleteMany({
                where: { profileId: userProfile.id },
            }),
            ...(mergedDepartments.size
                ? [
                    prisma.userOnboardingDepartment.createMany({
                        data: [...mergedDepartments.values()].map((department) => ({
                            profileId: userProfile.id,
                            ...department,
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
            prisma.userOnboardingDepartment.deleteMany({
                where: { profileId: guestProfile.id },
            }),
            prisma.userOnboardingProfile.delete({
                where: { id: guestProfile.id },
            }),
        ]);

        return getOnboardingProfile({ userId, guestId: null });
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
            departments: true,
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
