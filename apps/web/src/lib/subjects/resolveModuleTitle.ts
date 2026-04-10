import "server-only";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";

export async function resolveModuleTitle(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale?: string;
    fallback?: string | null;
}) {
    const { subjectSlug, moduleSlug, locale = "en", fallback = null } = args;

    try {
        const t = await getTranslations({ locale });
        const key = `modules.${subjectSlug}.${moduleSlug}.title`;
        const value = t(key as any);

        if (value && value !== key) {
            return String(value).trim();
        }
    } catch {
        // fall through
    }

    const row = await prisma.practiceModule.findUnique({
        where: { slug: moduleSlug },
        select: { title: true },
    });

    return row?.title?.trim() || fallback?.trim() || moduleSlug;
}