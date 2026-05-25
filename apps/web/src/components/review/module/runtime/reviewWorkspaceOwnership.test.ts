import { describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import {
    hydrateBlankWorkspaceFromStarter,
    resolvePreferredExerciseWorkspace,
    shouldSkipEmbeddedEnsureExercise,
} from "@/components/practice/ExerciseRenderer";
import {
    pickDirectReviewRuntimeWorkspace,
    shouldUseLocalReviewDraft,
} from "@/components/tools/panes/CodeToolPane";
import { deriveEntryCode } from "./exerciseWorkspaceResolver";

function makeWorkspace(
    content: string,
    language: WorkspaceLanguage = "python",
): WorkspaceStateV2 {
    const now = Date.now();

    return {
        version: 2,
        language,
        nodes: [
            {
                kind: "file",
                id: "main",
                name: language === "sql" ? "query.sql" : "main.py",
                parentId: null,
                content,
                createdAt: now,
                updatedAt: now,
            },
        ],
        openTabs: ["main"],
        activeFileId: "main",
        entryFileId: "main",
        stdin: "",
        expanded: [],
        leftPct: 40,
    };
}

function makeWorkspaceFromFiles(
    files: Array<{ path: string; content: string }>,
    language: WorkspaceLanguage = "python",
    entryPath?: string,
): WorkspaceStateV2 {
    const now = Date.now();
    const nodes: WorkspaceStateV2["nodes"] = [];
    const folderIdByPath = new Map<string, string>();

    const ensureFolder = (folderPath: string) => {
        const parts = folderPath.split("/").filter(Boolean);
        let currentPath = "";
        let parentId: string | null = null;

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const existingId = folderIdByPath.get(currentPath);
            if (existingId) {
                parentId = existingId;
                continue;
            }

            const id = `folder:${currentPath}`;
            folderIdByPath.set(currentPath, id);
            nodes.push({
                kind: "folder",
                id,
                name: part,
                parentId,
                createdAt: now,
                updatedAt: now,
            } as any);
            parentId = id;
        }

        return parentId;
    };

    for (const file of files) {
        const segments = file.path.split("/").filter(Boolean);
        const name = segments.pop() || "main.py";
        const parentId = ensureFolder(segments.join("/"));
        const id = `file:${file.path}`;
        nodes.push({
            kind: "file",
            id,
            name,
            parentId,
            content: file.content,
            createdAt: now,
            updatedAt: now,
        } as any);
    }

    const normalizedEntryPath = entryPath ?? files[0]?.path ?? "main.py";
    const entryId = `file:${normalizedEntryPath}`;

    return {
        version: 2,
        language,
        nodes,
        openTabs: [entryId],
        activeFileId: entryId,
        entryFileId: entryId,
        stdin: "",
        expanded: Array.from(folderIdByPath.values()),
        leftPct: 40,
    };
}

function getFileContent(workspace: WorkspaceStateV2 | null, path: string) {
    if (!workspace) return null;

    const folderPathById = new Map<string, string>();

    let changed = true;
    while (changed) {
        changed = false;
        for (const node of workspace.nodes as any[]) {
            if (!node || node.kind !== "folder") continue;
            const id = String(node.id ?? "");
            if (!id || folderPathById.has(id)) continue;
            const parentId = node.parentId == null ? null : String(node.parentId);
            if (parentId && !folderPathById.has(parentId)) continue;
            const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
            folderPathById.set(id, parentPath ? `${parentPath}/${node.name}` : String(node.name ?? ""));
            changed = true;
        }
    }

    for (const node of workspace.nodes as any[]) {
        if (node?.kind !== "file") continue;
        const parentId = node.parentId == null ? null : String(node.parentId);
        const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
        const nodePath = parentPath ? `${parentPath}/${node.name}` : String(node.name ?? "");
        if (nodePath === path) {
            return String(node.content ?? "");
        }
    }

    return null;
}

describe("review workspace ownership guards", () => {
    it("does not skip starter ensure for a blank non-user runtime shell", () => {
        expect(
            shouldSkipEmbeddedEnsureExercise({
                existing: {
                    language: "python",
                    workspaceOrigin: "starter",
                    workspace: makeWorkspace(""),
                    code: "",
                },
                manifestLanguage: "python",
                manifestStarterWorkspace: makeWorkspace("print('starter')\n"),
                manifestStarterCode: "print('starter')\n",
            }),
        ).toBe(false);
    });

    it("preserves an intentional user-cleared workspace instead of rehydrating starter code", () => {
        const userBlankWorkspace = makeWorkspace("");

        const preferredWorkspace = resolvePreferredExerciseWorkspace({
            savedState: {
                userEdited: true,
                workspaceOrigin: "user",
            },
            savedWorkspace: userBlankWorkspace,
            starterWorkspace: makeWorkspace("print('starter')\n"),
        });

        const hydratedWorkspace = hydrateBlankWorkspaceFromStarter({
            workspace: preferredWorkspace,
            fallbackCode: "print('starter')\n",
            state: {
                userEdited: true,
                workspaceOrigin: "user",
            },
        });

        expect(hydratedWorkspace).toBe(userBlankWorkspace);
        expect(deriveEntryCode(hydratedWorkspace)).toBe("");
    });

    it("prefers a solved runtime workspace over starter or sync fallbacks", () => {
        const solvedWorkspace = makeWorkspace("print('solved')\n");
        const starterWorkspace = makeWorkspace("print('starter')\n");

        const selectedWorkspace = pickDirectReviewRuntimeWorkspace({
            editorRuntime: {
                workspaceStatus: "ready",
                workspaceOrigin: "starter",
                workspace: starterWorkspace,
                updatedAt: 10,
            },
            exerciseRuntime: {
                workspaceStatus: "ready",
                workspaceOrigin: "sync",
                result: { ok: true },
                workspace: solvedWorkspace,
                updatedAt: 20,
            },
            normalizedToolWorkspace: starterWorkspace,
            effectiveLanguage: "python",
        });

        expect(selectedWorkspace).toBe(solvedWorkspace);
    });

    it("keeps an intentional user blank workspace over starter fallback", () => {
        const userBlankWorkspace = makeWorkspace("");
        const starterWorkspace = makeWorkspace("print('starter')\n");

        const selectedWorkspace = pickDirectReviewRuntimeWorkspace({
            editorRuntime: null,
            exerciseRuntime: {
                workspaceStatus: "ready",
                workspaceOrigin: "user",
                userEdited: true,
                workspace: userBlankWorkspace,
                updatedAt: 20,
            },
            normalizedToolWorkspace: starterWorkspace,
            effectiveLanguage: "python",
        });

        expect(selectedWorkspace).toBe(userBlankWorkspace);
        expect(deriveEntryCode(selectedWorkspace)).toBe("");
    });

    it("does not let a local review draft override protected runtime state", () => {
        expect(
            shouldUseLocalReviewDraft({
                draft: {
                    workspace: makeWorkspace("print('draft')\n"),
                    savedAt: Date.now(),
                },
                runtimeWorkspace: makeWorkspace("print('solved')\n"),
                runtimeUpdatedAt: Date.now(),
                runtimeUserEdited: false,
                runtimeOrigin: "sync",
                runtimeProtected: true,
            }),
        ).toBe(false);
    });

    it("merges missing fixture files from exercise runtime into selected user editor workspace", () => {
        const selectedWorkspace = pickDirectReviewRuntimeWorkspace({
            targetKey: "exercise:q1",
            editorRuntime: {
                targetKey: "exercise:q1",
                workspaceStatus: "ready",
                workspaceOrigin: "user",
                userEdited: true,
                workspace: makeWorkspace("print('saved learner')\n"),
                updatedAt: 50,
            },
            exerciseRuntime: {
                targetKey: "exercise:q1",
                workspaceStatus: "ready",
                workspaceOrigin: "starter",
                workspace: makeWorkspaceFromFiles([
                    { path: "main.py", content: "# starter\n" },
                    { path: "data.txt", content: "Hello fixture" },
                ]),
                updatedAt: 10,
            },
            normalizedToolWorkspace: null,
            effectiveLanguage: "python",
        });

        expect(getFileContent(selectedWorkspace, "main.py")).toBe("print('saved learner')\n");
        expect(getFileContent(selectedWorkspace, "data.txt")).toBe("Hello fixture");
        expect(deriveEntryCode(selectedWorkspace)).toBe("print('saved learner')\n");
    });

    it("does not merge files across unrelated targets", () => {
        const selectedWorkspace = pickDirectReviewRuntimeWorkspace({
            targetKey: "exercise:q1",
            editorRuntime: {
                targetKey: "exercise:q1",
                workspaceStatus: "ready",
                workspaceOrigin: "user",
                userEdited: true,
                workspace: makeWorkspace("print('saved learner')\n"),
                updatedAt: 50,
            },
            exerciseRuntime: {
                targetKey: "exercise:q2",
                workspaceStatus: "ready",
                workspaceOrigin: "starter",
                workspace: makeWorkspaceFromFiles([
                    { path: "main.py", content: "# starter\n" },
                    { path: "data.txt", content: "wrong target fixture" },
                ]),
                updatedAt: 10,
            },
            normalizedToolWorkspace: null,
            effectiveLanguage: "python",
        });

        expect(getFileContent(selectedWorkspace, "main.py")).toBe("print('saved learner')\n");
        expect(getFileContent(selectedWorkspace, "data.txt")).toBe(null);
    });

    it("merges nested fixture file paths without flattening", () => {
        const selectedWorkspace = pickDirectReviewRuntimeWorkspace({
            targetKey: "exercise:q1",
            editorRuntime: {
                targetKey: "exercise:q1",
                workspaceStatus: "ready",
                workspaceOrigin: "user",
                userEdited: true,
                workspace: makeWorkspaceFromFiles([
                    { path: "src/main.py", content: "print('saved learner')\n" },
                ], "python", "src/main.py"),
                updatedAt: 50,
            },
            exerciseRuntime: {
                targetKey: "exercise:q1",
                workspaceStatus: "ready",
                workspaceOrigin: "starter",
                workspace: makeWorkspaceFromFiles([
                    { path: "src/main.py", content: "# starter\n" },
                    { path: "fixtures/data.txt", content: "Hello nested fixture" },
                ], "python", "src/main.py"),
                updatedAt: 10,
            },
            normalizedToolWorkspace: null,
            effectiveLanguage: "python",
        });

        expect(getFileContent(selectedWorkspace, "src/main.py")).toBe("print('saved learner')\n");
        expect(getFileContent(selectedWorkspace, "fixtures/data.txt")).toBe("Hello nested fixture");
    });
});
