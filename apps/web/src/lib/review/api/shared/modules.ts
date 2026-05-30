import {
    getResolvedReviewModuleRows,
    type ResolvedReviewModuleRow,
} from "@/lib/subjects/server/resolveSubjectPresentation";

export type ReviewModuleRow = ResolvedReviewModuleRow;

const DEV_REVIEW_CLONE_MODULE_ROWS: Record<string, ReviewModuleRow[]> = {
    python: [
        {
            slug: "e2e-review-clone",
            order: 999_001,
            title: "E2E Review Clone",
        },
    ],
    sql: [
        {
            slug: "e2e-sql-review-clone",
            order: 999_001,
            title: "E2E SQL Review Clone",
        },
    ],
};

export async function loadReviewModulesForSubject(
    _unused: unknown,
    subjectSlug: string,
): Promise<null | { modules: ReviewModuleRow[] }> {
    const modules = await getResolvedReviewModuleRows(subjectSlug);
    if (!modules) return null;

    const devCloneModules = DEV_REVIEW_CLONE_MODULE_ROWS[subjectSlug] ?? [];
    const bySlug = new Map<string, ReviewModuleRow>();

    for (const module of modules) {
        bySlug.set(module.slug, module);
    }

    for (const module of devCloneModules) {
        bySlug.set(module.slug, module);
    }

    return {
        modules: Array.from(bySlug.values()).sort(
            (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
        ),
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
    _unused: unknown,
    args: { subjectSlug: string; moduleSlug: string },
): Promise<
    | {
    ok: true;
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
    const loaded = await loadReviewModulesForSubject(_unused, args.subjectSlug);

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
        modules: loaded.modules,
        module: found.module,
        index: found.index,
    };
}
