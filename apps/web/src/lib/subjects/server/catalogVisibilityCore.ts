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
 * Learner rule:
 * - subject must exist in Prisma
 * - version-family rules apply
 * - draft/disabled hidden
 */
export function selectSeededVisibleSubjectsForActor<
    T extends SubjectAvailabilityInput,
>(subjects: readonly T[]): Array<SeededSubject<T>> {
    return selectVisibleSubjectsForActor(subjects).filter(isSeededSubject);
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

export function selectCatalogSubjectsForMode<T extends SubjectAvailabilityInput>(
    subjects: readonly T[],
    mode: CatalogVisibilityMode,
): T[] | Array<SeededSubject<T>> {
    if (mode === "admin") {
        return selectAllCatalogSubjectsForAdmin(subjects);
    }

    return selectSeededVisibleSubjectsForActor(subjects);
}