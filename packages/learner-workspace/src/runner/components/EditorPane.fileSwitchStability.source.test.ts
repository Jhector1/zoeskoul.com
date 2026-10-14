import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/runner/components/EditorPane.tsx",
    ),
    "utf8",
);

describe("EditorPane file-switch stability", () => {
    it("does not remount Monaco when only the selected file path changes", () => {
        expect(source).not.toContain("key={path}");
        expect(source).toContain("path={path}");
    });

    it("preserves Monaco model and view-state switching", () => {
        expect(source).toContain("keepCurrentModel");
        expect(source).toContain("saveViewState");
        expect(source).toContain(
            'import { ClientOnlyMonacoEditor as Monaco } from "@zoeskoul/editor-surface";',
        );
    });
});
