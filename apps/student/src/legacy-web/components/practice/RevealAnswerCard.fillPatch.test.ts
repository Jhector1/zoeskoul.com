import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QItem } from "@/lib/practice/uiTypes";

import RevealAnswerCard, {
    applyRevealFillAnswer,
    buildSolutionWorkspace,
    buildRevealFillPatches,
    mergeSolutionWorkspace,
} from "./RevealAnswerCard";
import { resolveRevealAnswerForResult } from "./shell/ResultPanel";

vi.mock("@student/i18n/tagged", () => ({
    isTaggedKey: (value: unknown) =>
        typeof value === "string" && value.startsWith("@:"),
    stripTag: (value: string) => value.slice(2),
    useTaggedT: () => ({
        raw: (_key: string, fallback?: string) => fallback ?? "",
    }),
}));

vi.mock("@/components/review/module/context/ReviewToolsContext", () => ({
    useOptionalReviewTools: () => null,
}));

describe("persisted reveal answer", () => {
    it("restores the reveal payload when transient help entries are empty", () => {
        const revealAnswer = {
            kind: "code_input",
            language: "python",
            solutionCode: "print('solution')\n",
        };

        expect(
            resolveRevealAnswerForResult({
                revealed: true,
                result: {
                    ok: false,
                    finalized: true,
                    revealUsed: true,
                    revealAnswer,
                },
                help: {
                    openedStepKeys: ["reveal"],
                    activeStepKey: "reveal",
                    entries: {},
                    busyStepKey: null,
                    error: null,
                },
            } as unknown as QItem),
        ).toBe(revealAnswer);
    });
});

function workspacePathMap(workspace: NonNullable<ReturnType<typeof buildSolutionWorkspace>>) {
    const byId = new Map(workspace.nodes.map((node) => [node.id, node] as const));
    const out = new Map<string, string>();

    for (const node of workspace.nodes) {
        if (node.kind !== "file") continue;

        const parts = [node.name];
        let parentId = node.parentId;

        while (parentId) {
            const parent = byId.get(parentId);
            if (!parent) break;
            parts.unshift(parent.name);
            parentId = parent.parentId;
        }

        out.set(parts.join("/"), node.content);
    }

    return out;
}

describe("buildRevealFillPatches", () => {
    it("builds a user-authored tools patch for code_input Fill answer", () => {
        const { itemPatch, toolsPatch } = buildRevealFillPatches({
            isCodeInput: true,
            fillPatch: {
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
            } as any,
        });

        expect(itemPatch).toMatchObject({
            code: "print('solution')",
            codeLang: "python",
            codeStdin: "input value",
            codeTouched: true,
            submitted: true,
            revealed: true,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: false,
            updateOrigin: "reveal-fill",
        });

        expect(toolsPatch).toMatchObject({
            code: "print('solution')",
            codeLang: "python",
            codeStdin: "input value",
            codeTouched: true,
            submitted: true,
            revealed: true,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: false,
            updateOrigin: "reveal-fill",
            userEdited: true,
            preferSnapshot: true,
            workspaceOrigin: "reveal-fill",
            applyToMountedEditor: true,
        });
    });

    it("does not add code editor metadata for non-code Fill answer", () => {
        const { itemPatch, toolsPatch } = buildRevealFillPatches({
            isCodeInput: false,
            fillPatch: {
                shortText: "Paris",
            } as any,
        });

        expect(itemPatch).toMatchObject({
            shortText: "Paris",
            submitted: true,
            revealed: true,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: false,
            updateOrigin: "reveal-fill",
        });

        expect(itemPatch).not.toHaveProperty("codeTouched");
        expect(toolsPatch).not.toHaveProperty("userEdited");
        expect(toolsPatch).not.toHaveProperty("preferSnapshot");
        expect(toolsPatch).not.toHaveProperty("workspaceOrigin");
    });

    it("creates a multi-file workspace from solutionFiles", () => {
        const solutionCode =
            "from tools.names import clean_name\nfrom tools.badges import make_badge\n\nraw_name = input()\nrole = input()\nname = clean_name(raw_name)\nprint(make_badge(name, role))\n";
        const workspace = buildSolutionWorkspace({
            language: "python",
            solutionCode,
            stdin: "",
            solutionFiles: {
                "main.py": solutionCode,
                "tools/__init__.py": "",
                "tools/names.py": "def clean_name(value):\n    return value.strip().title()\n",
                "tools/badges.py":
                    'def make_badge(name, role):\n    return f"{role.upper()} badge: {name}"\n',
            },
        });

        expect(workspace).not.toBeNull();
        expect(workspace?.version).toBe(2);

        const toolsFolder = workspace?.nodes.find(
            (node) => node.kind === "folder" && node.name === "tools",
        );
        expect(toolsFolder).toBeTruthy();

        const paths = workspacePathMap(workspace!);
        expect(Array.from(paths.keys()).sort()).toEqual([
            "main.py",
            "tools/__init__.py",
            "tools/badges.py",
            "tools/names.py",
        ]);
        expect(paths.get("main.py")).toBe(solutionCode);
        expect(paths.get("tools/__init__.py")).toBe("");
        expect(paths.get("tools/names.py")).toBe(
            "def clean_name(value):\n    return value.strip().title()\n",
        );
        expect(paths.get("tools/badges.py")).toBe(
            'def make_badge(name, role):\n    return f"{role.upper()} badge: {name}"\n',
        );

        const activeNode = workspace?.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.activeFileId,
        );
        expect(activeNode?.kind).toBe("file");
        expect(activeNode?.name).toBe("main.py");
        expect(workspace?.entryFileId).toBe(workspace?.activeFileId);
        expect(workspace?.openTabs).toEqual([workspace?.activeFileId]);
    });

    it("adds revealed solution files without deleting the learner workspace", () => {
        const learnerWorkspace = buildSolutionWorkspace({
            language: "python",
            solutionCode: "print('learner')\n",
            stdin: "",
            solutionFiles: {
                "main.py": "print('learner')\n",
                "notes.txt": "keep this file\n",
            },
        });
        const solutionWorkspace = buildSolutionWorkspace({
            language: "python",
            solutionCode: "from tools.helper import answer\nprint(answer())\n",
            stdin: "",
            solutionFiles: {
                "main.py": "from tools.helper import answer\nprint(answer())\n",
                "tools/helper.py": "def answer():\n    return 42\n",
            },
        });

        const merged = mergeSolutionWorkspace(
            learnerWorkspace,
            solutionWorkspace,
        );

        expect(merged).not.toBeNull();
        const paths = workspacePathMap(merged!);
        expect(paths.get("main.py")).toBe(
            "from tools.helper import answer\nprint(answer())\n",
        );
        expect(paths.get("tools/helper.py")).toBe(
            "def answer():\n    return 42\n",
        );
        expect(paths.get("notes.txt")).toBe("keep this file\n");
    });

    it("shows solution files for comparison and waits for Fill in editor", () => {
        const exercise = {
            id: "compare-solution",
            kind: "code_input",
            topic: "topic-1",
            difficulty: "easy",
            title: "Compare solution",
            prompt: "Write code",
            language: "python",
        } as any;
        const current = {
            key: exercise.id,
            exercise,
            code: "print('learner work')\n",
            codeLang: "python",
            codeStdin: "",
            single: "",
            multi: [],
            num: "",
            dragA: { x: 0, y: 0, z: 0 },
            dragB: { x: 0, y: 0, z: 0 },
            matRows: 0,
            matCols: 0,
            mat: [],
            result: { ok: false, finalized: true },
            submitted: true,
            attempts: 3,
            text: "",
            voiceTranscript: "",
            help: {
                openedStepKeys: ["reveal"],
                activeStepKey: "reveal",
                entries: {},
                busyStepKey: null,
                error: null,
            },
        } as any;

        const html = renderToStaticMarkup(
            React.createElement(RevealAnswerCard, {
                exercise,
                current,
                reveal: {
                    kind: "code_input",
                    language: "python",
                    solutionCode: "from tools.helper import answer\nprint(answer())\n",
                    solutionFiles: {
                        "main.py": "from tools.helper import answer\nprint(answer())\n",
                        "tools/helper.py": "def answer():\n    return 42\n",
                    },
                },
                updateCurrent: vi.fn(),
                autoScroll: false,
            }),
        );

        expect(html).toContain("Compare the revealed solution with your workspace");
        expect(html).toContain("Fill in editor");
        expect(html).toContain("Copy all files");
        expect(html).toContain("main.py");
        expect(html).toContain("tools/helper.py");
        expect(html).not.toContain("has been filled into the editor");
    });

    it("applies code_input Fill answer to both item state and registered CodeToolPane input", () => {
        const updateCurrent = vi.fn();
        const patchCodeInput = vi.fn();
        const workspace = buildSolutionWorkspace({
            language: "python",
            solutionCode: "print('solution')\n",
            stdin: "input value",
            solutionFiles: {
                "main.py": "print('solution')\n",
                "tools/helper.py": "VALUE = 1\n",
            },
        });

        applyRevealFillAnswer({
            isCodeInput: true,
            codeInputId: "code-input-1",
            updateCurrent,
            patchCodeInput,
            fillPatch: {
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
            } as any,
        });

        expect(patchCodeInput.mock.invocationCallOrder[0]).toBeLessThan(
            updateCurrent.mock.invocationCallOrder[0],
        );

        expect(updateCurrent).toHaveBeenCalledWith(
            expect.objectContaining({
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
                codeTouched: true,
                submitted: true,
                revealed: true,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: false,
                updateOrigin: "reveal-fill",
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
            }),
        );

        expect(patchCodeInput).toHaveBeenCalledWith(
            "code-input-1",
            expect.objectContaining({
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
                codeTouched: true,
                submitted: true,
                revealed: true,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: false,
                updateOrigin: "reveal-fill",
                userEdited: true,
                preferSnapshot: true,
                workspaceOrigin: "reveal-fill",
                applyToMountedEditor: true,
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
            }),
        );
    });

    it("does not patch CodeToolPane when codeInputId is missing", () => {
        const updateCurrent = vi.fn();
        const patchCodeInput = vi.fn();

        applyRevealFillAnswer({
            isCodeInput: true,
            updateCurrent,
            patchCodeInput,
            fillPatch: {
                code: "print('solution')",
                codeLang: "python",
            } as any,
        });

        expect(updateCurrent).toHaveBeenCalledTimes(1);
        expect(patchCodeInput).not.toHaveBeenCalled();
    });

    it("lets solutionCode override the entry file without deleting helper files", () => {
        const workspace = buildSolutionWorkspace({
            language: "python",
            solutionCode: "print('new main')\n",
            stdin: "",
            solutionFiles: {
                "main.py": "print('old main')\n",
                "tools/helper.py": "def helper():\n    return 1\n",
            },
        });

        expect(workspace).not.toBeNull();

        const paths = workspacePathMap(workspace!);
        expect(paths.get("main.py")).toBe("print('new main')\n");
        expect(paths.get("tools/helper.py")).toBe(
            "def helper():\n    return 1\n",
        );
    });
});
