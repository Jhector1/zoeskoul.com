import "server-only";

import { prisma } from "@/lib/prisma";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";

export type SubjectPublicationStatus = "active" | "coming_soon" | "disabled";

export type SubjectPublicationState = {
    subjectId: string | null;
    slug: string;
    databaseStatus: SubjectPublicationStatus | null;
    manifestStatus: SubjectPublicationStatus | null;
    isAvailable: boolean;
};

export function getManifestSubjectPublicationStatus(
    subjectSlug: string,
): SubjectPublicationStatus | null {
    const subject = SUBJECT_ARTIFACTS.subjects.find(
        (candidate) => candidate.slug === subjectSlug,
    );

    if (!subject) return null;

    return subject.status === "coming_soon" || subject.status === "disabled"
        ? subject.status
        : "active";
}

export async function getSubjectPublicationState(
    subjectSlug: string,
): Promise<SubjectPublicationState> {
    const [databaseSubject, manifestStatus] = await Promise.all([
        prisma.practiceSubject.findUnique({
            where: { slug: subjectSlug },
            select: {
                id: true,
                slug: true,
                status: true,
            },
        }),
        Promise.resolve(getManifestSubjectPublicationStatus(subjectSlug)),
    ]);

    const databaseStatus = databaseSubject?.status ?? null;

    return {
        subjectId: databaseSubject?.id ?? null,
        slug: subjectSlug,
        databaseStatus,
        manifestStatus,
        isAvailable:
            databaseStatus === "active" && manifestStatus === "active",
    };
}
