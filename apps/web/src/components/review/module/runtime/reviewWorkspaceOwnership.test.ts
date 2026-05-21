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
});
