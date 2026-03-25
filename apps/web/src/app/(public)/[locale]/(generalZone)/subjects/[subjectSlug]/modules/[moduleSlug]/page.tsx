// src/app/(public)/[locale]/subjects/[subjectSlug]/modules/[moduleSlug]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ModuleIntroClient from "./ModuleIntroClient";
import { parseModuleMeta } from "@/lib/practice/parseModuleMeta";
import { getServerI18n } from "@/i18n/server";
import {ModuleMeta} from "@/lib/validators/moduleMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ModuleIntroPage({
                                                  params,
                                              }: {
    params: Promise<{ locale: string; subjectSlug: string; moduleSlug: string }>;
}) {
    const { locale, subjectSlug, moduleSlug } = await params;
    if (!subjectSlug || !moduleSlug) notFound();

    const { tMaybe, rawMaybe } = await getServerI18n();

    const subjectDb = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: {
            slug: true,
            title: true,
            description: true,
            imagePublicId: true,
            imageAlt: true,
        },
    });
    if (!subjectDb) notFound();

    const moduleDb = await prisma.practiceModule.findFirst({
        where: { slug: moduleSlug, subject: { slug: subjectSlug } },
        select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            order: true,
            weekStart: true,
            weekEnd: true,
            meta: true,
        },
    });
    if (!moduleDb) notFound();

    const [sectionsCount, topicsCount] = await Promise.all([
        prisma.practiceSection.count({ where: { moduleId: moduleDb.id } }),
        prisma.practiceTopic.count({ where: { moduleId: moduleDb.id } }),
    ]);

    // ✅ translate subject/module title+desc (fallback to DB)
    const subjectTitle = tMaybe(`subjects.${subjectDb.slug}.title`, subjectDb.title);
    const subjectDesc = tMaybe(
        `subjects.${subjectDb.slug}.description`,
        subjectDb.description ?? ""
    );

    const moduleTitle = tMaybe(
        `modules.${subjectDb.slug}.${moduleDb.slug}.title`,
        moduleDb.title
    );
    const moduleDesc = tMaybe(
        `modules.${subjectDb.slug}.${moduleDb.slug}.description`,
        moduleDb.description ?? ""
    );
// // ✅ meta from DB + optional override from i18n arrays (if present + raw supported)
//     const metaDb = parseModuleMeta(moduleDb.meta); // type: { prereqs?: string[]; ... } | null
//     const metaBase = `modules.${subjectDb.slug}.${moduleDb.slug}.meta`;
//
//     const asStringArray = (v: unknown, fallback?: string[]) => {
//         if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
//         return fallback;
//     };

// ✅ meta from DB + optional override from i18n arrays (if present + raw supported)
    const metaDb = parseModuleMeta(moduleDb.meta); // ModuleMeta | null
    const metaBase = `modules.${subjectDb.slug}.${moduleDb.slug}.meta`;

    const asStringArray = (v: unknown): string[] | undefined => {
        if (!Array.isArray(v)) return undefined;
        const xs = v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
        return xs.length ? xs : undefined;
    };

// read raw as unknown (fallback undefined)
    const prereqsI18n = asStringArray(rawMaybe<unknown>(`${metaBase}.prereqs`, undefined));
    const outcomesI18n = asStringArray(rawMaybe<unknown>(`${metaBase}.outcomes`, undefined));
    const whyI18n = asStringArray(rawMaybe<unknown>(`${metaBase}.why`, undefined));

// build a ModuleMeta without writing explicit undefineds
    const merged: ModuleMeta = { ...(metaDb ?? {}) };

    if (prereqsI18n) merged.prereqs = prereqsI18n;
    if (outcomesI18n) merged.outcomes = outcomesI18n;
    if (whyI18n) merged.why = whyI18n;

// optionally keep meta null if it's effectively empty
    const hasAny =
        (merged.prereqs?.length ?? 0) > 0 ||
        (merged.outcomes?.length ?? 0) > 0 ||
        (merged.why?.length ?? 0) > 0 ||
        (merged.videoUrl != null && merged.videoUrl !== "") ||
        merged.estimatedMinutes != null;

    const metaMerged: ModuleMeta | null = hasAny ? merged : null;

    return (
        <ModuleIntroClient
            locale={locale}
            subject={{
                slug: subjectDb.slug,
                title: subjectTitle,
                description: subjectDesc || null,
                imagePublicId: subjectDb.imagePublicId ?? null,
                imageAlt: subjectDb.imageAlt ?? null,
            }}
            module={{
                id: moduleDb.id,
                slug: moduleDb.slug,
                title: moduleTitle,
                description: moduleDesc || null,
                order: moduleDb.order ?? 0,
                weekStart: moduleDb.weekStart ?? null,
                weekEnd: moduleDb.weekEnd ?? null,
                meta: metaMerged,
            }}
            stats={{ sectionsCount, topicsCount }}
        />
    );
}