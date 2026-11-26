export type DepartmentHomeSubject = {
    departmentId: string;
    enrolled?: boolean;
};

export const DEPARTMENT_HOME_EXPERIENCE_IDS = [
    "computer-science",
    "languages",
] as const;

export type DepartmentHomeExperienceId =
    (typeof DEPARTMENT_HOME_EXPERIENCE_IDS)[number];

function normalizeDepartmentIds(
    learnerDepartmentIds: readonly string[],
): string[] {
    return Array.from(
        new Set(
            learnerDepartmentIds
                .map((id) => id.trim())
                .filter(Boolean),
        ),
    );
}

function isDepartmentHomeExperienceId(
    value: string,
): value is DepartmentHomeExperienceId {
    return (DEPARTMENT_HOME_EXPERIENCE_IDS as readonly string[]).includes(
        value,
    );
}

export function selectDepartmentHomeSubjects<
    T extends DepartmentHomeSubject,
>(
    subjects: readonly T[],
    learnerDepartmentIds: readonly string[],
): T[] {
    const normalized = normalizeDepartmentIds(learnerDepartmentIds);
    if (normalized.length === 0) return [...subjects];

    const selected = new Set(normalized);

    return subjects.filter(
        (subject) =>
            subject.enrolled === true ||
            selected.has(subject.departmentId),
    );
}

export function resolveDepartmentHomeExperiences(
    learnerDepartmentIds: readonly string[],
    options: { learnerEnabled?: boolean } = {},
): DepartmentHomeExperienceId[] {
    if (options.learnerEnabled === false) return [];

    const normalized = normalizeDepartmentIds(learnerDepartmentIds);

    if (normalized.length === 0) {
        return ["computer-science"];
    }

    return normalized.filter(isDepartmentHomeExperienceId);
}
