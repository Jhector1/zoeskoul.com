import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { snapshotWorkspaceFiles } from "./snapshotWorkspaceFiles.js";

describe("snapshotWorkspaceFiles", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-snapshot-test-"));
    });

    afterEach(async () => {
        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    });

    it("captures created files and directories", async () => {
        await fs.writeFile(path.join(root, "main.py"), "print('hello')\n");
        await fs.writeFile(path.join(root, "output.txt"), "Hello, World!");
        await fs.mkdir(path.join(root, "data"), { recursive: true });
        await fs.writeFile(
            path.join(root, "data", "result.csv"),
            "name,score\nAlice,95\n",
        );

        const snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                {
                    kind: "file",
                    path: "main.py",
                    content: "print('hello')\n",
                },
                {
                    kind: "file",
                    path: "output.txt",
                    content: "Hello, World!",
                },
                {
                    kind: "directory",
                    path: "data",
                },
                {
                    kind: "file",
                    path: "data/result.csv",
                    content: "name,score\nAlice,95\n",
                },
            ]),
        );
    });

    it("captures empty nested directories", async () => {
        await fs.mkdir(path.join(root, "site", "assets"), { recursive: true });
        await fs.mkdir(path.join(root, "site", "pages"), { recursive: true });
        await fs.writeFile(path.join(root, "main.sh"), "#!/usr/bin/env bash\n");

        const snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                {
                    kind: "directory",
                    path: "site",
                },
                {
                    kind: "directory",
                    path: "site/assets",
                },
                {
                    kind: "directory",
                    path: "site/pages",
                },
            ]),
        );
    });

    it("does not include a deleted file in the next snapshot", async () => {
        const outputPath = path.join(root, "output.txt");

        await fs.writeFile(outputPath, "Hello, World!");
        let snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                {
                    kind: "file",
                    path: "output.txt",
                    content: "Hello, World!",
                },
            ]),
        );

        await fs.rm(outputPath);

        snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "output.txt",
                }),
            ]),
        );
    });

    it("skips generated cache files", async () => {
        await fs.mkdir(path.join(root, "__pycache__"), { recursive: true });
        await fs.writeFile(path.join(root, "__pycache__", "main.pyc"), "bad");
        await fs.writeFile(path.join(root, "main.py"), "print('ok')\n");

        const snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                {
                    kind: "file",
                    path: "main.py",
                    content: "print('ok')\n",
                },
            ]),
        );

        expect(snapshot).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "__pycache__/main.pyc",
                }),
            ]),
        );
    });

    it("does not include runner-managed metadata files", async () => {
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.writeFile(path.join(root, "src", "main.py"), "print('ok')\n");
        await fs.writeFile(path.join(root, ".bash_history"), "python src/main.py\n");
        await fs.writeFile(path.join(root, "src", ".bash_history"), "bad nested history\n");

        const snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                {
                    kind: "directory",
                    path: "src",
                },
                {
                    kind: "file",
                    path: "src/main.py",
                    content: "print('ok')\n",
                },
            ]),
        );

        expect(snapshot).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: ".bash_history",
                }),
            ]),
        );
        expect(snapshot).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "src/.bash_history",
                }),
            ]),
        );
    });
    it("omits Git metadata and hidden bootstrap state from workspace snapshots", async () => {
        await fs.mkdir(path.join(root, "trail-journal", ".git", "refs", "heads"), {
            recursive: true,
        });
        await fs.mkdir(path.join(root, ".zoeskoul"), { recursive: true });
        await fs.writeFile(
            path.join(root, "trail-journal", "README.md"),
            "# Trail Journal\n",
        );
        await fs.writeFile(
            path.join(root, "trail-journal", ".git", "HEAD"),
            "ref: refs/heads/main\n",
        );
        await fs.writeFile(
            path.join(root, ".zoeskoul", "setup.sh"),
            "#!/usr/bin/env bash\n",
        );
        await fs.writeFile(
            path.join(root, ".zoeskoul", ".setup-complete"),
            "state-v1\n",
        );

        const snapshot = await snapshotWorkspaceFiles(root);
        const paths = snapshot.map((entry) => entry.path);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                { kind: "directory", path: "trail-journal" },
                {
                    kind: "file",
                    path: "trail-journal/README.md",
                    content: "# Trail Journal\n",
                },
            ]),
        );
        expect(paths.some((entryPath) => entryPath.includes(".git"))).toBe(false);
        expect(paths.some((entryPath) => entryPath.includes(".zoeskoul"))).toBe(false);
    });

});
