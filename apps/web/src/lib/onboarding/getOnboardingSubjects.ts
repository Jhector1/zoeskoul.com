import "server-only";

import { prisma } from "@/lib/prisma";

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
    const subjects = await prisma.practiceSubject.findMany({
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
    });

    return subjects.map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        description: s.description ?? "",
        badge: badgeFromSubject({
            accessPolicy: s.accessPolicy,
            entitlementKey: s.entitlementKey ?? null,
        }),
        imageUrl: s.imagePublicId
            ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${s.imagePublicId}`
            : null,
        imageAlt: s.imageAlt ?? s.title,
    }));
}