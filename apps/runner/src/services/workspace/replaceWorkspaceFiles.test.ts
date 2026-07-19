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

    it("preserves Git and hidden bootstrap state while replacing visible editor files", async () => {
        await fs.mkdir(path.join(root, "trail-journal", ".git"), { recursive: true });
        await fs.mkdir(path.join(root, ".zoeskoul"), { recursive: true });
        await fs.writeFile(
            path.join(root, "trail-journal", ".git", "HEAD"),
            "ref: refs/heads/main\n",
        );
        await fs.writeFile(
            path.join(root, "trail-journal", ".git", "index"),
            "opaque-index",
        );
        await fs.writeFile(
            path.join(root, ".zoeskoul", "setup.sh"),
            "#!/usr/bin/env bash\necho old\n",
        );
        await fs.writeFile(
            path.join(root, ".zoeskoul", ".setup-complete"),
            "old-state\n",
        );
        await fs.writeFile(path.join(root, "old-visible.txt"), "remove me\n");

        await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "trail-journal/README.md",
                content: "# Trail Journal\n",
            },
            {
                kind: "file",
                path: ".zoeskoul/setup.sh",
                content: "#!/usr/bin/env bash\necho new\n",
            },
        ]);

        await expect(
            fs.readFile(path.join(root, "trail-journal", ".git", "HEAD"), "utf8"),
        ).resolves.toBe("ref: refs/heads/main\n");
        await expect(
            fs.readFile(path.join(root, "trail-journal", ".git", "index"), "utf8"),
        ).resolves.toBe("opaque-index");
        await expect(
            fs.readFile(path.join(root, ".zoeskoul", ".setup-complete"), "utf8"),
        ).resolves.toBe("old-state\n");
        await expect(
            fs.readFile(path.join(root, ".zoeskoul", "setup.sh"), "utf8"),
        ).resolves.toBe("#!/usr/bin/env bash\necho new\n");
        await expect(
            fs.readFile(path.join(root, "trail-journal", "README.md"), "utf8"),
        ).resolves.toBe("# Trail Journal\n");
        await expect(fs.access(path.join(root, "old-visible.txt"))).rejects.toThrow();
    });


    it("replaces binary files with exact bytes", async () => {
        const before = Buffer.from([1, 2, 3]);
        const after = Buffer.from([0, 255, 9, 8, 7]);
        await fs.mkdir(path.join(root, "assets"), { recursive: true });
        await fs.writeFile(path.join(root, "assets", "photo.png"), before);

        const result = await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "assets/photo.png",
                encoding: "base64",
                data: after.toString("base64"),
                mimeType: "image/png",
                sizeBytes: after.byteLength,
            },
        ]);

        await expect(
            fs.readFile(path.join(root, "assets", "photo.png")),
        ).resolves.toEqual(after);
        expect(result).toEqual({ fileCount: 1 });
    });

});
