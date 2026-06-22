import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedCompiler = vi.hoisted(() => ({
    loadBlueprint: vi.fn(),
    critiqueSubjectDraft: vi.fn(),
}));

const mockedResolver = vi.hoisted(() => ({
    resolveDraftCritiqueTarget: vi.fn(),
}));

vi.mock("@zoeskoul/curriculum-compiler", () => ({
    loadBlueprint: mockedCompiler.loadBlueprint,
    critiqueSubjectDraft: mockedCompiler.critiqueSubjectDraft,
}));

vi.mock("./resolveDraftCritiqueTarget.js", () => ({
    resolveDraftCritiqueTarget: mockedResolver.resolveDraftCritiqueTarget,
}));

vi.mock("@zoeskoul/curriculum-ai", () => ({
    openAiProvider: {},
}));

import { runCritiqueSubjectDraft } from "./critique-subject-draft.js";

describe("runCritiqueSubjectDraft", () => {
    beforeEach(() => {
        mockedCompiler.loadBlueprint.mockReset();
        mockedCompiler.critiqueSubjectDraft.mockReset();
        mockedResolver.resolveDraftCritiqueTarget.mockReset();
        mockedCompiler.loadBlueprint.mockResolvedValue({
            subjectSlug: "linux",
            courseSlug: "linux-terminal-fundamentals",
        });
        mockedResolver.resolveDraftCritiqueTarget.mockResolvedValue({
            draftSubjectSlug: "linux--linux-terminal-fundamentals--draft",
        });
        mockedCompiler.critiqueSubjectDraft.mockResolvedValue({
            mode: "draft",
            subjectSlug: "linux--linux-terminal-fundamentals--draft",
            topics: [],
        });
    });

    it("passes the resolved draft subject slug into compiler critique", async () => {
        await runCritiqueSubjectDraft(
            "/Users/admin/Documents/NextJSProject/zoeskoul.com/authoring/subjects/linux/courses/linux-terminal-fundamentals/course.blueprint.json",
        );

        expect(mockedCompiler.critiqueSubjectDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                blueprint: expect.objectContaining({
                    subjectSlug: "linux",
                    courseSlug: "linux-terminal-fundamentals",
                }),
                draftSubjectSlug: "linux--linux-terminal-fundamentals--draft",
            }),
        );
    });
});
