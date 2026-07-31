import { describe, expect, it } from "vitest";

import { pathOf } from "@/components/ide/fsTree";
import type { FSNode, WorkspaceStateV2 } from "@/components/ide/types";

import { mergeWorkspaceWithTerminalSnapshot } from "./workspaceTerminalSync";

function folderNode(id: string, name: string, parentId: string | null): FSNode {
    return {
        id,
        kind: "folder",
        name,
        parentId,
        createdAt: 0,
        updatedAt: 0,
    };
}

function fileNode(
    id: string,
    name: string,
    parentId: string | null,
    content: string,
): FSNode {
    return {
        id,
        kind: "file",
        name,
        parentId,
        content,
        createdAt: 0,
        updatedAt: 0,
    };
}

function workspaceWithSyntheticSrc(
    files: Array<{ id: string; name: string; content: string; parentId?: string }>,
): WorkspaceStateV2 {
    const nodes: FSNode[] = [folderNode("folder:src", "src", null)];

    for (const file of files) {
        nodes.push(
            fileNode(
                file.id,
                file.name,
                file.parentId ?? "folder:src",
                file.content,
            ),
        );
    }

    return {
        version: 2,
        language: "python",
        nodes,
        openTabs: files[0] ? [files[0].id] : [],
        activeFileId: files[0]?.id ?? "",
        entryFileId: files[0]?.id ?? "",
        stdin: "",
        expanded: ["folder:src"],
        leftPct: 26,
    };
}

function workspaceWithMultipleRoots(): WorkspaceStateV2 {
    return {
        version: 2,
        language: "python",
        nodes: [
            folderNode("folder:src", "src", null),
            folderNode("folder:tests", "tests", null),
            fileNode("file:main", "main.py", "folder:src", "print('old')"),
        ],
        openTabs: ["file:main"],
        activeFileId: "file:main",
        entryFileId: "file:main",
        stdin: "",
        expanded: ["folder:src", "folder:tests"],
        leftPct: 26,
    };
}

function allPaths(workspace: WorkspaceStateV2) {
    return workspace.nodes.map((node) => pathOf(workspace.nodes, node.id)).sort();
}

describe("workspaceTerminalSync cloud merge", () => {
    it("keeps src-prefixed snapshot files under a single synthetic src root", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: "src/main.py", content: "print('new')" },
                { path: "src/dem.txt", content: "demo" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/dem.txt", "src/main.py"]);
        expect(allPaths(next)).not.toContain("src/src");
        expect(allPaths(next)).not.toContain("src/src/main.py");
    });


    it("keeps terminal-created root files at the cloud workspace root beside src", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: "src/main.py", content: "print('new')" },
                { path: "ft.txt", content: "created at root" },
            ],
        });

        expect(allPaths(next)).toEqual(["ft.txt", "src", "src/main.py"]);
        expect(allPaths(next)).not.toContain("src/ft.txt");
    });

    it("adds src-prefixed files beneath src without flattening or duplicating the root", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: "src/main.py", content: "print('new')" },
                { path: "src/helper.py", content: "def help(): pass" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/helper.py", "src/main.py"]);
        expect(allPaths(next)).not.toContain("helper.py");
        expect(allPaths(next)).not.toContain("src/src/helper.py");
    });

    it("creates nested folders under synthetic src without creating src/src", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: "src/utils/math.py", content: "def add(a, b): return a + b" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/utils", "src/utils/math.py"]);
        expect(allPaths(next)).not.toContain("src/src/utils");
        expect(allPaths(next)).not.toContain("src/src/utils/math.py");
    });

    it("does not strip src when the workspace root is not synthetic", () => {
        const prior = workspaceWithMultipleRoots();

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [{ path: "src/main.py", content: "print('new')" }],
        });

        expect(allPaths(next)).toContain("src/main.py");
        expect(allPaths(next)).not.toContain("main.py");
    });

    it("ignores unsafe snapshot paths for the API/cloud-sync merge path", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: "/abs.py", content: "bad" },
                { path: "../evil.py", content: "bad" },
                { path: "src/../evil.py", content: "bad" },
                { path: "", content: "bad" },
                { path: "src/\0evil.py", content: "bad" },
                { path: "src/main.py", content: "print('new')" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/main.py"]);
    });

    it("ignores .bash_history when syncing terminal snapshots into workspace state", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: ".bash_history", content: "python src/main.py" },
                { path: "src/.bash_history", content: "python src/main.py" },
                { path: "src/main.py", content: "print('new')" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/main.py"]);
        expect(allPaths(next)).not.toContain(".bash_history");
        expect(allPaths(next)).not.toContain("src/src");
    });

    it("preserves empty directories from terminal snapshots", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeWorkspaceWithTerminalSnapshot({
            prior,
            files: [
                { path: "src/main.py", content: "print('new')" },
                { kind: "directory", path: "semester" },
                { kind: "directory", path: "semester/notes" },
                { kind: "directory", path: "semester/assignments" },
                { kind: "directory", path: "semester/scripts" },
                { kind: "directory", path: "backups" },
            ],
        });

        expect(allPaths(next)).toEqual([
            "backups",
            "semester",
            "semester/assignments",
            "semester/notes",
            "semester/scripts",
            "src",
            "src/main.py",
        ]);
    });

});
