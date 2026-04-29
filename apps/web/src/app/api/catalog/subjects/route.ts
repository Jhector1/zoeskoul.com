import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getResolvedCatalogMap,
    getResolvedSubjectCardMap,
} from "@/lib/subjects/server/resolveSubjectPresentation";

export async function GET() {
    const [subjects, subjectMap, catalogMap] = await Promise.all([
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
        getResolvedSubjectCardMap(),
        getResolvedCatalogMap(),
    ]);

    return NextResponse.json({
        catalogs: Object.values(catalogMap),
        subjects: subjects.map((subject) => {
            const resolved = subjectMap[subject.slug];

            return {
                ...subject,
                title: resolved?.title ?? subject.title,
                description: resolved?.description ?? subject.description,
                imagePublicId: resolved?.imagePublicId ?? subject.imagePublicId,
                imageAlt:
                    resolved?.imageAlt ??
                    subject.imageAlt ??
                    resolved?.title ??
                    subject.slug,
            };
        }),
    });
}
