import { describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import {
    extractRuntimeSnapshotFromWorkspace,
    selectWorkspaceForSubmit,
} from "@/components/tools/panes/workspaceSnapshot";

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

describe("selectWorkspaceForSubmit", () => {
    const staleWorkspace = buildWorkspace();
    const liveWorkspace: WorkspaceStateV2 = {
        ...buildWorkspace(),
        nodes: buildWorkspace().nodes.map((node) =>
            node.kind === "file" && node.id === "main"
                ? { ...node, content: "SELECT * FROM sales_reporting WHERE order_status IS 'Pending';\n" }
                : node,
        ),
    };

    it("keeps the just-flushed Monaco workspace while the rendered workspace is one tick behind", () => {
        expect(
            selectWorkspaceForSubmit({
                contextKey: "sql-topic:exercise-1",
                pendingWorkspace: undefined,
                lastFlushed: {
                    contextKey: "sql-topic:exercise-1",
                    workspace: liveWorkspace,
                },
                currentWorkspace: staleWorkspace,
            }),
        ).toBe(liveWorkspace);
    });

    it("prefers a newer pending edit over the last flushed workspace", () => {
        const newerWorkspace = {
            ...liveWorkspace,
            stdin: "newer",
        };

        expect(
            selectWorkspaceForSubmit({
                contextKey: "sql-topic:exercise-1",
                pendingWorkspace: newerWorkspace,
                lastFlushed: {
                    contextKey: "sql-topic:exercise-1",
                    workspace: liveWorkspace,
                },
                currentWorkspace: staleWorkspace,
            }),
        ).toBe(newerWorkspace);
    });

    it("does not reuse a flushed workspace after the exercise context changes", () => {
        expect(
            selectWorkspaceForSubmit({
                contextKey: "sql-topic:exercise-2",
                pendingWorkspace: undefined,
                lastFlushed: {
                    contextKey: "sql-topic:exercise-1",
                    workspace: liveWorkspace,
                },
                currentWorkspace: staleWorkspace,
            }),
        ).toBe(staleWorkspace);
    });
});
