import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveServerText } from "@/lib/subjects/resolveServerText";

export async function resolveSubjectTitle(args: {
    subjectSlug: string;
    locale?: string;
    fallback?: string | null;
}) {
    const { subjectSlug, locale = "en", fallback = null } = args;

    const subjectRow = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { title: true },
    });

    return resolveServerText({
        locale,
        preferredKey: `subjects.${subjectSlug}.title`,
        dbValue: subjectRow?.title ?? null,
        fallback,
        finalFallback: subjectSlug,
    });
}