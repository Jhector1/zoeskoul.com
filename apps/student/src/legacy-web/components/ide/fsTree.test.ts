import { describe, expect, it } from "vitest";

import type { FSNode, WorkspaceStateV2 } from "./types";
import { exportProjectFiles, exportWorkspaceEntries, relativeProjectPathOf } from "./fsTree";

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

function syntheticSrcNodes(): WorkspaceStateV2["nodes"] {
    return [
        folderNode("folder:src", "src", null),
        fileNode("file:main", "main.py", "folder:src", "print('main')"),
        fileNode("file:dem", "dem.txt", "folder:src", "demo"),
    ];
}

describe("fsTree path mapping", () => {
    it("preserves top-level folders when there is no synthetic project root", () => {
        const nodes = [
            folderNode("folder:data", "data", null),
            fileNode("file:message", "message.txt", "folder:data", "hello"),
        ];

        expect(relativeProjectPathOf(nodes, "file:message")).toBe("data/message.txt");
    });

    it("preserves the top-level src folder for project and workspace exports", () => {
        const nodes = syntheticSrcNodes();

        expect(
            exportProjectFiles(nodes).sort((a, b) => a.path.localeCompare(b.path)),
        ).toEqual([
            { kind: "file", path: "src/dem.txt", content: "demo" },
            { kind: "file", path: "src/main.py", content: "print('main')" },
        ]);

        expect(exportWorkspaceEntries(nodes)).toEqual([
            { kind: "directory", path: "src" },
            { kind: "file", path: "src/dem.txt", content: "demo" },
            { kind: "file", path: "src/main.py", content: "print('main')" },
        ]);
    });

    it("never flattens src/main.py into main.py for workspace sync exports", () => {
        const entries = exportWorkspaceEntries(syntheticSrcNodes());

        expect(entries.some((entry) => entry.path === "main.py")).toBe(false);
        expect(entries).toContainEqual({
            kind: "file",
            path: "src/main.py",
            content: "print('main')",
        });
    });


    it("can still strip a synthetic src root when a legacy caller opts in", () => {
        const nodes = syntheticSrcNodes();

        expect(relativeProjectPathOf(nodes, "file:main", { stripSyntheticRoot: true })).toBe("main.py");
        expect(
            exportProjectFiles(nodes, { stripSyntheticRoot: true }).sort((a, b) =>
                a.path.localeCompare(b.path),
            ),
        ).toEqual([
            { kind: "file", path: "dem.txt", content: "demo" },
            { kind: "file", path: "main.py", content: "print('main')" },
        ]);
    });

    it("does not strip src when multiple top-level folders exist", () => {
        const nodes = [
            folderNode("folder:src", "src", null),
            folderNode("folder:tests", "tests", null),
            fileNode("file:main", "main.py", "folder:src", "print('main')"),
        ];

        expect(relativeProjectPathOf(nodes, "file:main")).toBe("src/main.py");
        expect(exportProjectFiles(nodes)).toEqual([
            { kind: "file", path: "src/main.py", content: "print('main')" },
        ]);
    });

    it("exports binary files without converting their bytes to text", () => {
        const nodes: FSNode[] = [
            folderNode("folder:assets", "assets", null),
            {
                id: "file:image",
                kind: "file",
                name: "pixel.png",
                parentId: "folder:assets",
                content: "",
                binary: {
                    encoding: "base64",
                    data: "AAECAw==",
                    mimeType: "image/png",
                    sizeBytes: 4,
                    checksum:
                        "sha256:054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8",
                },
                createdAt: 0,
                updatedAt: 0,
            },
        ];

        expect(exportProjectFiles(nodes)).toEqual([
            {
                kind: "file",
                path: "assets/pixel.png",
                encoding: "base64",
                data: "AAECAw==",
                mimeType: "image/png",
                sizeBytes: 4,
                checksum:
                    "sha256:054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8",
            },
        ]);
        expect(exportWorkspaceEntries(nodes)).toEqual([
            { kind: "directory", path: "assets" },
            {
                kind: "file",
                path: "assets/pixel.png",
                encoding: "base64",
                data: "AAECAw==",
                mimeType: "image/png",
                sizeBytes: 4,
                checksum:
                    "sha256:054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8",
            },
        ]);
    });

});
