import { describe, expect, it } from "vitest";
import { resolveToolStateSeed } from "./useToolCodeRunnerState";

describe("resolveToolStateSeed placeholder filtering", () => {
    it("drops blank non-user exercise snapshots even when defaultCode is empty", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                language: "python",
                code: "",
                workspace: {
                    version: 2,
                    language: "python",
                    entryFileId: "main.py",
                    activeFileId: "main.py",
                    openTabs: ["main.py"],
                    expanded: [],
                    stdin: "",
                    nodes: [
                        {
                            id: "main.py",
                            kind: "file",
                            name: "main.py",
                            content: "",
                            parentId: null,
                        },
                    ],
                },
            },
            defaultLang: "python",
            defaultCode: "",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialCode).toBe("");
        expect(resolved.initialWorkspace).toBeNull();
    });

    it("keeps real learner work when the saved workspace is nonblank", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                language: "python",
                code: "age = 12\nprint(age)\n",
                userEdited: true,
                workspaceOrigin: "user",
                workspace: {
                    version: 2,
                    language: "python",
                    entryFileId: "main.py",
                    activeFileId: "main.py",
                    openTabs: ["main.py"],
                    expanded: [],
                    stdin: "",
                    nodes: [
                        {
                            id: "main.py",
                            kind: "file",
                            name: "main.py",
                            content: "age = 12\nprint(age)\n",
                            parentId: null,
                        },
                    ],
                },
            },
            defaultLang: "python",
            defaultCode: "",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).not.toBeNull();
        expect(resolved.initialCode).toContain("age = 12");
    });

    it("drops unresolved i18n starter aliases from passive exercise snapshots", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                language: "python",
                code: "@:topics.python-v2.module1.topic1.starterCode",
                workspaceOrigin: "saved",
                workspace: {
                    version: 2,
                    language: "python",
                    entryFileId: "main.py",
                    activeFileId: "main.py",
                    openTabs: ["main.py"],
                    expanded: [],
                    stdin: "",
                    nodes: [
                        {
                            id: "main.py",
                            kind: "file",
                            name: "main.py",
                            content: "@:topics.python-v2.module1.topic1.starterCode",
                            parentId: null,
                        },
                    ],
                },
            },
            defaultLang: "python",
            defaultCode: "",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialCode).toBe("");
        expect(resolved.initialWorkspace).toBeNull();
    });
});
