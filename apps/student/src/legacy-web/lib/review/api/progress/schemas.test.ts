import { describe, expect, it } from "vitest";
import {
    ReviewProgressWriteSchema,
    REVIEW_PROGRESS_LIMITS,
} from "@/lib/review/api/progress/schemas";
import type { WorkspaceStateV2 } from "@/components/ide/types";

function buildWorkspace(language: WorkspaceStateV2["language"] = "python"): WorkspaceStateV2 {
    return {
        version: 2,
        language,
        nodes: [
            {
                id: "src",
                kind: "folder",
                name: "src",
                parentId: null,
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "src/main.py",
                kind: "file",
                name: "main.py",
                parentId: "src",
                content: "print('saved review workspace')\n",
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "src/helper.py",
                kind: "file",
                name: "helper.py",
                parentId: "src",
                content: "def helper():\n    return 42\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["src/main.py", "src/helper.py"],
        activeFileId: "src/helper.py",
        entryFileId: "src/main.py",
        stdin: "7\n8\n",
        expanded: ["src"],
        leftPct: 38,
    };
}

describe("ReviewProgressWriteSchema", () => {
    it("accepts persisted exercise and sketch workspaces with runtimeStateV2", () => {
        const workspace = buildWorkspace();
        const sqlWorkspace = buildWorkspace("sql");

        const parsed = ReviewProgressWriteSchema.safeParse({
            subjectSlug: "sql",
            moduleSlug: "sql_module_12",
            locale: "en",
            state: {
                activeTopicId: "what-update-does",
                topics: {
                    "section_12_1.what-update-does": {
                        runtimeStateV2: {
                            exercises: {
                                "sql:sql_module_12:section_12_1:what-update-does:q1": {
                                    language: "python",
                                    lang: "python",
                                    workspace,
                                    codeWorkspace: workspace,
                                    ideWorkspace: workspace,
                                    stdin: workspace.stdin,
                                    codeStdin: workspace.stdin,
                                    code: "print('saved review workspace')",
                                    source: "print('saved review workspace')",
                                    userEdited: true,
                                    workspaceOrigin: "user",
                                },
                            },
                            cards: {
                                sk1: {
                                    language: "sql",
                                    workspace: sqlWorkspace,
                                    toolWorkspace: sqlWorkspace,
                                    toolCode: "select * from inventory_items;",
                                    toolStdin: "",
                                    workspaceOrigin: "saved",
                                },
                            },
                        },
                    },
                },
            },
        });

        expect(parsed.success).toBe(true);
    });

    it("rejects invalid state containers", () => {
        const parsed = ReviewProgressWriteSchema.safeParse({
            subjectSlug: "sql",
            moduleSlug: "sql_module_12",
            locale: "en",
            state: [],
        });

        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues.some((issue) => String(issue.message).includes("Missing/invalid state"))).toBe(true);
    });

    it("rejects oversized persisted workspaces", () => {
        const hugeWorkspace = buildWorkspace();
        hugeWorkspace.nodes = hugeWorkspace.nodes.map((node) =>
            node.kind === "file"
                ? {
                    ...node,
                    content: "x".repeat(REVIEW_PROGRESS_LIMITS.maxCodeFieldBytes + 64),
                }
                : node,
        );

        const parsed = ReviewProgressWriteSchema.safeParse({
            subjectSlug: "sql",
            moduleSlug: "sql_module_12",
            locale: "en",
            state: {
                topics: {
                    topic: {
                        runtimeStateV2: {
                            exercises: {
                                q1: {
                                    workspace: hugeWorkspace,
                                },
                            },
                        },
                    },
                },
            },
        });

        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues.some((issue) => String(issue.message).includes("byte limit"))).toBe(true);
    });
});
