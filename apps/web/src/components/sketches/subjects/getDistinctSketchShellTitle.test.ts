import { describe, expect, it } from "vitest";

import { getDistinctSketchShellTitle } from "./getDistinctSketchShellTitle";

describe("getDistinctSketchShellTitle", () => {
    it("hides an outer title that repeats the sketch heading", () => {
        expect(
            getDistinctSketchShellTitle("What a list is", "What a list is"),
        ).toBeUndefined();
    });

    it("normalizes markdown markers, whitespace, and case before comparing", () => {
        expect(
            getDistinctSketchShellTitle(
                "  WHAT   A `LIST` IS ",
                "What a list is",
            ),
        ).toBeUndefined();
    });

    it("keeps a useful outer navigation title when it is different", () => {
        expect(
            getDistinctSketchShellTitle(
                "Course introduction",
                "Welcome to Python Data and Functions",
            ),
        ).toBe("Course introduction");
    });
});
