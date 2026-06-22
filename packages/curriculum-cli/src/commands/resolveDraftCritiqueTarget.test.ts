import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedCompiler = vi.hoisted(() => ({
    resolveAuthoringCompileTarget: vi.fn(),
}));

vi.mock("@zoeskoul/curriculum-compiler", () => ({
    resolveAuthoringCompileTarget: mockedCompiler.resolveAuthoringCompileTarget,
}));

import { resolveDraftCritiqueTarget } from "./resolveDraftCritiqueTarget.js";

describe("resolveDraftCritiqueTarget", () => {
    beforeEach(() => {
        mockedCompiler.resolveAuthoringCompileTarget.mockReset();
    });

    it("resolves the generated draft subject slug for authoring course blueprints", async () => {
        mockedCompiler.resolveAuthoringCompileTarget.mockResolvedValueOnce({
            liveSubjectSlug: "linux--linux-terminal-fundamentals--draft",
        });

        await expect(
            resolveDraftCritiqueTarget(
                "/Users/admin/Documents/NextJSProject/zoeskoul.com/authoring/subjects/linux/courses/linux-terminal-fundamentals/course.blueprint.json",
            ),
        ).resolves.toEqual({
            draftSubjectSlug: "linux--linux-terminal-fundamentals--draft",
        });

        expect(mockedCompiler.resolveAuthoringCompileTarget).toHaveBeenCalledWith({
            subjectSlug: "linux",
            courseSlug: "linux-terminal-fundamentals",
            options: {
                draftOnly: true,
            },
        });
    });

    it("skips resolution for non-authoring blueprint paths", async () => {
        await expect(
            resolveDraftCritiqueTarget("/tmp/course.blueprint.json"),
        ).resolves.toEqual({
            draftSubjectSlug: undefined,
        });

        expect(mockedCompiler.resolveAuthoringCompileTarget).not.toHaveBeenCalled();
    });
});
