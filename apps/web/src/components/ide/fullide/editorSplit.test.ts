import { describe, expect, it } from "vitest";

import {
    EDITOR_SPLIT_DEFAULT_RATIO,
    EDITOR_SPLIT_MAX_RATIO,
    EDITOR_SPLIT_MIN_RATIO,
    clampEditorSplitRatio,
    resolveEditorSplitOrder,
    resolveEditorSplitRatioFromClientX,
} from "./editorSplit";

describe("resolveEditorSplitOrder", () => {
    it("places the secondary file on the left", () => {
        expect(
            resolveEditorSplitOrder({
                primary: "main.py",
                secondary: "notes.md",
                placement: "left",
            }),
        ).toEqual(["notes.md", "main.py"]);
    });

    it("places the secondary file on the right", () => {
        expect(
            resolveEditorSplitOrder({
                primary: "main.py",
                secondary: "notes.md",
                placement: "right",
            }),
        ).toEqual(["main.py", "notes.md"]);
    });
});

describe("editor split sizing", () => {
    it("clamps invalid and extreme ratios", () => {
        expect(clampEditorSplitRatio(Number.NaN)).toBe(
            EDITOR_SPLIT_DEFAULT_RATIO,
        );
        expect(clampEditorSplitRatio(0)).toBe(EDITOR_SPLIT_MIN_RATIO);
        expect(clampEditorSplitRatio(1)).toBe(EDITOR_SPLIT_MAX_RATIO);
    });

    it("resolves a pointer position against the split host", () => {
        expect(
            resolveEditorSplitRatioFromClientX({
                clientX: 500,
                left: 100,
                width: 800,
            }),
        ).toBe(0.5);
        expect(
            resolveEditorSplitRatioFromClientX({
                clientX: 100,
                left: 100,
                width: 800,
            }),
        ).toBe(EDITOR_SPLIT_MIN_RATIO);
    });
});
