import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/runner/components/WebPreview.tsx",
    ),
    "utf8",
);

describe("WebPreview iframe lifecycle", () => {
    it("does not replace the iframe for ordinary bridge/content identity changes", () => {
        expect(source).toContain("key={refreshRevision}");
        expect(source).not.toContain("key={bridgeId}");
    });

    it("keeps bridge identity tied to real content/session state", () => {
        expect(source).toContain("hashWebPreviewContent(");
        expect(source).toContain("props.entries");
        expect(source).toContain("props.sessionKey");
        expect(source).toContain("virtualPath");
        expect(source).toContain("refreshRevision");
    });

    it("canonicalizes workspace entry ordering before hashing", () => {
        expect(source).toContain("const canonicalEntries = entries");
        expect(source).toContain(".sort(");
        expect(source).toContain("left.path.localeCompare(right.path)");
    });
});
