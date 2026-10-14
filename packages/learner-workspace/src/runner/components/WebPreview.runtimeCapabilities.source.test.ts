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

describe("WebPreview runtime capabilities", () => {
    it("allows learner form submission without weakening origin isolation", () => {
        expect(source).toContain(
            'sandbox="allow-scripts allow-forms allow-modals"',
        );
        expect(source).not.toContain("allow-same-origin");
    });

    it("keeps the existing shared console bridge and adds virtual workspace fetch", () => {
        expect(source).toContain("buildWebPreviewBridgeScript");
        expect(source).toContain("buildWebPreviewVirtualFetchScript");
        expect(source).toContain("zoeskoulVirtualWorkspaceFetch");
        expect(source).toContain("new Response(");
    });
});
