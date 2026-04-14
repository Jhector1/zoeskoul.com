import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveServerText } from "@/lib/subjects/resolveServerText";

export async function resolveModuleTitle(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale?: string;
    fallback?: string | null;
}) {
    const { subjectSlug, moduleSlug, locale = "en", fallback = null } = args;

    const row = await prisma.practiceModule.findUnique({
        where: { slug: moduleSlug },
        select: { title: true },
    });

    return resolveServerText({
        locale,
        preferredKey: `modules.${subjectSlug}.${moduleSlug}.title`,
        dbValue: row?.title ?? null,
        fallback,
        finalFallback: moduleSlug,
    });
}