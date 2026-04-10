import "server-only";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";

export async function resolveSubjectTitle(args: {
    subjectSlug: string;
    locale?: string;
    fallback?: string | null;
}) {
    const { subjectSlug, locale = "en", fallback = null } = args;

    try {
        const t = await getTranslations({ locale });
        const key = `subjects.${subjectSlug}.title`;

        const value = t(key as any);

        if (value && value !== key) {
            return String(value).trim();
        }
    } catch {
        // ignore and fall through to DB fallback
    }

    const subjectRow = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { title: true },
    });

    return (
        subjectRow?.title?.trim() ||
        fallback?.trim() ||
        subjectSlug
    );
}