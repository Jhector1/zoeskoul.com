import { describe, expect, it } from "vitest";

import { repairWorkspaceStateV2 } from "./storage";

describe("repairWorkspaceStateV2 binary workspaces", () => {
    it("preserves a binary active file while repairing the entry to a text file", () => {
        const workspace = repairWorkspaceStateV2(
            {
                version: 2,
                language: "python",
                nodes: [
                    {
                        id: "pixel",
                        kind: "file",
                        name: "pixel.png",
                        parentId: null,
                        content: "",
                        binary: {
                            encoding: "base64",
                            data: "AAECAw==",
                            mimeType: "image/png",
                            sizeBytes: 4,
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
                openTabs: ["pixel"],
                activeFileId: "pixel",
                entryFileId: "pixel",
                stdin: "",
                expanded: [],
                leftPct: 26,
            },
            "python",
        );

        expect(workspace.activeFileId).toBe("pixel");
        expect(workspace.nodes.find((node) => node.id === "pixel")).toMatchObject({
            kind: "file",
            binary: { encoding: "base64", sizeBytes: 4 },
        });
        const entry = workspace.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.entryFileId,
        );
        expect(entry?.kind).toBe("file");
        expect(entry && "binary" in entry ? entry.binary : undefined).toBeUndefined();
    });
});
