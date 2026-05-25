import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedCompiler = vi.hoisted(() => ({
    resolveAuthoringCompileTarget: vi.fn(),
    publishDraftToLive: vi.fn(),
}));

vi.mock("@zoeskoul/curriculum-compiler", () => ({
    resolveAuthoringCompileTarget: mockedCompiler.resolveAuthoringCompileTarget,
    publishDraftToLive: mockedCompiler.publishDraftToLive,
}));

import {
    parsePublishCourseArgs,
    runPublishCourse,
} from "./publish-course.js";

describe("publish-course CLI args", () => {
    it("does not require --live-subject", () => {
        expect(parsePublishCourseArgs(["--force"])).toEqual({
            liveSubjectSlug: undefined,
            force: true,
            forceLiveOverwrite: false,
        });
    });

    it("parses explicit live subject overrides", () => {
        expect(
            parsePublishCourseArgs([
                "--live-subject",
                "python-v2",
                "--force-live-overwrite",
            ]),
        ).toEqual({
            liveSubjectSlug: "python-v2",
            force: false,
            forceLiveOverwrite: true,
        });
    });
});

describe("runPublishCourse", () => {
    beforeEach(() => {
        mockedCompiler.resolveAuthoringCompileTarget.mockReset();
        mockedCompiler.publishDraftToLive.mockReset();
    });

    it("publishes a checked draft into the resolved live subject", async () => {
        mockedCompiler.resolveAuthoringCompileTarget
            .mockResolvedValueOnce({
                authoringSubjectSlug: "python",
                courseSlug: "python-data-functions",
                liveSubjectSlug: "python-v2",
            })
            .mockResolvedValueOnce({
                authoringSubjectSlug: "python",
                courseSlug: "python-data-functions",
                liveSubjectSlug: "python--python-data-functions--draft",
            });

        await runPublishCourse("python", "python-data-functions", ["--force"]);

        expect(mockedCompiler.resolveAuthoringCompileTarget).toHaveBeenNthCalledWith(1, {
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                liveSubjectSlug: undefined,
                forceLiveOverwrite: true,
            },
        });
        expect(mockedCompiler.resolveAuthoringCompileTarget).toHaveBeenNthCalledWith(2, {
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                draftOnly: true,
            },
        });
        expect(mockedCompiler.publishDraftToLive).toHaveBeenCalledWith({
            draftSubjectSlug: "python--python-data-functions--draft",
            liveSubjectSlug: "python-v2",
        });
    });

    it("refuses when publish resolves a different course", async () => {
        mockedCompiler.resolveAuthoringCompileTarget.mockResolvedValueOnce({
            authoringSubjectSlug: "python",
            courseSlug: "different-course",
            liveSubjectSlug: "python-v2",
        });

        await expect(
            runPublishCourse("python", "python-data-functions"),
        ).rejects.toThrow(
            "Course publish resolved the wrong course: requested python-data-functions but resolved different-course. Aborting.",
        );
        expect(mockedCompiler.publishDraftToLive).not.toHaveBeenCalled();
    });
});
