import { describe, expect, it } from "vitest";

import { resolveToolStateSeed } from "./useToolCodeRunnerState";

describe("resolveToolStateSeed", () => {
    it("ignores starter-origin snapshots so current starter can win", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                workspaceOrigin: "starter",
                userEdited: false,
                code: "# old starter\n",
                workspace: {
                    version: 2,
                    language: "python",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: "# old starter\n",
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    activeFileId: "file:main.py",
                    entryFileId: "file:main.py",
                    stdin: "",
                    expanded: [],
                    leftPct: 40,
                },
            },
            defaultLang: "python",
            defaultCode: "# new starter\n",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialCode).toBe("# new starter\n");
        expect(resolved.initialWorkspace).toBeNull();
    });

    it("keeps user-origin snapshots even when they differ from the current default", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                workspaceOrigin: "user",
                userEdited: true,
                code: "print('learner work')\n",
                workspace: {
                    version: 2,
                    language: "python",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: "print('learner work')\n",
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    activeFileId: "file:main.py",
                    entryFileId: "file:main.py",
                    stdin: "",
                    expanded: [],
                    leftPct: 40,
                },
            },
            defaultLang: "python",
            defaultCode: "# current starter\n",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).not.toBeNull();
        expect(resolved.initialCode).toBe("print('learner work')\n");
    });


    it("does not treat passive saved starter snapshots as learner work", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                workspaceOrigin: "saved",
                userEdited: false,
                code: "print('stale old starter')\n",
                workspace: {
                    version: 2,
                    language: "python",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: "print('stale old starter')\n",
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    activeFileId: "file:main.py",
                    entryFileId: "file:main.py",
                    stdin: "",
                    expanded: [],
                    leftPct: 40,
                },
            },
            defaultLang: "python",
            defaultCode: "print('current starter')\n",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialCode).toBe("print('current starter')\n");
    });
    it("rejects stale Python saved state when the unbound tool now defaults to SQL", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                language: "python",
                code: 'print("Hello Python!")',
                workspace: {
                    version: 2,
                    language: "python",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: 'print("Hello Python!")',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    activeFileId: "file:main.py",
                    entryFileId: "file:main.py",
                    stdin: "",
                    expanded: [],
                    leftPct: 40,
                },
            },
            defaultLang: "sql",
            defaultCode: "SELECT 'Hello SQL' AS message;",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialLang).toBe("sql");
        expect(resolved.initialCode).toContain("SELECT");
        expect(resolved.initialCode).not.toContain("Hello Python");
        expect(resolved.initialWorkspace).toBeNull();
    });

    it("ignores empty-origin exercise placeholder seeds that only contain generic defaults", () => {
        const resolved = resolveToolStateSeed({
            saved: {
                workspaceOrigin: "empty",
                code: 'print("Hello Python!")',
                workspace: {
                    version: 2,
                    language: "python",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: 'print("Hello Python!")',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    activeFileId: "file:main.py",
                    entryFileId: "file:main.py",
                    stdin: "",
                    expanded: [],
                    leftPct: 40,
                },
            },
            defaultLang: "python",
            defaultCode: "",
            defaultStdin: "",
            defaultSqlDialect: "sqlite",
        });

        expect(resolved.compatibleSaved).toBeNull();
        expect(resolved.initialCode).toBe("");
        expect(resolved.initialWorkspace).toBeNull();
    });

    it("does not treat another exercise id's runtime snapshot as the current target", () => {
        const currentTargetKey =
            "python:module:section:topic:card:e2e-project-step-3";
        const otherExercise = {
            exerciseKey: "python:module:section:topic:card:e2e-project-step-2",
            exerciseId: "e2e-project-step-2",
            workspaceOrigin: "starter",
            code: "students = ['Ava', 'Mia']\nstudents.append('Zoe')\n",
        };

        const matchesCurrentTarget =
            otherExercise.exerciseKey === currentTargetKey ||
            otherExercise.exerciseId === "e2e-project-step-3";

        expect(matchesCurrentTarget).toBe(false);
    });
});
