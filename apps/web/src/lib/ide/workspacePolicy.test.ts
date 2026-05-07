import { describe, expect, it } from "vitest";
import {
    resolveWorkspacePolicy,
    validateWorkspaceState,
} from "@/lib/ide/workspacePolicy";
import type { WorkspaceStateV2 } from "@/components/ide/types";

function buildWorkspace(overrides?: Partial<WorkspaceStateV2>): WorkspaceStateV2 {
    return {
        version: 2,
        language: "python",
        nodes: [
            {
                id: "main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "print('hello')\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["main.py"],
        activeFileId: "main.py",
        entryFileId: "main.py",
        stdin: "",
        expanded: [],
        leftPct: 32,
        ...overrides,
    };
}

describe("validateWorkspaceState", () => {
    it("accepts a valid multi-file workspace", () => {
        const workspace = buildWorkspace({
            language: "sql",
            nodes: [
                {
                    id: "queries",
                    kind: "folder",
                    name: "queries",
                    parentId: null,
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "queries/query.sql",
                    kind: "file",
                    name: "query.sql",
                    parentId: "queries",
                    content: "select * from inventory_items;",
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "notes.sql",
                    kind: "file",
                    name: "notes.sql",
                    parentId: null,
                    content: "-- notes",
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            openTabs: ["queries/query.sql", "notes.sql"],
            activeFileId: "queries/query.sql",
            entryFileId: "queries/query.sql",
            expanded: ["queries"],
            stdin: "",
        });

        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "sql",
        );

        expect(validateWorkspaceState(workspace, policy)).toEqual([]);
    });

    it("rejects oversize stdin and broken file references", () => {
        const workspace = buildWorkspace({
            openTabs: ["missing.py"],
            stdin: "x".repeat(70_000),
        });

        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: false,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
        );

        expect(validateWorkspaceState(workspace, policy)[0]).toMatch(/stdin exceeds/i);
    });
});
