import { describe, expect, it } from "vitest";
import {
    DEFAULT_IDE_FILE_ACTIONS,
    resolveIdeFileActions,
    resolveWorkspacePolicy,
    validateImportedFiles,
    validateWorkspaceState,
} from "@/lib/ide/workspacePolicy";
import type { WorkspaceStateV2 } from "@/components/ide/types";

function buildWorkspace(overrides?: Partial<WorkspaceStateV2>): WorkspaceStateV2 {
    return {
        version: 2,
        language: "python",
        nodes: [
            {
                id: "main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "print('hello')\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["main.py"],
        activeFileId: "main.py",
        entryFileId: "main.py",
        stdin: "",
        expanded: [],
        leftPct: 32,
        ...overrides,
    };
}

describe("resolveIdeFileActions", () => {
    it("defaults every file action to enabled when config is missing", () => {
        expect(resolveIdeFileActions()).toEqual(DEFAULT_IDE_FILE_ACTIONS);
    });

    it("disables all actions when enabled is false", () => {
        expect(resolveIdeFileActions({ enabled: false })).toEqual({
            enabled: false,
            createFile: false,
            createFolder: false,
            rename: false,
            delete: false,
            dragDrop: false,
        });
    });
});

describe("resolveWorkspacePolicy", () => {
    it("keeps file actions enabled by default for a normal multi-file workspace", () => {
        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
        );

        expect(policy.canCreateFiles).toBe(true);
        expect(policy.canCreateFolders).toBe(true);
        expect(policy.canRenameNodes).toBe(true);
        expect(policy.canDeleteNodes).toBe(true);
        expect(policy.canMoveNodes).toBe(true);
        expect(policy.canUploadBinaryFiles).toBe(true);
    });

    it("keeps binary uploads behind the existing multi-file workspace capability", () => {
        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: false,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
        );

        expect(policy.canUploadFiles).toBe(true);
        expect(policy.canUploadBinaryFiles).toBe(false);
        expect(
            validateImportedFiles(
                [
                    {
                        path: "pixel.png",
                        content: "",
                        binary: {
                            encoding: "base64",
                            data: "AAECAw==",
                            mimeType: "image/png",
                            sizeBytes: 4,
                        },
                    },
                ],
                policy,
            ),
        ).toMatch(/multi-file workspace/i);
    });

    it("disables only the requested explorer actions", () => {
        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
            {
                createFile: false,
                createFolder: false,
                dragDrop: false,
            },
        );

        expect(policy.canCreateFiles).toBe(false);
        expect(policy.canCreateFolders).toBe(false);
        expect(policy.canMoveNodes).toBe(false);
        expect(policy.canRenameNodes).toBe(true);
        expect(policy.canDeleteNodes).toBe(true);
    });

    it("disables all explorer write actions when file actions are fully disabled", () => {
        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "bash",
            {
                enabled: false,
            },
        );

        expect(policy.canCreateFiles).toBe(false);
        expect(policy.canCreateFolders).toBe(false);
        expect(policy.canRenameNodes).toBe(false);
        expect(policy.canDeleteNodes).toBe(false);
        expect(policy.canMoveNodes).toBe(false);
        expect(policy.canUploadFiles).toBe(false);
    });
});

describe("validateWorkspaceState", () => {
    it("accepts a valid multi-file workspace", () => {
        const workspace = buildWorkspace({
            language: "sql",
            nodes: [
                {
                    id: "queries",
                    kind: "folder",
                    name: "queries",
                    parentId: null,
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "queries/query.sql",
                    kind: "file",
                    name: "query.sql",
                    parentId: "queries",
                    content: "select * from inventory_items;",
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "notes.sql",
                    kind: "file",
                    name: "notes.sql",
                    parentId: null,
                    content: "-- notes",
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            openTabs: ["queries/query.sql", "notes.sql"],
            activeFileId: "queries/query.sql",
            entryFileId: "queries/query.sql",
            expanded: ["queries"],
            stdin: "",
        });

        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "sql",
        );

        expect(validateWorkspaceState(workspace, policy)).toEqual([]);
    });

    it("rejects oversize stdin and broken file references", () => {
        const workspace = buildWorkspace({
            openTabs: ["missing.py"],
            stdin: "x".repeat(70_000),
        });

        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: false,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
        );

        expect(validateWorkspaceState(workspace, policy)[0]).toMatch(/stdin exceeds/i);
    });

    it("accepts binary preview files while requiring a text entry file", () => {
        const workspace = buildWorkspace({
            nodes: [
                {
                    id: "main.py",
                    kind: "file",
                    name: "main.py",
                    parentId: null,
                    content: "print('hello')\n",
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "pixel.png",
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
            openTabs: ["main.py", "pixel.png"],
            activeFileId: "pixel.png",
            entryFileId: "main.py",
        });
        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
        );

        expect(validateWorkspaceState(workspace, policy)).toEqual([]);
        expect(
            validateWorkspaceState(
                { ...workspace, entryFileId: "pixel.png" },
                policy,
            )[0],
        ).toMatch(/entryFileId must reference a text file/i);
    });

    it("rejects corrupt or extension-mismatched binary workspace state", () => {
        const policy = resolveWorkspacePolicy(
            {
                hasUser: true,
                canUseMultiFile: true,
                canSaveCloud: true,
                canCreateProjects: true,
            },
            "python",
        );
        const corrupt = buildWorkspace({
            nodes: [
                {
                    id: "pixel.png",
                    kind: "file",
                    name: "pixel.png",
                    parentId: null,
                    content: "",
                    binary: {
                        encoding: "base64",
                        data: "AAECAw==",
                        mimeType: "image/png",
                        sizeBytes: 3,
                    },
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            openTabs: ["pixel.png"],
            activeFileId: "pixel.png",
            entryFileId: "pixel.png",
        });

        expect(validateWorkspaceState(corrupt, policy)[0]).toMatch(/invalid binary data/i);
    });

});
