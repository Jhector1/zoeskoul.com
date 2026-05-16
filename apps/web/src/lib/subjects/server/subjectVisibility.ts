import "server-only";

import { prisma } from "@/lib/prisma";
import { actorKeyOf, getActor } from "@/lib/practice/actor";

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

/**
 * Adds DB subject id + current actor enrollment to manifest/resolved subjects.
 *
 * Important:
 * This function preserves the original object shape.
 * So if the caller passes SubjectCard[], the caller gets back
 * SubjectCard & enrollment fields, not just SubjectVisibilityInput[].
 */
export async function withSubjectEnrollment<T extends { slug: string }>(
    subjects: readonly T[],
): Promise<Array<T & SubjectEnrollmentFields>> {
    const slugs = subjects.map((subject) => subject.slug);

    if (slugs.length === 0) {
        return subjects.map((subject) => ({
            ...subject,
            subjectId: null,
            enrolled: false,
        }));
    }

    const [actor, dbSubjects] = await Promise.all([
        getActor(),
        prisma.practiceSubject.findMany({
            where: {
                slug: {
                    in: slugs,
                },
            },
            select: {
                id: true,
                slug: true,
            },
        }),
    ]);

    const subjectIdsBySlug = new Map(
        dbSubjects.map((subject) => [subject.slug, subject.id] as const),
    );

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

    return subjects.map((subject) => {
        const subjectId = subjectIdsBySlug.get(subject.slug) ?? null;

        return {
            ...subject,
            subjectId,
            enrolled: subjectId ? enrolledSubjectIds.has(subjectId) : false,
        };
    });
}