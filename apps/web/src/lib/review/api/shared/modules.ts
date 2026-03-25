import type { PrismaClient } from "@prisma/client";
import { hasReviewModule } from "@/lib/subjects/registry";

export type ReviewModuleRow = {
    id: string;
    slug: string;
    order: number;
    title: string;
};

export async function loadReviewModulesForSubject(
    prisma: PrismaClient,
    subjectSlug: string,
): Promise<null | { subjectId: string; modules: ReviewModuleRow[] }> {
    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true },
    });

    if (!subject) return null;

    const dbModules = await prisma.practiceModule.findMany({
        where: { subjectId: subject.id },
        orderBy: { order: "asc" },
        select: {
            id: true,
            slug: true,
            order: true,
            title: true,
        },
    });

    const modules = dbModules.filter((m) => hasReviewModule(subjectSlug, m.slug));

    return {
        subjectId: subject.id,
        modules,
    };
}

export function findReviewModule(
    modules: ReviewModuleRow[],
    moduleSlug: string,
): null | { module: ReviewModuleRow; index: number } {
    const index = modules.findIndex((m) => m.slug === moduleSlug);
    if (index < 0) return null;
    return { module: modules[index], index };
}

export async function resolveReviewModuleForSubject(
    prisma: PrismaClient,
    args: { subjectSlug: string; moduleSlug: string },
):
    Promise<
        | {
        ok: true;
        subjectId: string;
        modules: ReviewModuleRow[];
        module: ReviewModuleRow;
        index: number;
    }
        | {
        ok: false;
        statusCode: number;
        message: string;
        detail?: Record<string, unknown>;
    }
    > {
    const loaded = await loadReviewModulesForSubject(prisma, args.subjectSlug);

    if (!loaded) {
        return {
            ok: false,
            statusCode: 404,
            message: "Unknown subjectSlug.",
            detail: { subjectSlug: args.subjectSlug },
        };
    }

    const found = findReviewModule(loaded.modules, args.moduleSlug);
    if (!found) {
        return {
            ok: false,
            statusCode: 404,
            message: "Module not found in review registry for this subject.",
            detail: {
                subjectSlug: args.subjectSlug,
                moduleSlug: args.moduleSlug,
                available: loaded.modules.map((m) => m.slug),
            },
        };
    }

    return {
        ok: true,
        subjectId: loaded.subjectId,
        modules: loaded.modules,
        module: found.module,
        index: found.index,
    };
}