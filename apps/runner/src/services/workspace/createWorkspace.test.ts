import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspace, ensureWorkspaceRuntimeFiles } from "./createWorkspace.js";

describe("createWorkspace", () => {
    const createdRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(
            createdRoots.splice(0).map((root) =>
                fs.rm(root, {
                    recursive: true,
                    force: true,
                }),
            ),
        );
    });

    it("accepts .keep starter files for terminal workspaces", async () => {
        const root = await createWorkspace([
            {
                kind: "directory",
                path: "backups",
            },
            {
                kind: "file",
                path: "backups/.keep",
                content: "",
            },
            {
                kind: "file",
                path: "README.md",
                content: "terminal workspace\n",
            },
        ]);

        createdRoots.push(root);

        await expect(
            fs.readFile(path.join(root, "backups", ".keep"), "utf8"),
        ).resolves.toBe("");
        await expect(
            fs.readFile(path.join(root, "README.md"), "utf8"),
        ).resolves.toBe("terminal workspace\n");
    });

    it("rejects a symlinked history file before opening it", async () => {
        const root = await createWorkspace([]);
        createdRoots.push(root);
        await fs.rm(path.join(root, ".bash_history"));
        const outside = path.join(root, "outside-log.txt");
        await fs.writeFile(outside, "protected\n");
        await fs.symlink(outside, path.join(root, ".bash_history"));
        await expect(ensureWorkspaceRuntimeFiles(root)).rejects.toThrow(/Unsafe workspace history entry/);
        await expect(fs.readFile(outside, "utf8")).resolves.toBe("protected\n");
    });

    it("refuses runtime directories routed through a symlink", async () => {
        const root = await createWorkspace([]);
        createdRoots.push(root);
        await fs.symlink("/tmp", path.join(root, "external"));
        await expect(ensureWorkspaceRuntimeFiles(root, ["external/child"])).rejects.toThrow(/Unsafe workspace runtime directory/);
    });

    it("writes binary starter files without UTF-8 conversion", async () => {
        const bytes = Buffer.from([0, 255, 1, 2, 3, 128]);
        const root = await createWorkspace([
            {
                kind: "file",
                path: "assets/pixel.png",
                encoding: "base64",
                data: bytes.toString("base64"),
                mimeType: "image/png",
                sizeBytes: bytes.byteLength,
            },
        ]);

        createdRoots.push(root);

        await expect(
            fs.readFile(path.join(root, "assets", "pixel.png")),
        ).resolves.toEqual(bytes);
    });

});
