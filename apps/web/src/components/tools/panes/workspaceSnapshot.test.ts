import { describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import { extractRuntimeSnapshotFromWorkspace } from "@/components/tools/panes/workspaceSnapshot";

function buildWorkspace(): WorkspaceStateV2 {
    return {
        version: 2,
        language: "python",
        nodes: [
            {
                id: "main",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "print('run me')\n",
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "output",
                kind: "file",
                name: "output.txt",
                parentId: null,
                content: "Hello, rt5566tttt!\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["main", "output"],
        activeFileId: "output",
        entryFileId: "main",
        stdin: "abc",
        expanded: [],
        leftPct: 26,
    };
}

describe("extractRuntimeSnapshotFromWorkspace", () => {
    it("uses the entry file for runtime code even when another tab is active", () => {
        expect(extractRuntimeSnapshotFromWorkspace(buildWorkspace())).toEqual({
            code: "print('run me')\n",
            stdin: "abc",
        });
    });
});
