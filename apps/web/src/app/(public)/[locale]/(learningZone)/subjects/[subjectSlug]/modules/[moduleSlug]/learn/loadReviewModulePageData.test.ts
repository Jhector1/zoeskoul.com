import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveReviewModulePageData } from "./reviewModulePageData";

const resolvedModule = {
    id: "git-foundations-module-1-start-tracking",
    title: "Start tracking",
    topics: [],
    sections: [],
};

const resolveModule = vi.fn();

const baseArgs = {
    subjectSlug: "git-foundations",
    moduleSlug: "git-foundations-module-1-start-tracking",
    catalogSlug: "git",
    canUnlockAll: false,
    isAvailable: true,
    moduleExists: true,
    resolveModule,
};

describe("resolveReviewModulePageData", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resolveModule.mockResolvedValue(resolvedModule);
    });

    it("loads an active compiled module", async () => {
        const result = await resolveReviewModulePageData(baseArgs);

        expect(result).toMatchObject({
            status: "ready",
            mod: resolvedModule,
            catalogSlug: "git",
            canUnlockAll: false,
        });
        expect(resolveModule).toHaveBeenCalledTimes(1);
    });

    it("keeps an existing unpublished module out of the false-404 state", async () => {
        const result = await resolveReviewModulePageData({
            ...baseArgs,
            isAvailable: false,
        });

        expect(result).toMatchObject({
            status: "unavailable",
            mod: null,
        });
        expect(resolveModule).not.toHaveBeenCalled();
    });

    it("allows privileged reviewers to open unpublished modules", async () => {
        const result = await resolveReviewModulePageData({
            ...baseArgs,
            canUnlockAll: true,
            isAvailable: false,
        });

        expect(result).toMatchObject({
            status: "ready",
            mod: resolvedModule,
            canUnlockAll: true,
        });
        expect(resolveModule).toHaveBeenCalledTimes(1);
    });

    it("surfaces a compiled-registry disagreement as an invariant error, not a 404", async () => {
        resolveModule.mockResolvedValue(null);

        await expect(resolveReviewModulePageData(baseArgs)).rejects.toThrow(
            "Compiled module git-foundations/git-foundations-module-1-start-tracking exists",
        );
    });

    it("uses the missing state only when the compiled module is absent", async () => {
        const result = await resolveReviewModulePageData({
            ...baseArgs,
            moduleSlug: "missing-module",
            moduleExists: false,
        });

        expect(result).toMatchObject({
            status: "missing",
            mod: null,
        });
        expect(resolveModule).not.toHaveBeenCalled();
    });
});
