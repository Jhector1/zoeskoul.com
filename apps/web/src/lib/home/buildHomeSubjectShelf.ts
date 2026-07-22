export type HomeSubjectShelfKind = "current" | "recommended";

export type HomeSubjectShelfSource = {
    slug: string;
    enrolled?: boolean;
    lastSeenAt?: string | null;
};

export type HomeSubjectShelfItem<T> = {
    subject: T;
    kind: HomeSubjectShelfKind;
};

function timestamp(value: string | null | undefined): number {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Builds the four-card home shelf from one shared policy:
 *
 * 1. Enrolled courses come first, newest learner activity first.
 * 2. Empty slots are filled by non-enrolled recommendations.
 * 3. Onboarding interests prioritize recommendations without duplicating a
 *    current course.
 * 4. The shelf never exceeds the requested limit.
 */
export function buildHomeSubjectShelf<T extends HomeSubjectShelfSource>(
    subjects: readonly T[],
    preferredSubjectSlugs: readonly string[],
    limit = 4,
): Array<HomeSubjectShelfItem<T>> {
    if (limit <= 0) return [];

    const indexed = subjects.map((subject, index) => ({ subject, index }));

    const current = indexed
        .filter(({ subject }) => subject.enrolled === true)
        .sort((left, right) => {
            const activityDelta =
                timestamp(right.subject.lastSeenAt) -
                timestamp(left.subject.lastSeenAt);

            return activityDelta || left.index - right.index;
        })
        .slice(0, limit)
        .map(({ subject }) => ({
            subject,
            kind: "current" as const,
        }));

    const openSlots = limit - current.length;
    if (openSlots <= 0) return current;

    const preferredRank = new Map(
        preferredSubjectSlugs.map((slug, index) => [slug, index] as const),
    );

    const recommended = indexed
        .filter(({ subject }) => subject.enrolled !== true)
        .sort((left, right) => {
            const leftRank = preferredRank.get(left.subject.slug);
            const rightRank = preferredRank.get(right.subject.slug);

            if (leftRank !== undefined || rightRank !== undefined) {
                if (leftRank === undefined) return 1;
                if (rightRank === undefined) return -1;
                if (leftRank !== rightRank) return leftRank - rightRank;
            }

            return left.index - right.index;
        })
        .slice(0, openSlots)
        .map(({ subject }) => ({
            subject,
            kind: "recommended" as const,
        }));

    return [...current, ...recommended];
}
