import "server-only";

import { prisma } from "@/lib/prisma";
import { actorKeyOf, getActor } from "@/lib/practice/actor";
import {
    mergeSubjectCardPresentation,
    type PersistedSubjectCardPresentation,
    type SubjectCardPresentation,
} from "@/lib/subjects/subjectCardPresentation";

export {
    getVersionFamily,
    isDefaultActiveSubject,
    selectVisibleSubjectsForActor,
    type SubjectVersionStatus,
    type SubjectVersioningLike,
    type SubjectVisibilityInput,
} from "./subjectVisibilityCore";

export type SubjectEnrollmentFields = {
    subjectId: string | null;
    enrolled: boolean;
};

export type SubjectEnrollmentActivityFields = SubjectEnrollmentFields & {
    lastSeenAt: Date | null;
};

export type SubjectDatabaseStateFields = SubjectEnrollmentFields & {
    subjectOrder: number | null;
    visibility: "public" | "private" | "organization";
};

type PersistedSubjectState = PersistedSubjectCardPresentation & {
    subjectId: string;
    order: number;
    visibility: "public" | "private" | "organization";
    enrolled: boolean;
    lastSeenAt: Date | null;
};

async function loadPersistedSubjectState(
    slugs: readonly string[],
): Promise<Map<string, PersistedSubjectState>> {
    if (slugs.length === 0) {
        return new Map();
    }

    const [actor, dbSubjects] = await Promise.all([
        getActor(),
        prisma.practiceSubject.findMany({
            where: {
                slug: {
                    in: [...slugs],
                },
            },
            select: {
                id: true,
                slug: true,
                order: true,
                visibility: true,
                title: true,
                description: true,
                imagePublicId: true,
                imageAlt: true,
                modules: {
                    orderBy: { order: "asc" },
                    take: 1,
                    select: { slug: true },
                },
            },
        }),
    ]);

    const actorKey =
        actor.userId || actor.guestId
            ? actorKeyOf({
                  userId: actor.userId ?? null,
                  guestId: actor.guestId ?? null,
              })
            : null;

    const enrollmentBySubjectId = new Map<string, Date | null>();

    if (actorKey && dbSubjects.length > 0) {
        const rows = await prisma.subjectEnrollment.findMany({
            where: {
                actorKey,
                subjectId: {
                    in: dbSubjects.map((subject) => subject.id),
                },
                status: {
                    in: ["enrolled", "completed"],
                },
            },
            select: {
                subjectId: true,
                lastSeenAt: true,
            },
        });

        for (const row of rows) {
            enrollmentBySubjectId.set(row.subjectId, row.lastSeenAt ?? null);
        }
    }

    return new Map(
        dbSubjects.map((subject) => [
            subject.slug,
            {
                subjectId: subject.id,
                order: subject.order,
                visibility: subject.visibility,
                enrolled: enrollmentBySubjectId.has(subject.id),
                lastSeenAt: enrollmentBySubjectId.get(subject.id) ?? null,
                title: subject.title,
                description: subject.description,
                imagePublicId: subject.imagePublicId,
                imageAlt: subject.imageAlt,
                defaultModuleSlug: subject.modules[0]?.slug ?? null,
            },
        ] as const),
    );
}

/**
 * Adds DB subject id + current actor enrollment to resolved subjects.
 *
 * Keep this compatibility helper for callers that only need enrollment state.
 * Course-card surfaces should use withSubjectCardState so presentation fallback
 * is resolved through the same shared policy.
 */
export async function withSubjectEnrollment<T extends { slug: string }>(
    subjects: readonly T[],
): Promise<Array<T & SubjectEnrollmentFields>> {
    const stateBySlug = await loadPersistedSubjectState(
        subjects.map((subject) => subject.slug),
    );

    return subjects.map((subject) => {
        const state = stateBySlug.get(subject.slug);

        return {
            ...subject,
            subjectId: state?.subjectId ?? null,
            enrolled: state?.enrolled ?? false,
        };
    });
}

/**
 * Adds the learner's latest course activity for surfaces that need recency,
 * while sharing the same enrollment lookup used by the catalog helpers.
 */
export async function withSubjectEnrollmentActivity<T extends { slug: string }>(
    subjects: readonly T[],
): Promise<Array<T & SubjectEnrollmentActivityFields>> {
    const stateBySlug = await loadPersistedSubjectState(
        subjects.map((subject) => subject.slug),
    );

    return subjects.map((subject) => {
        const state = stateBySlug.get(subject.slug);

        return {
            ...subject,
            subjectId: state?.subjectId ?? null,
            enrolled: state?.enrolled ?? false,
            lastSeenAt: state?.lastSeenAt ?? null,
        };
    });
}

/**
 * Hydrates authored course cards with persisted availability, enrollment, and
 * presentation fallbacks. This is the shared server boundary for My Courses,
 * catalog lists, catalog detail pages, and catalog APIs.
 */
export async function withSubjectCardState<T extends SubjectCardPresentation>(
    subjects: readonly T[],
): Promise<Array<T & SubjectDatabaseStateFields>> {
    const stateBySlug = await loadPersistedSubjectState(
        subjects.map((subject) => subject.slug),
    );

    return subjects.map((subject) => {
        const state = stateBySlug.get(subject.slug);
        const presentation = mergeSubjectCardPresentation(subject, state);

        return {
            ...presentation,
            subjectId: state?.subjectId ?? null,
            enrolled: state?.enrolled ?? false,
            subjectOrder: state?.order ?? null,
            visibility: state?.visibility ?? subject.visibility ?? "public",
        };
    });
}
