import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspace } from "./createWorkspace.js";

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
});
