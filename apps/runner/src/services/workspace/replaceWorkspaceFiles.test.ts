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



    it("preserves executable scripts across workspace replacement", async () => {
        const script = path.join(root, "test_script.sh");
        await fs.writeFile(script, "#!/usr/bin/env bash\necho old\n");
        await fs.chmod(script, 0o755);

        await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "test_script.sh",
                content: "#!/usr/bin/env bash\necho new\n",
            },
        ]);

        // The runner's existing `chmod -R a+rwX` can broaden 0755 to 0777
        // when host/container ownership differs. The invariant under test is
        // that a previously executable script stays executable after sync.
        expect((await fs.stat(script)).mode & 0o111).toBe(0o111);
        await expect(fs.readFile(script, "utf8")).resolves.toBe(
            "#!/usr/bin/env bash\necho new\n",
        );
    });

    it("does not add executable bits to ordinary files across workspace replacement", async () => {
        const regular = path.join(root, "notes.txt");
        await fs.writeFile(regular, "old\n");
        await fs.chmod(regular, 0o644);

        await replaceWorkspaceFiles(root, [
            {
                kind: "file",
                path: "notes.txt",
                content: "new\n",
            },
        ]);

        expect((await fs.stat(regular)).mode & 0o111).toBe(0);
        await expect(fs.readFile(regular, "utf8")).resolves.toBe("new\n");
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

describe("V5 change-aware workspace sync", () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-v5-sync-test-")); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const f = (path: string, content: string) => ({ kind: "file" as const, path, content });

  it("does not rewrite an unchanged chmod 755 script when editing only main.c", async () => {
    const script = path.join(root, "test_script.sh");
    const main = path.join(root, "main.c");
    await fs.writeFile(script, "#!/bin/sh\necho ok\n");
    await fs.chmod(script, 0o755);
    await fs.writeFile(main, "old\n");
    const inode = (await fs.stat(script)).ino;
    const result = await replaceWorkspaceFiles(root,
      [f("test_script.sh", "#!/bin/sh\necho ok\n"), f("main.c", "new\n")],
      { baselineFiles: [f("test_script.sh", "#!/bin/sh\necho ok\n"), f("main.c", "old\n")] },
    );
    expect(result.fileCount).toBe(2);
    expect((await fs.stat(script)).ino).toBe(inode);
    expect((await fs.stat(script)).mode & 0o111).toBe(0o111);
    await expect(fs.readFile(main, "utf8")).resolves.toBe("new\n");
  });

  it("preserves terminal-only files not in the browser's baseline", async () => {
    await fs.writeFile(path.join(root, "main.c"), "old\n");
    await fs.writeFile(path.join(root, "terminal.log"), "terminal output\n");
    await replaceWorkspaceFiles(root, [f("main.c", "new\n")], {
      baselineFiles: [f("main.c", "old\n")],
    });
    await expect(fs.readFile(path.join(root, "terminal.log"), "utf8"))
      .resolves.toBe("terminal output\n");
  });

  it("returns a conflict before changing other files if terminal edited the same path", async () => {
    await fs.writeFile(path.join(root, "main.c"), "terminal edit\n");
    await fs.writeFile(path.join(root, "other.c"), "original\n");
    await expect(replaceWorkspaceFiles(root,
      [f("main.c", "browser edit\n"), f("other.c", "new\n")],
      { baselineFiles: [f("main.c", "old\n"), f("other.c", "original\n")] },
    )).rejects.toThrow(/Workspace changed since last synchronization: main.c/);
    await expect(fs.readFile(path.join(root, "main.c"), "utf8"))
      .resolves.toBe("terminal edit\n");
    await expect(fs.readFile(path.join(root, "other.c"), "utf8"))
      .resolves.toBe("original\n");
  });

  it("preserves restrictive permissions on a genuinely changed executable", async () => {
    const script = path.join(root, "run.sh");
    await fs.writeFile(script, "#!/bin/sh\necho old\n");
    await fs.chmod(script, 0o755);
    await replaceWorkspaceFiles(root, [f("run.sh", "#!/bin/sh\necho new\n")], {
      baselineFiles: [f("run.sh", "#!/bin/sh\necho old\n")],
    });
    expect((await fs.stat(script)).mode & 0o111).toBe(0o111);
    await expect(fs.readFile(script, "utf8")).resolves.toMatch(/echo new/);
  });

  it("rejects a symlink parent and leaves the outside file untouched", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-v5-outside-"));
    try {
      await fs.writeFile(path.join(outside, "data.txt"), "outside\n");
      await fs.symlink(outside, path.join(root, "linked"));
      await expect(replaceWorkspaceFiles(root, [f("linked/data.txt", "attack\n")], {
        baselineFiles: [],
      })).rejects.toThrow(/Unsafe workspace path/);
      await expect(fs.readFile(path.join(outside, "data.txt"), "utf8"))
        .resolves.toBe("outside\n");
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("does not delete a terminal-modified file on a stale browser deletion", async () => {
    await fs.writeFile(path.join(root, "notes.txt"), "terminal revised\n");
    await expect(replaceWorkspaceFiles(root, [], {
      baselineFiles: [f("notes.txt", "original\n")],
    })).rejects.toThrow(/Workspace changed since last synchronization: notes.txt/);
    await expect(fs.readFile(path.join(root, "notes.txt"), "utf8"))
      .resolves.toBe("terminal revised\n");
  });
});
