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

export type SubjectDatabaseStateFields = SubjectEnrollmentFields & {
    subjectOrder: number | null;
};

type PersistedSubjectState = PersistedSubjectCardPresentation & {
    subjectId: string;
    order: number;
    enrolled: boolean;
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

    const enrolledSubjectIds = new Set<string>();

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
            },
        });

        for (const row of rows) {
            enrolledSubjectIds.add(row.subjectId);
        }
    }

    return new Map(
        dbSubjects.map((subject) => [
            subject.slug,
            {
                subjectId: subject.id,
                order: subject.order,
                enrolled: enrolledSubjectIds.has(subject.id),
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
        };
    });
}
