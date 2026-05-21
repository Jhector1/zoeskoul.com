import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getAvailableVisibleCatalogsForActor,
    getAvailableVisibleSubjectCardsForActor,
} from "@/lib/subjects/server/catalogVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const [dbSubjects, subjectCards, catalogs] = await Promise.all([
        prisma.practiceSubject.findMany({
            orderBy: { order: "asc" },
            include: {
                modules: {
                    orderBy: { order: "asc" },
                    select: { slug: true, title: true, order: true },
                },
                sections: {
                    orderBy: { order: "asc" },
                    select: { slug: true, title: true, order: true, moduleId: true },
                },
            },
        }),
        getAvailableVisibleSubjectCardsForActor(),
        getAvailableVisibleCatalogsForActor(),
    ]);

    const subjectCardsBySlug = new Map(
        subjectCards.map((subject) => [subject.slug, subject] as const),
    );

    const subjects = dbSubjects
        .map((subject) => {
            const resolved = subjectCardsBySlug.get(subject.slug);

            if (!resolved) {
                return null;
            }

            return {
                ...subject,
                title: resolved.title ?? subject.title,
                description: resolved.description ?? subject.description,
                imagePublicId: resolved.imagePublicId ?? subject.imagePublicId,
                imageAlt:
                    resolved.imageAlt ??
                    subject.imageAlt ??
                    resolved.title ??
                    subject.slug,
                subjectId: resolved.subjectId,
                enrolled: resolved.enrolled,
                versioning: resolved.versioning,
            };
        })
        .filter((subject): subject is NonNullable<typeof subject> => Boolean(subject));

    return NextResponse.json({
        catalogs,
        subjects,
    });
}