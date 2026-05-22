import { describe, expect, it } from "vitest";
import { parseCompileCourseArgs } from "./compile-course.js";

describe("compile-course CLI args", () => {
    it("parses explicit live subject", () => {
        expect(parseCompileCourseArgs(["--live-subject", "sql-preview"])).toEqual({
            liveSubjectSlug: "sql-preview",
            resume: false,
            forceLiveOverwrite: false,
        });
    });

    it("parses resume", () => {
        expect(parseCompileCourseArgs(["--resume"])).toEqual({
            liveSubjectSlug: undefined,
            resume: true,
            forceLiveOverwrite: false,
        });
    });

    it("parses forced live overwrite", () => {
        expect(
            parseCompileCourseArgs([
                "--live-subject",
                "sql",
                "--force-live-overwrite",
            ]),
        ).toEqual({
            liveSubjectSlug: "sql",
            resume: false,
            forceLiveOverwrite: true,
        });
    });

    it("requires a live subject value", () => {
        expect(() => parseCompileCourseArgs(["--live-subject"])).toThrow(
            /requires a live subject slug/,
        );
    });
});
