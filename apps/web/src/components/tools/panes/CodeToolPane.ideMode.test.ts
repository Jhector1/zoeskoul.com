import { describe, expect, it } from "vitest";
import {
    buildReviewFullIdeExerciseStateKey,
    pickDirectReviewRuntimeWorkspace,
    resolveCodeToolPaneFullIdeMode,
    resolveCodeToolPaneReviewWorkspace,
    resolveEffectiveCodeToolPaneIdeConfig,
} from "@/components/tools/panes/CodeToolPane";


describe("resolveCodeToolPaneReviewWorkspace", () => {
    const runtimeWorkspace = {
        version: 2 as const,
        language: "python" as const,
        nodes: [
            {
                id: "file:main.py",
                kind: "file" as const,
                name: "main.py",
                parentId: null,
                content: "print('manifest or db')",
                createdAt: 0,
                updatedAt: 0,
            },
        ],
        openTabs: ["file:main.py"],
        activeFileId: "file:main.py",
        entryFileId: "file:main.py",
        stdin: "",
        expanded: [],
        leftPct: 40,
    };

    const localDraft = {
        savedAt: Date.now(),
        workspace: {
            ...runtimeWorkspace,
            nodes: runtimeWorkspace.nodes.map((node) => ({
                ...node,
                content: "print('stale local draft')",
            })),
        },
    };

    it("ignores CodeToolPane local drafts when stack persistence is off", () => {
        const resolved = resolveCodeToolPaneReviewWorkspace({
            draftStorageMode: "off",
            draft: localDraft,
            runtimeWorkspace,
            runtimeOrigin: "starter",
            runtimeUserEdited: false,
            runtimeProtected: false,
            runtimeUpdatedAt: 0,
        });

        expect(resolved).toBe(runtimeWorkspace);
        expect((resolved?.nodes[0] as any)?.content).toBe("print('manifest or db')");
    });

    it("keeps the legacy same-tab draft behavior when persistence is local", () => {
        const resolved = resolveCodeToolPaneReviewWorkspace({
            draftStorageMode: "local",
            draft: localDraft,
            runtimeWorkspace,
            runtimeOrigin: "starter",
            runtimeUserEdited: false,
            runtimeProtected: false,
            runtimeUpdatedAt: 0,
        });

        expect((resolved?.nodes[0] as any)?.content).toBe("print('stale local draft')");
    });
});

describe("resolveCodeToolPaneFullIdeMode", () => {
    it("uses the existing FullIDE workspace shell for terminal_workspace tasks", () => {
        const resolved = resolveCodeToolPaneFullIdeMode({
            ideConfig: {
                layoutMode: "terminal_workspace",
                requires: {
                    files: true,
                    terminal: true,
                },
            },
            reviewDirectWorkspaceReady: false,
            effectiveLanguage: "bash",
        });

        expect(resolved.usesWorkspaceShell).toBe(true);
        expect(resolved.forceDesktopLayout).toBe(false);
        expect(resolved.fullIdeTitle).toBe("Linux terminal");
        expect(resolved.ideShell.services.explorer?.enabled).toBe(false);
        expect(resolved.ideShell.services.editor?.showEditor).toBe(false);
        expect(resolved.ideShell.services.runner?.showTerminal).toBe(true);
        expect(resolved.ideShell.services.runner?.allowRun).toBe(false);
    });


    it("lets the active runtime cwd override stale tool prop cwd in review mode", () => {
        const resolved = resolveEffectiveCodeToolPaneIdeConfig({
            isReviewRouteMode: true,
            propIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace",
                terminalSessionScope: "topic",
                requires: {
                    files: true,
                    terminal: true,
                },
            },
            exerciseIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace/park-terminal-map",
                terminalSessionScope: "exercise",
            },
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map");
        expect(resolved?.requires?.files).toBe(true);
        expect(resolved?.terminalSessionScope).toBe("exercise");
    });

    it("keeps existing non-terminal file exercises editor-visible", () => {
        const resolved = resolveCodeToolPaneFullIdeMode({
            ideConfig: {
                requires: {
                    files: true,
                    multiFile: true,
                },
            },
            reviewDirectWorkspaceReady: false,
            effectiveLanguage: "python",
        });

        expect(resolved.usesWorkspaceShell).toBe(true);
        expect(resolved.forceDesktopLayout).toBe(false);
        expect(resolved.fullIdeTitle).toBe("Run code");
        expect(resolved.ideShell.services.explorer?.enabled).toBe(true);
        expect(resolved.ideShell.services.editor?.showEditor).toBe(true);
        expect(resolved.ideShell.services.runner?.showTerminal).not.toBe(true);
    });

    it("lets the currently bound runtime exercise cwd override stale tool props in review mode", () => {
        const resolved = resolveEffectiveCodeToolPaneIdeConfig({
            isReviewRouteMode: true,
            propIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace",
                terminalSessionScope: "exercise",
                requires: {
                    files: true,
                    terminal: true,
                },
            },
            exerciseIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace/park-terminal-map",
                terminalSessionScope: "exercise",
            },
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map");
        expect(resolved?.requires?.files).toBe(true);
        expect(resolved?.terminalSessionScope).toBe("exercise");
    });
});

describe("buildReviewFullIdeExerciseStateKey", () => {
    it("changes Monaco and editor-cache identity after an authoritative reset", () => {
        const ownerKey =
            "applied-python-projects:python-8-object-oriented-foundations:section:thinking-in-objects:sketch0:try-thinking-in-objects-sketch0";

        expect(buildReviewFullIdeExerciseStateKey(ownerKey, 7)).toBe(
            `${ownerKey}:reset:7`,
        );
        expect(buildReviewFullIdeExerciseStateKey(ownerKey, 8)).not.toBe(
            buildReviewFullIdeExerciseStateKey(ownerKey, 7),
        );
    });

    it("normalizes invalid reset revisions without changing the owner scope", () => {
        expect(buildReviewFullIdeExerciseStateKey("exercise:q1", Number.NaN)).toBe(
            "exercise:q1:reset:0",
        );
        expect(buildReviewFullIdeExerciseStateKey("exercise:q1", -3)).toBe(
            "exercise:q1:reset:0",
        );
    });
});


describe("pickDirectReviewRuntimeWorkspace multi-file starter hydration", () => {
    function pythonWorkspace(args: {
        main: string;
        car: string;
    }) {
        return {
            version: 2 as const,
            language: "python" as const,
            nodes: [
                {
                    id: "folder:models",
                    kind: "folder" as const,
                    name: "models",
                    parentId: null,
                    createdAt: 0,
                    updatedAt: 0,
                },
                {
                    id: "file:main.py",
                    kind: "file" as const,
                    name: "main.py",
                    parentId: null,
                    content: args.main,
                    createdAt: 0,
                    updatedAt: 0,
                },
                {
                    id: "file:models__car.py",
                    kind: "file" as const,
                    name: "car.py",
                    parentId: "folder:models",
                    content: args.car,
                    createdAt: 0,
                    updatedAt: 0,
                },
            ],
            openTabs: ["file:main.py", "file:models__car.py"],
            activeFileId: "file:models__car.py",
            entryFileId: "file:main.py",
            stdin: "",
            expanded: ["folder:models"],
            leftPct: 40,
        };
    }

    function fileContent(workspace: any, name: string) {
        return workspace?.nodes?.find(
            (node: any) => node?.kind === "file" && node?.name === name,
        )?.content;
    }

    const ownerKey =
        "applied-python-projects:python-8-object-oriented-foundations:section:thinking-in-objects:sketch0:try-thinking-in-objects-sketch0";
    const carStarter = [
        "class Car:",
        "    def __init__(self, make, model, miles):",
        "        self.make = make",
        "        self.model = model",
        "        self.miles = miles",
    ].join("\n");

    it("prefers the canonical exercise starter over an earlier blank editor shell", () => {
        const selected = pickDirectReviewRuntimeWorkspace({
            targetKey: ownerKey,
            effectiveLanguage: "python",
            normalizedToolWorkspace: null,
            editorRuntime: {
                ownerKey,
                targetKey: ownerKey,
                workspaceStatus: "ready",
                workspaceSeedMode: "starter",
                workspaceOrigin: "starter",
                userEdited: false,
                updatedAt: 1,
                workspace: pythonWorkspace({
                    main: "from models.car import Car",
                    car: "",
                }),
            },
            exerciseRuntime: {
                exerciseKey: ownerKey,
                targetKey: ownerKey,
                workspaceStatus: "ready",
                workspaceSeedMode: "starter",
                workspaceOrigin: "starter",
                userEdited: false,
                updatedAt: 2,
                workspace: pythonWorkspace({
                    main: "from models.car import Car",
                    car: carStarter,
                }),
            },
        });

        expect(fileContent(selected, "car.py")).toBe(carStarter);
    });

    it("fills a blank starter fixture from another deterministic runtime candidate", () => {
        const selected = pickDirectReviewRuntimeWorkspace({
            targetKey: ownerKey,
            effectiveLanguage: "python",
            normalizedToolWorkspace: null,
            editorRuntime: {
                ownerKey,
                targetKey: ownerKey,
                workspaceStatus: "ready",
                workspaceSeedMode: "starter",
                workspaceOrigin: "starter",
                userEdited: false,
                updatedAt: 2,
                workspace: pythonWorkspace({
                    main: "from models.car import Car",
                    car: carStarter,
                }),
            },
            exerciseRuntime: {
                exerciseKey: ownerKey,
                targetKey: ownerKey,
                workspaceStatus: "ready",
                workspaceSeedMode: "starter",
                workspaceOrigin: "starter",
                userEdited: false,
                updatedAt: 1,
                workspace: pythonWorkspace({
                    main: "from models.car import Car",
                    car: "",
                }),
            },
        });

        expect(fileContent(selected, "car.py")).toBe(carStarter);
    });

    it("does not refill a file intentionally cleared by the learner", () => {
        const selected = pickDirectReviewRuntimeWorkspace({
            targetKey: ownerKey,
            effectiveLanguage: "python",
            normalizedToolWorkspace: null,
            editorRuntime: {
                ownerKey,
                targetKey: ownerKey,
                workspaceStatus: "ready",
                workspaceSeedMode: "restored",
                workspaceOrigin: "user",
                userEdited: true,
                updatedAt: 10,
                workspace: pythonWorkspace({
                    main: "from models.car import Car",
                    car: "",
                }),
            },
            exerciseRuntime: {
                exerciseKey: ownerKey,
                targetKey: ownerKey,
                workspaceStatus: "ready",
                workspaceSeedMode: "starter",
                workspaceOrigin: "starter",
                userEdited: false,
                updatedAt: 2,
                workspace: pythonWorkspace({
                    main: "from models.car import Car",
                    car: carStarter,
                }),
            },
        });

        expect(fileContent(selected, "car.py")).toBe("");
    });
});
