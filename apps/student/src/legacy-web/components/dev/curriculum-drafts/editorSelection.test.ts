import { describe, expect, it } from "vitest";
import { draftFilePairKey, keepEditorSelection } from "./editorSelection";

describe("keepEditorSelection", () => {
  it("keeps the current editor item when it still exists after a save reload", () => {
    expect(keepEditorSelection("exercise-b", ["exercise-a", "exercise-b"], "exercise-a")).toBe("exercise-b");
  });

  it("uses the preferred fallback when the current item was removed", () => {
    expect(keepEditorSelection("removed", ["exercise-a", "exercise-b"], "exercise-b")).toBe("exercise-b");
  });

  it("uses the first available item when no preferred fallback exists", () => {
    expect(keepEditorSelection(null, ["sketch-a", "sketch-b"])).toBe("sketch-a");
  });

  it("returns null when the refreshed editor has no selectable items", () => {
    expect(keepEditorSelection("exercise-a", [])).toBeNull();
  });
});

describe("draftFilePairKey", () => {
  it("uses exercise and path so a selected file remains stable across refreshed objects", () => {
    expect(draftFilePairKey({ exerciseId: "try-status", path: "README.md" })).toBe("try-status:README.md");
  });
});
