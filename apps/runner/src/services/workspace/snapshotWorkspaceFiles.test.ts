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
});