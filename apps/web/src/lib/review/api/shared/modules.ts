// src/lib/review/api/shared/modules.ts
import { hasReviewModule } from "@/lib/subjects/registry";
import { MODULES, SUBJECTS } from "@/lib/subjects";

export type ReviewModuleRow = {
    slug: string;
    order: number;
    title: string;
};

export async function loadReviewModulesForSubject(
    _unused: unknown,
    subjectSlug: string,
): Promise<null | { modules: ReviewModuleRow[] }> {
    const subjectExists = SUBJECTS.some((s) => s.slug === subjectSlug);
    if (!subjectExists) return null;

    const modules = MODULES
        .filter(
            (m) =>
                m.subjectSlug === subjectSlug &&
                hasReviewModule(subjectSlug, m.slug),
        )
        .sort((a, b) => a.order - b.order)
        .map((m) => ({
            slug: m.slug,
            order: m.order,
            title: m.title,
        }));

    return { modules };
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