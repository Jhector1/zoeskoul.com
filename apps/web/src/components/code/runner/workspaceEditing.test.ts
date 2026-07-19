import { describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import { resolveEditableWorkspaceFileId } from "@/components/code/runner/workspaceEditing";

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
                content: "print('main')\n",
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "output",
                kind: "file",
                name: "output.txt",
                parentId: null,
                content: "runner output\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["main", "output"],
        activeFileId: "output",
        entryFileId: "main",
        stdin: "",
        expanded: [],
        leftPct: 26,
    };
}

describe("resolveEditableWorkspaceFileId", () => {
    it("prefers the explicit editor file when it exists", () => {
        expect(resolveEditableWorkspaceFileId(buildWorkspace(), "output")).toBe("output");
    });

    it("falls back to the active workspace file before the entry file", () => {
        expect(resolveEditableWorkspaceFileId(buildWorkspace(), "missing")).toBe("output");
    });

    it("falls back to the entry file when the active file is invalid", () => {
        const workspace = {
            ...buildWorkspace(),
            activeFileId: "missing",
        };

        expect(resolveEditableWorkspaceFileId(workspace, null)).toBe("main");
    });

    it("never resolves a binary file as Monaco-editable", () => {
        const workspace = buildWorkspace();
        workspace.nodes.push({
            id: "image",
            kind: "file",
            name: "pixel.png",
            parentId: null,
            content: "",
            binary: {
                encoding: "base64",
                data: "AAECAw==",
                mimeType: "image/png",
                sizeBytes: 4,
            },
            createdAt: 1,
            updatedAt: 1,
        });
        workspace.activeFileId = "image";
        workspace.openTabs.push("image");

        expect(resolveEditableWorkspaceFileId(workspace, "image")).toBe("main");
    });

});
