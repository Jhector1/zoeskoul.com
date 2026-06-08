import { describe, expect, it } from "vitest";

import type { FSNode } from "@/components/ide/types";

import {
    detectSyntheticSrcRoot,
    isRunnerManagedWorkspacePath,
    normalizeSafeRelativePath,
    normalizeUiProjectPath,
    splitSafeRelativePath,
} from "./workspacePathMapping";

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

describe("workspacePathMapping", () => {
    it.each([
        "/abs.py",
        "../evil.py",
        "src/../evil.py",
        "",
        "src/\0evil.py",
        ".",
        "src/./main.py",
    ])("rejects unsafe relative paths: %j", (input) => {
        expect(splitSafeRelativePath(input)).toEqual([]);
        expect(normalizeSafeRelativePath(input)).toBe("");
    });

    it("strips the synthetic src prefix exactly once for UI paths", () => {
        expect(normalizeUiProjectPath("src/main.py", "src")).toBe("main.py");
        expect(normalizeUiProjectPath("main.py", "src")).toBe("main.py");
    });

    it("preserves src when no synthetic root should be stripped", () => {
        expect(normalizeUiProjectPath("src/main.py", null)).toBe("src/main.py");
    });


    it("treats .bash_history as runner-managed even if an old sync put it under src", () => {
        expect(isRunnerManagedWorkspacePath(".bash_history")).toBe(true);
        expect(isRunnerManagedWorkspacePath("src/.bash_history")).toBe(true);
        expect(isRunnerManagedWorkspacePath("notes/history.txt")).toBe(false);
    });

    it("detects a synthetic src root only when it is the lone top-level folder", () => {
        const syntheticNodes = [
            folderNode("folder:src", "src", null),
            fileNode("file:main", "main.py", "folder:src", "print('main')"),
        ];
        const nonSyntheticNodes = [
            folderNode("folder:src", "src", null),
            folderNode("folder:tests", "tests", null),
            fileNode("file:main", "main.py", "folder:src", "print('main')"),
        ];

        expect(detectSyntheticSrcRoot(syntheticNodes)?.name).toBe("src");
        expect(detectSyntheticSrcRoot(nonSyntheticNodes)).toBeNull();
    });
});
