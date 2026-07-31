export type SubjectVersionStatus = "draft" | "active" | "legacy" | "disabled";

export type SubjectVersioningLike = {
    family?: string | null;
    status?: SubjectVersionStatus | null;
    defaultForNewEnrollments?: boolean | null;
} | null;

export type SubjectVisibilityInput = {
    slug: string;
    subjectId?: string | null;
    enrolled?: boolean;
    versioning?: SubjectVersioningLike;
};

export type SubjectFamilyPreference = "enrolled" | "default";

export type SubjectVisibilityOptions = {
    /**
     * enrolled: learning surfaces keep the version the learner is already using.
     * default: catalog/onboarding surfaces recommend the active default course.
     */
    familyPreference?: SubjectFamilyPreference;
};

export function getVersionFamily(subject: {
    slug: string;
    versioning?: SubjectVersioningLike;
}): string {
    const family = subject.versioning?.family?.trim();

    return family || subject.slug;
}

export function isDefaultActiveSubject(subject: {
    versioning?: SubjectVersioningLike;
}): boolean {
    const versioning = subject.versioning;

    if (!versioning) {
        return true;
    }

    return (
        versioning.status === "active" &&
        versioning.defaultForNewEnrollments === true
    );
}

/**
 * Pure subject-version visibility logic.
 *
 * Rules:
 * 1. Non-versioned subjects are visible normally.
 * 2. For each version family:
 *    - learning surfaces default to the enrolled active/legacy version.
 *    - catalog/onboarding surfaces can prefer the active default version.
 *    - otherwise show the first active version as a safe fallback.
 * 3. Never show draft/disabled versions to normal learners.
 * 4. Never show multiple versions from the same family.
 */
export function selectVisibleSubjectsForActor<T extends SubjectVisibilityInput>(
    subjects: readonly T[],
    options: SubjectVisibilityOptions = {},
): T[] {
    const subjectsByFamily = new Map<string, T[]>();

    for (const subject of subjects) {
        if (!isSubjectCandidateVisible(subject)) {
            continue;
        }

        const family = getVersionFamily(subject);
        const familySubjects = subjectsByFamily.get(family) ?? [];

        familySubjects.push(subject);
        subjectsByFamily.set(family, familySubjects);
    }

    const visible: T[] = [];
    const familyPreference = options.familyPreference ?? "enrolled";

    for (const familySubjects of subjectsByFamily.values()) {
        const selected = selectVisibleSubjectFromFamily(
            familySubjects,
            familyPreference,
        );

        if (selected) {
            visible.push(selected);
        }
    }

    return visible;
}

function selectVisibleSubjectFromFamily<T extends SubjectVisibilityInput>(
    subjects: readonly T[],
    familyPreference: SubjectFamilyPreference,
): T | null {
    const enrolledSubject = subjects.find(isEnrolledActiveOrLegacySubject);
    const defaultActiveSubject = subjects.find((subject) =>
        isDefaultActiveSubject(subject),
    );

    if (familyPreference === "default") {
        return defaultActiveSubject ?? enrolledSubject ?? firstActiveSubject(subjects);
    }

    return enrolledSubject ?? defaultActiveSubject ?? firstActiveSubject(subjects);
}

function isEnrolledActiveOrLegacySubject<T extends SubjectVisibilityInput>(
    subject: T,
): boolean {
    const status = subject.versioning?.status;

    return (
        subject.enrolled === true &&
        (status === "active" || status === "legacy" || !subject.versioning)
    );
}

function firstActiveSubject<T extends SubjectVisibilityInput>(
    subjects: readonly T[],
): T | null {
    return (
        subjects.find((subject) => subject.versioning?.status === "active") ??
        null
    );
}

function isSubjectCandidateVisible<T extends SubjectVisibilityInput>(
    subject: T,
): boolean {
    const status = subject.versioning?.status;

    return status !== "draft" && status !== "disabled";
}
