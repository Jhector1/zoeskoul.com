import { describe, expect, it } from "vitest";

import { resolveExternalWorkspaceApplyKey, resolveReadyWorkspaceReplacementRevision, shouldHydrateWorkspaceSnapshot, workspaceControlledContentKey } from "./externalWorkspaceControl";

describe("authoritative mounted workspace hydration", () => {
    it("reapplies a previously hydrated starter after learner edits", () => {
        const keys = { currentKey: "starter + ffggggfff", nextKey: "starter", lastHydratedKey: "starter" };
        expect(shouldHydrateWorkspaceSnapshot({ ...keys, authoritative: false })).toBe(false);
        expect(shouldHydrateWorkspaceSnapshot({ ...keys, authoritative: true })).toBe(true);
        expect(shouldHydrateWorkspaceSnapshot({ ...keys, currentKey: "starter", authoritative: true })).toBe(false);
    });

    it("does not acknowledge a new revision using the previous render's snapshot", () => {
        const command = { revision: "reset:1:apply:1", requestedWorkspaceKey: "starter" };
        expect(resolveReadyWorkspaceReplacementRevision({ ...command, committedWorkspaceKey: "starter + ffggggfff" })).toBeUndefined();
        expect(resolveReadyWorkspaceReplacementRevision({ ...command, committedWorkspaceKey: "starter" })).toBe(command.revision);
    });
});

describe("resolveExternalWorkspaceApplyKey", () => {
    it("tracks workspace content during normal controlled hydration", () => {
        expect(
            resolveExternalWorkspaceApplyKey({
                externalWorkspaceKey: "workspace-a",
                initialWorkspaceKey: "starter",
            }),
        ).toBe("workspace-a::initial:starter");

        expect(
            resolveExternalWorkspaceApplyKey({
                externalWorkspaceKey: "workspace-b",
                initialWorkspaceKey: "starter",
            }),
        ).toBe("workspace-b::initial:starter");
    });

    it("uses the explicit revision for mounted-editor replacement commands", () => {
        const first = resolveExternalWorkspaceApplyKey({
            externalWorkspaceKey: "solution-a",
            initialWorkspaceKey: "starter",
            revision: "exercise-1:1",
        });
        const sameCommandWithDifferentParentSnapshot = resolveExternalWorkspaceApplyKey({
            externalWorkspaceKey: "solution-b",
            initialWorkspaceKey: "starter",
            revision: "exercise-1:1",
        });
        const nextCommand = resolveExternalWorkspaceApplyKey({
            externalWorkspaceKey: "solution-b",
            initialWorkspaceKey: "starter",
            revision: "exercise-1:2",
        });

        expect(sameCommandWithDifferentParentSnapshot).toBe(first);
        expect(nextCommand).not.toBe(first);
    });
});

describe("workspaceControlledContentKey", () => {
    const baseWorkspace = {
        version: 2 as const,
        language: "web",
        activeFileId: "index",
        entryFileId: "index",
        openTabs: ["index"],
        stdin: "",
        expanded: ["images"],
        leftPct: 26,
        nodes: [
            {
                id: "index",
                kind: "file",
                name: "index.html",
                parentId: null,
                content: "<h1>Hello</h1>",
            },
            {
                id: "profile",
                kind: "file",
                name: "profile.png",
                parentId: "images",
                content: "",
                binary: {
                    encoding: "base64",
                    data: "iVBORw0KGgo=",
                    mimeType: "image/png",
                    sizeBytes: 8,
                },
            },
        ],
    };

    it("ignores local presentation-only file selection and chrome state", () => {
        const first = workspaceControlledContentKey(baseWorkspace);
        const presentationOnly = workspaceControlledContentKey({
            ...baseWorkspace,
            activeFileId: "profile",
            openTabs: ["index", "profile"],
            expanded: [],
            leftPct: 41,
        });

        expect(presentationOnly).toBe(first);
    });

    it("tracks text and binary payload changes", () => {
        const first = workspaceControlledContentKey(baseWorkspace);
        const textChanged = workspaceControlledContentKey({
            ...baseWorkspace,
            nodes: baseWorkspace.nodes.map((node) =>
                node.id === "index"
                    ? { ...node, content: "<h1>Changed</h1>" }
                    : node,
            ),
        });
        const binaryChanged = workspaceControlledContentKey({
            ...baseWorkspace,
            nodes: baseWorkspace.nodes.map((node) =>
                node.id === "profile"
                    ? {
                          ...node,
                          binary: {
                              ...node.binary,
                              data: "different-base64",
                          },
                      }
                    : node,
            ),
        });

        expect(textChanged).not.toBe(first);
        expect(binaryChanged).not.toBe(first);
    });

    it("tracks semantic workspace changes such as entry file and stdin", () => {
        const first = workspaceControlledContentKey(baseWorkspace);

        expect(
            workspaceControlledContentKey({
                ...baseWorkspace,
                entryFileId: "profile",
            }),
        ).not.toBe(first);

        expect(
            workspaceControlledContentKey({
                ...baseWorkspace,
                stdin: "input",
            }),
        ).not.toBe(first);
    });
});
