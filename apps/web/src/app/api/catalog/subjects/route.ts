import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResolvedSubjectCatalogMap } from "@/lib/subjects/server/resolveSubjectPresentation";

export async function GET() {
    const [subjects, manifestMap] = await Promise.all([
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
        getResolvedSubjectCatalogMap(),
    ]);

    return NextResponse.json({
        subjects: subjects.map((subject) => {
            const resolved = manifestMap[subject.slug];

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
