import { describe, expect, it } from "vitest";

import { pathOf } from "@/components/ide/fsTree";
import type { FSNode, WorkspaceStateV2 } from "@/components/ide/types";

import { mergeTerminalSnapshotIntoWorkspace } from "./mergeTerminalSnapshotIntoWorkspace";

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

function contentAtPath(workspace: WorkspaceStateV2, wantedPath: string) {
    const node = workspace.nodes.find(
        (candidate) =>
            candidate.kind === "file" &&
            pathOf(workspace.nodes, candidate.id) === wantedPath,
    );

    return node && node.kind === "file" ? node.content : null;
}

describe("mergeTerminalSnapshotIntoWorkspace", () => {
    it("keeps the synthetic src folder exactly once when terminal snapshot already includes src-prefixed files", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
            { id: "file:dem", name: "dem.txt", content: "old demo" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: "src/main.py", content: "print('new')" },
                { kind: "file", path: "src/dem.txt", content: "demo" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/dem.txt", "src/main.py"]);
        expect(allPaths(next)).not.toContain("src/src");
        expect(allPaths(next)).not.toContain("src/src/main.py");
    });

    it("preserves dirty UI content when the dirty path uses the real Explorer path", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('dirty ui')" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: "src/main.py", content: "print('runner')" },
            ],
            dirtyUiPaths: ["src/main.py"],
        });

        expect(contentAtPath(next, "src/main.py")).toBe("print('dirty ui')");
    });


    it("keeps terminal-created root files at the workspace root beside src", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "directory", path: "src" },
                { kind: "file", path: "src/main.py", content: "print('new')" },
                { kind: "file", path: "ft.txt", content: "created at root" },
            ],
        });

        expect(allPaths(next)).toEqual(["ft.txt", "src", "src/main.py"]);
        expect(allPaths(next)).not.toContain("src/ft.txt");
        expect(contentAtPath(next, "ft.txt")).toBe("created at root");
    });

    it("adds a new terminal-created file under src when the snapshot path is src-prefixed", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: "src/main.py", content: "print('new')" },
                { kind: "file", path: "src/helper.py", content: "def help(): pass" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/helper.py", "src/main.py"]);
        expect(allPaths(next)).not.toContain("src/src/helper.py");
    });

    it("creates nested folders beneath the synthetic src root without duplicating src", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: "src/utils/math.py", content: "def add(a, b): return a + b" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/utils", "src/utils/math.py"]);
        expect(allPaths(next)).not.toContain("src/src/utils");
        expect(allPaths(next)).not.toContain("src/src/utils/math.py");
    });

    it("does not strip src when the workspace root is not synthetic", () => {
        const prior = workspaceWithMultipleRoots();

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: "src/main.py", content: "print('new')" },
            ],
        });

        expect(allPaths(next)).toContain("src/main.py");
        expect(allPaths(next)).not.toContain("main.py");
    });

    it("ignores unsafe snapshot paths", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: "/abs.py", content: "bad" },
                { kind: "file", path: "../evil.py", content: "bad" },
                { kind: "file", path: "src/../evil.py", content: "bad" },
                { kind: "file", path: "", content: "bad" },
                { kind: "file", path: "src/\0evil.py", content: "bad" },
                { kind: "file", path: "src/main.py", content: "print('new')" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/main.py"]);
        expect(contentAtPath(next, "src/main.py")).toBe("print('new')");
    });

    it("ignores .bash_history from terminal snapshots and keeps a single src root", () => {
        const prior = workspaceWithSyntheticSrc([
            { id: "file:main", name: "main.py", content: "print('old')" },
        ]);

        const next = mergeTerminalSnapshotIntoWorkspace({
            prior,
            snapshotFiles: [
                { kind: "file", path: ".bash_history", content: "python src/main.py" },
                { kind: "file", path: "src/.bash_history", content: "python src/main.py" },
                { kind: "file", path: "src/main.py", content: "print('new')" },
            ],
        });

        expect(allPaths(next)).toEqual(["src", "src/main.py"]);
        expect(allPaths(next)).not.toContain(".bash_history");
        expect(allPaths(next)).not.toContain("src/src");
    });
});
