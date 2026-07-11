import "server-only";

import {
    selectVisibleSubjectsForActor,
    type SubjectVisibilityInput,
} from "./subjectVisibilityCore";

export type CatalogVisibilityMode = "learner" | "admin";

export type SubjectAvailabilityInput = SubjectVisibilityInput & {
    subjectId?: string | null;
};

export type SeededSubject<T extends SubjectAvailabilityInput> = T & {
    subjectId: string;
};

export function isSeededSubject<T extends SubjectAvailabilityInput>(
    subject: T,
): subject is SeededSubject<T> {
    return typeof subject.subjectId === "string" && subject.subjectId.length > 0;
}

/**
 * Learner catalog rule:
 * - active courses must exist in Prisma before they can be shown/enrolled
 * - coming-soon courses may be shown from the manifest without a Prisma row
 * - disabled publication entries remain hidden
 * - catalog prefers the active default course over an enrolled legacy course
 * - draft/disabled versions stay hidden through the shared version rule
 */
export function selectSeededVisibleSubjectsForActor<
    T extends SubjectAvailabilityInput & {
        status?: "active" | "coming_soon" | "disabled";
    },
>(subjects: readonly T[]): T[] {
    const learnerCandidates = subjects.filter((subject) => {
        if (subject.status === "disabled") return false;
        if (subject.status === "coming_soon") return true;
        return isSeededSubject(subject);
    });

    return selectVisibleSubjectsForActor(learnerCandidates, {
        familyPreference: "default",
    });
}

/**
 * Admin rule:
 * - keep all manifest subjects
 * - keep unseeded subjects
 * - keep legacy/draft/disabled
 * - do not collapse version families
 *
 * This lets admin see catalog drift and seed/versioning issues clearly.
 */
export function selectAllCatalogSubjectsForAdmin<
    T extends SubjectAvailabilityInput,
>(subjects: readonly T[]): T[] {
    return [...subjects];
}

export function selectCatalogSubjectsForMode<
    T extends SubjectAvailabilityInput & {
        status?: "active" | "coming_soon" | "disabled";
    },
>(
    subjects: readonly T[],
    mode: CatalogVisibilityMode,
): T[] {
    if (mode === "admin") {
        return selectAllCatalogSubjectsForAdmin(subjects);
    }

    return selectSeededVisibleSubjectsForActor(subjects);
}
