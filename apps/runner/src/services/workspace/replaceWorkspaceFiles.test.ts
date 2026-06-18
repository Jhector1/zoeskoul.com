import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { replaceWorkspaceFiles } from "./replaceWorkspaceFiles.js";

describe("replaceWorkspaceFiles", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-replace-test-"));
    });

    afterEach(async () => {
        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    });

    it("preserves .bash_history while replacing user files", async () => {
        await fs.writeFile(path.join(root, ".bash_history"), "echo hello\n");
        await fs.writeFile(path.join(root, "old.py"), "print('old')\n");

        const result = await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "src/main.py",
                content: "print('new')\n",
            },
        ]);

        await expect(fs.access(path.join(root, ".bash_history"))).resolves.toBeUndefined();
        await expect(fs.readFile(path.join(root, "src", "main.py"), "utf8")).resolves.toBe(
            "print('new')\n",
        );
        await expect(fs.access(path.join(root, "old.py"))).rejects.toThrow();
        expect(result).toEqual({ fileCount: 1 });
    });

    it("ignores runner-managed metadata entries supplied by callers", async () => {
        const result = await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: ".bash_history",
                content: "should be ignored\n",
            },
            {
                kind: "directory",
                path: "build",
            },
            {
                kind: "file",
                path: "src/main.py",
                content: "print('ok')\n",
            },
        ]);

        await expect(fs.readFile(path.join(root, "src", "main.py"), "utf8")).resolves.toBe(
            "print('ok')\n",
        );
        await expect(fs.readFile(path.join(root, ".bash_history"), "utf8")).resolves.toBe("");
        expect(result).toEqual({ fileCount: 1 });
    });

    it("ignores misplaced nested .bash_history entries supplied by callers", async () => {
        const result = await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "src/.bash_history",
                content: "should be ignored\n",
            },
            {
                kind: "file",
                path: "src/main.py",
                content: "print('ok')\n",
            },
        ]);

        await expect(fs.access(path.join(root, "src", ".bash_history"))).rejects.toThrow();
        await expect(fs.readFile(path.join(root, "src", "main.py"), "utf8")).resolves.toBe(
            "print('ok')\n",
        );
        expect(result).toEqual({ fileCount: 1 });
    });

    it("creates and preserves empty directories", async () => {
        const result = await replaceWorkspaceFiles(root, [
            {
                kind: "directory",
                path: "site/assets",
            },
            {
                kind: "directory",
                path: "site/pages",
            },
            {
                kind: "file",
                path: "main.sh",
                content: "#!/usr/bin/env bash\n",
            },
        ]);

        await expect(fs.stat(path.join(root, "site", "assets"))).resolves.toMatchObject({
            isDirectory: expect.any(Function),
        });
        await expect(fs.stat(path.join(root, "site", "pages"))).resolves.toMatchObject({
            isDirectory: expect.any(Function),
        });
        expect(result).toEqual({ fileCount: 1 });
    });

    it("overwrites files inside learner-created directories after permission normalization", async () => {
        const backup = path.join(root, "backup");
        await fs.mkdir(backup, { recursive: true, mode: 0o755 });
        await fs.writeFile(path.join(backup, "menu.txt"), "old", "utf8");

        await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "backup/menu.txt",
                content: "new",
            },
        ]);

        await expect(
            fs.readFile(path.join(backup, "menu.txt"), "utf8"),
        ).resolves.toBe("new");
    });

});
