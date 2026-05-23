import { describe, expect, it } from "vitest";

import { resolveToolStateSeed } from "./useToolCodeRunnerState";

describe("resolveToolStateSeed", () => {
    it("rejects stale Python saved state when the unbound tool now defaults to SQL", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                language: "python",
                code: 'print("Hello Python!")',
                workspace: {
                    version: 2,
                    language: "python",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: 'print("Hello Python!")',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    activeFileId: "file:main.py",
                    entryFileId: "file:main.py",
                    stdin: "",
                    expanded: [],
                    leftPct: 40,
                },
            },
            defaultLang: "sql",
            defaultCode: "SELECT 'Hello SQL' AS message;",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialLang).toBe("sql");
        expect(resolved.initialCode).toContain("SELECT");
        expect(resolved.initialCode).not.toContain("Hello Python");
        expect(resolved.initialWorkspace).toBeNull();
    });
});
