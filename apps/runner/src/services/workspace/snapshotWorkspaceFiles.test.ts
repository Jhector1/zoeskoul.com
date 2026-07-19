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

    it("round-trips common web project text files", async () => {
        await fs.mkdir(path.join(root, "site", "styles"), { recursive: true });
        await fs.mkdir(path.join(root, "site", "scripts"), { recursive: true });
        await fs.mkdir(path.join(root, "site", "assets"), { recursive: true });
        await fs.writeFile(
            path.join(root, "site", "index.html"),
            '<script type="module" src="scripts/app.js"></script>\n',
        );
        await fs.writeFile(
            path.join(root, "site", "styles", "app.css"),
            "body { margin: 0; }\n",
        );
        await fs.writeFile(
            path.join(root, "site", "scripts", "app.js"),
            'import { ready } from "./ready.mjs";\n',
        );
        await fs.writeFile(
            path.join(root, "site", "scripts", "ready.mjs"),
            "export const ready = true;\n",
        );
        await fs.writeFile(
            path.join(root, "site", "assets", "logo.svg"),
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
        );

        const snapshot = await snapshotWorkspaceFiles(root);

        expect(snapshot).toEqual(
            expect.arrayContaining([
                {
                    kind: "file",
                    path: "site/index.html",
                    content: '<script type="module" src="scripts/app.js"></script>\n',
                },
                {
                    kind: "file",
                    path: "site/styles/app.css",
                    content: "body { margin: 0; }\n",
                },
                {
                    kind: "file",
                    path: "site/scripts/app.js",
                    content: 'import { ready } from "./ready.mjs";\n',
                },
                {
                    kind: "file",
                    path: "site/scripts/ready.mjs",
                    content: "export const ready = true;\n",
                },
                {
                    kind: "file",
                    path: "site/assets/logo.svg",
                    content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
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


    it("snapshots binary files as exact base64 with MIME, size, and checksum", async () => {
        const bytes = Buffer.from([0, 255, 1, 2, 3, 128]);
        await fs.mkdir(path.join(root, "assets"), { recursive: true });
        await fs.writeFile(path.join(root, "assets", "pixel.png"), bytes);

        const snapshot = await snapshotWorkspaceFiles(root);
        const entry = snapshot.find((item) => item.path === "assets/pixel.png");

        expect(entry).toMatchObject({
            kind: "file",
            path: "assets/pixel.png",
            encoding: "base64",
            data: bytes.toString("base64"),
            mimeType: "image/png",
            sizeBytes: bytes.byteLength,
        });
        expect(
            entry && entry.kind === "file" && entry.encoding === "base64"
                ? entry.checksum
                : null,
        ).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("fails instead of silently corrupting invalid UTF-8 text", async () => {
        await fs.writeFile(path.join(root, "README.md"), Buffer.from([0xff, 0xfe]));

        await expect(snapshotWorkspaceFiles(root)).rejects.toThrow(/not valid UTF-8/i);
    });

});
