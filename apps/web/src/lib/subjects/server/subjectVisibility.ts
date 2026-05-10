import "server-only";

import { prisma } from "@/lib/prisma";
import { actorKeyOf, getActor } from "@/lib/practice/actor";

export type SubjectVersioningLike = {
    family?: string;
    status?: "draft" | "active" | "legacy" | "disabled";
    defaultForNewEnrollments?: boolean;
} | null;

export type SubjectVisibilityInput = {
    slug: string;
    versioning?: SubjectVersioningLike;
    enrolled?: boolean;
};

export function getVersionFamily(subject: {
    slug: string;
    versioning?: SubjectVersioningLike;
}) {
    return subject.versioning?.family ?? subject.slug;
}

export function isDefaultActiveSubject(subject: {
    versioning?: SubjectVersioningLike;
}) {
    const versioning = subject.versioning;

    if (!versioning) return true;

    return (
        versioning.status === "active" &&
        versioning.defaultForNewEnrollments === true
    );
}

export function selectVisibleSubjectsForActor<T extends SubjectVisibilityInput>(
    subjects: T[],
): T[] {
    const enrolledFamilies = new Set(
        subjects
            .filter((subject) => subject.enrolled)
            .map((subject) => getVersionFamily(subject)),
    );

    const visible = subjects.filter((subject) => {
        const family = getVersionFamily(subject);

        if (enrolledFamilies.has(family)) {
            return Boolean(subject.enrolled);
        }

        return isDefaultActiveSubject(subject);
    });

    const seenFamilies = new Set<string>();

    return visible.filter((subject) => {
        const family = getVersionFamily(subject);

        if (seenFamilies.has(family)) return false;

        seenFamilies.add(family);
        return true;
    });
}

export async function withSubjectEnrollment<T extends { slug: string }>(
    subjects: T[],
): Promise<(T & { subjectId: string | null; enrolled: boolean })[]> {
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
                slug: { in: slugs },
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

    const enrolledIds = new Set<string>();

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

        rows.forEach((row) => enrolledIds.add(row.subjectId));
    }

    return subjects.map((subject) => {
        const subjectId = subjectIdsBySlug.get(subject.slug) ?? null;

        return {
            ...subject,
            subjectId,
            enrolled: subjectId ? enrolledIds.has(subjectId) : false,
        };
    });
}