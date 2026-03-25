import "server-only";

import { prisma } from "@/lib/prisma";
import type { PracticeDifficulty } from "@prisma/client";

export function difficultyFromLevel(
    level: string | null | undefined,
): PracticeDifficulty {
    switch (String(level ?? "").trim()) {
        case "advanced":
            return "hard";
        case "intermediate":
            return "medium";
        default:
            return "easy";
    }
}

export function isOnboardingTrialSession(session: {
    mode?: string | null;
} | null | undefined) {
    return session?.mode === "onboarding_trial";
}

/**
 * Long-term:
 * choose only a safe starter section for each subject.
 * For now we use the first ordered section inside the subject.
 * Later you can add meta.onboardingTrialSection = true.
 */
export async function getTrialSectionForSubject(subjectSlug: string) {
    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true, slug: true, status: true },
    });

    if (!subject || subject.status !== "active") {
        throw new Error(`Subject "${subjectSlug}" is not available.`);
    }

    const section = await prisma.practiceSection.findFirst({
        where: { subjectId: subject.id },
        orderBy: [{ order: "asc" }, { title: "asc" }],
        select: {
            id: true,
            slug: true,
            subjectId: true,
            moduleId: true,
        },
    });

    if (!section) {
        throw new Error(`No starter section found for subject "${subjectSlug}".`);
    }

    return section;
}