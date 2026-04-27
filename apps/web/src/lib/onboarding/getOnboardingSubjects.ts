import "server-only";

import { prisma } from "@/lib/prisma";
import { getResolvedSubjectCatalogMap } from "@/lib/subjects/server/resolveSubjectPresentation";

export type OnboardingSubjectOption = {
    id?: string;
    slug: string;
    title: string;
    description: string;
    badge: string | null;
    imageUrl?: string | null;
    imageAlt?: string | null;
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
                showInOnboarding: true,
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
            },
        }),
        getResolvedSubjectCatalogMap(),
    ]);

    return subjects.map((s) => {
        const resolved = manifestMap[s.slug];
        const imagePublicId = resolved?.imagePublicId ?? s.imagePublicId;

        return {
            id: s.id,
            slug: s.slug,
            title: resolved?.title ?? s.title,
            description: resolved?.description ?? s.description ?? "",
            badge: badgeFromSubject({
                accessPolicy: s.accessPolicy,
                entitlementKey: s.entitlementKey ?? null,
            }),
            imageUrl: imagePublicId
                ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${imagePublicId}`
                : null,
            imageAlt: resolved?.imageAlt ?? s.imageAlt ?? resolved?.title ?? s.title,
        };
    });
}
