import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/runner/CodeRunner.tsx",
    ),
    "utf8",
);

describe("CodeRunner editor file-switch stability", () => {
    it("does not remount EditorPane when the active file model key changes", () => {
        expect(source).not.toContain("key={args.modelKey}");
        expect(source).toContain("modelKey={args.modelKey}");
    });

    it("preserves active-file-specific model identity", () => {
        expect(source).toContain("const effectiveEditorModelKey =");
        expect(source).toContain(
            '`${effectiveExerciseStateKey}:${workspaceFileIdForIdentity || "entry"}`',
        );
        expect(source).toContain("modelKey: effectiveEditorModelKey");
    });
});
