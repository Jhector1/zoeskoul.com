import type { ReviewModule } from "@/lib/subjects/types";

export type ReviewModulePageData = {
    catalogSlug: string | null;
    canUnlockAll: boolean;
} & (
    | {
        status: "ready";
        mod: ReviewModule;
    }
    | {
        status: "unavailable";
        mod: null;
    }
    | {
        status: "missing";
        mod: null;
    }
);

type ResolveReviewModulePageDataArgs = {
    subjectSlug: string;
    moduleSlug: string;
    catalogSlug: string | null;
    canUnlockAll: boolean;
    isAvailable: boolean;
    moduleExists: boolean;
    resolveModule: () => Promise<ReviewModule | null>;
};

/**
 * Resolves the route-facing module state without depending on Next.js server
 * boundaries. Keeping this state machine pure lets unit tests exercise the
 * false-404 rules without importing the framework-only `server-only` marker.
 */
export async function resolveReviewModulePageData(
    args: ResolveReviewModulePageDataArgs,
): Promise<ReviewModulePageData> {
    const {
        subjectSlug,
        moduleSlug,
        catalogSlug,
        canUnlockAll,
        isAvailable,
        moduleExists,
        resolveModule,
    } = args;

    /**
     * Existence and access are separate concerns:
     * - a genuinely absent compiled module is a 404;
     * - an existing but unpublished module is an availability state;
     * - only accessible content is resolved and sent to the client.
     */
    if (!moduleExists) {
        return {
            status: "missing",
            mod: null,
            catalogSlug,
            canUnlockAll,
        };
    }

    if (!canUnlockAll && !isAvailable) {
        return {
            status: "unavailable",
            mod: null,
            catalogSlug,
            canUnlockAll,
        };
    }

    const mod = await resolveModule();

    if (!mod) {
        throw new Error(
            `[review-module] Compiled module ${subjectSlug}/${moduleSlug} exists, ` +
            "but the presentation resolver returned null.",
        );
    }

    return {
        status: "ready",
        mod,
        catalogSlug,
        canUnlockAll,
    };
}
