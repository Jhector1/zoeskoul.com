import "server-only";

import { prisma } from "@/lib/prisma";
import {
    CATALOG_MANIFESTS,
    SUBJECT_CATALOG_SLUGS,
} from "@zoeskoul/curriculum-registry/runtime";
import {
    getResolvedCatalogMap,
    getResolvedSubjectCatalogMap,
} from "@/lib/subjects/server/resolveSubjectPresentation";

import {
    selectVisibleSubjectsForActor,
    withSubjectEnrollmentActivity,
} from "@/lib/subjects/server/subjectVisibility";

export type OnboardingSubjectOption = {
    id?: string;
    slug: string;
    enrolled: boolean;
    lastSeenAt: string | null;
    title: string;
    description: string;
    badge: string | null;
    imageUrl?: string | null;
    imageAlt?: string | null;
    catalogSlug: string;
    catalogTitle: string;
    catalogOrder: number;
};

function badgeFromSubject(input: {
    accessPolicy: "free" | "paid";
    entitlementKey: string | null;
}) {
    if (input.accessPolicy === "free") return "Free";
    if (input.entitlementKey) return "Premium";
    return "Featured";
}

export async function getOnboardingSubjects(): Promise<OnboardingSubjectOption[]> {
    const [subjects, manifestMap] = await Promise.all([
        prisma.practiceSubject.findMany({
            where: {
                status: "active",
            },
            orderBy: [{ order: "asc" }, { title: "asc" }],
            select: {
                id: true,
                slug: true,
                title: true,
                description: true,
                imagePublicId: true,
                imageAlt: true,
                accessPolicy: true,
                entitlementKey: true,
                showInOnboarding: true,
            },
        }),
        getResolvedSubjectCatalogMap(),
    ]);

    const mappedSubjects = subjects
        .map((subject) => {
            const resolved = manifestMap[subject.slug];

            if (!resolved) return null;

            return {
                db: subject,
                slug: subject.slug,
                versioning: resolved.versioning,
                resolved,
            };
        })
        .filter((subject): subject is NonNullable<typeof subject> => Boolean(subject));

    const visibleSubjects = selectVisibleSubjectsForActor(
        await withSubjectEnrollmentActivity(mappedSubjects),
        { familyPreference: "enrolled" },
    ).filter(({ db, enrolled }) => enrolled || db.showInOnboarding);

    return visibleSubjects.map(({ db: s, resolved, enrolled, lastSeenAt }) => {
        const imagePublicId = resolved?.imagePublicId ?? s.imagePublicId;
        const catalogSlug = SUBJECT_CATALOG_SLUGS[s.slug] ?? "other";
        const catalog = CATALOG_MANIFESTS[catalogSlug]?.catalog;

        return {
            id: s.id,
            slug: s.slug,
            enrolled,
            lastSeenAt: lastSeenAt?.toISOString() ?? null,
            title: resolved?.title ?? s.title,
            description: resolved?.description ?? s.description ?? "",
            badge: badgeFromSubject({
                accessPolicy: s.accessPolicy,
                entitlementKey: s.entitlementKey ?? null,
            }),
            imageUrl: imagePublicId
                ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${imagePublicId}`
                : null,
            imageAlt:
                resolved?.imageAlt ??
                s.imageAlt ??
                resolved?.title ??
                s.title,
            catalogSlug,
            catalogTitle: catalog?.title ?? "Other courses",
            catalogOrder: catalog?.order ?? Number.MAX_SAFE_INTEGER,
        };
    });
}

/**
 * Public homepage/onboarding presentation from the canonical published
 * curriculum only. This deliberately does not consult Prisma.
 *
 * Authenticated learners continue through getOnboardingSubjects(), which
 * enriches the same canonical presentation with persisted enrollment,
 * access, and activity.
 */
export async function getPublicOnboardingSubjects(): Promise<
    OnboardingSubjectOption[]
> {
    const catalogMap = await getResolvedCatalogMap();

    return Object.values(catalogMap)
        .filter((catalog) => catalog.status === "active")
        .flatMap((catalog) => {
            const catalogOrder =
                CATALOG_MANIFESTS[catalog.slug]?.catalog?.order ??
                Number.MAX_SAFE_INTEGER;

            return catalog.subjects
                .filter((subject) => {
                    const lifecycleStatus = subject.versioning?.status;

                    return (
                        subject.visibility === "public" &&
                        subject.status === "active" &&
                        lifecycleStatus !== "draft" &&
                        lifecycleStatus !== "disabled"
                    );
                })
                .map((subject) => {
                    const imagePublicId = subject.imagePublicId ?? null;

                    return {
                        slug: subject.slug,
                        enrolled: false,
                        lastSeenAt: null,
                        title: subject.title,
                        description: subject.description ?? "",
                        badge: null,
                        imageUrl: imagePublicId
                            ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${imagePublicId}`
                            : null,
                        imageAlt:
                            subject.imageAlt ??
                            subject.title ??
                            subject.slug,
                        catalogSlug: catalog.slug,
                        catalogTitle: catalog.title,
                        catalogOrder,
                    } satisfies OnboardingSubjectOption;
                });
        });
}
