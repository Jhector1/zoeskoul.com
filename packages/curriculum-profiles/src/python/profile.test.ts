import { describe, expect, it } from "vitest";
import { PYTHON_MINIMUM_FIXED_TESTS, pythonProfile } from "./profile.js";

describe("pythonProfile", () => {
    it("owns a minimum of two fixed tests for code_input", () => {
        expect(PYTHON_MINIMUM_FIXED_TESTS).toBe(2);
        expect(pythonProfile.codeInput?.minimumFixedTests).toBe(2);
    });

    it("renders browser-runner workspace wording rules that forbid Terminal as a distractor", () => {
        const rules =
            pythonProfile.renderAuthoringPromptRules?.({
                seed: {
                    workspacePolicy: {
                        workspace: {
                            capabilities: {
                                terminal: { enabled: false },
                                filesystem: { enabled: false },
                            },
                        },
                    },
                } as any,
                shape: {} as any,
            }) ?? [];

        expect(rules).toContain(
            '- Do not use "Terminal" even as a multiple-choice distractor. Use a safe non-workspace distractor instead.',
        );
    });

    it("forbids file access in non-filesystem Python topics", () => {
        const rules =
            pythonProfile.renderExerciseKindPromptRules?.({
                mode: "authoring",
                seed: {
                    workspacePolicy: {
                        workspace: {
                            capabilities: {
                                filesystem: { enabled: false },
                                terminal: { enabled: false },
                            },
                        },
                    },
                } as any,
            }) ?? [];

        expect(rules).toContain(
            "- When the workspace does not support files, do not generate open(...), pathlib file access, or filesystem path exercises.",
        );
    });

    it("allows provided fixture files in filesystem-enabled Python topics", () => {
        const rules =
            pythonProfile.renderExerciseKindPromptRules?.({
                mode: "authoring",
                seed: {
                    workspacePolicy: {
                        workspace: {
                            capabilities: {
                                filesystem: { enabled: true },
                                terminal: { enabled: false },
                            },
                        },
                    },
                } as any,
            }) ?? [];

        expect(rules).toContain(
            "- Every file I/O exercise must include the exact fixture files the code reads or updates.",
        );
        expect(rules).toContain(
            "- If different fixed tests expect different file contents, put the matching files under each tests[].files entry instead of using stdin to vary file contents.",
        );
    });

    it("carries authored solutionFiles and sourceChecks into the published manifest", () => {
        const manifest = pythonProfile.codeInput!.buildManifest({
            seed: {
                topicId: "helper-modules",
            },
            messageBase: "topics.python.python-1.helper-modules.quiz.code-1",
            exercise: {
                id: "code-1",
                starterCode: "# start\n",
                solutionCode: "from tools.names import clean_name\nprint(clean_name(' ava '))\n",
                entryFilePath: "main.py",
                starterFiles: [
                    {
                        path: "main.py",
                        content: "# start\n",
                        isEntry: true,
                    },
                ],
                solutionFiles: [
                    {
                        path: "main.py",
                        content: "from tools.names import clean_name\nprint(clean_name(' ava '))\n",
                        isEntry: true,
                    },
                    {
                        path: "tools/names.py",
                        content: "def clean_name(text):\n    return text.strip().title()\n",
                    },
                ],
                sourceChecks: [
                    {
                        type: "source_contains",
                        pattern: "from tools.names import clean_name",
                        message: "Import clean_name from tools.names.",
                    },
                ],
                tests: [
                    { stdout: "Ava\n", match: "exact" },
                    { stdout: "Ava\n", match: "exact" },
                ],
            },
        } as any);

        expect(manifest.solutionFiles).toEqual([
            {
                path: "main.py",
                content: "from tools.names import clean_name\nprint(clean_name(' ava '))\n",
                language: "python",
                isEntry: true,
            },
            {
                path: "tools/names.py",
                content: "def clean_name(text):\n    return text.strip().title()\n",
                language: "python",
            },
        ]);
        expect((manifest as any).sourceChecks).toEqual([
            {
                type: "source_contains",
                pattern: "from tools.names import clean_name",
                message: "Import clean_name from tools.names.",
            },
        ]);
        expect((manifest.recipe as any).solutionFiles).toEqual(manifest.solutionFiles);
        expect((manifest.recipe as any).sourceChecks).toEqual((manifest as any).sourceChecks);
    });

    it("shows expected examples for Python fixed_tests code_input", () => {
        const manifest = pythonProfile.codeInput!.buildManifest({
            seed: {
                topicId: "read-and-add",
            },
            messageBase: "topics.python.python-1.read-and-add.quiz.code-1",
            exercise: {
                id: "code-1",
                kind: "code_input",
                title: "Read and add",
                prompt: "Read a number and print one more.",
                starterCode: "n = int(input())\n",
                solutionCode: "n = int(input())\nprint(n + 1)\n",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n", stdout: "2\n", match: "exact" },
                    { stdin: "4\n", stdout: "5\n", match: "exact" },
                ],
                hint: "Hint",
                help: {
                    concept: "Concept",
                    hint_1: "Hint 1",
                    hint_2: "Hint 2",
                },
            },
        } as any);

        expect(manifest.showExpectedExample).toBe(true);
    });

    it("shows expected examples for Python semantic code_input", () => {
        const manifest = pythonProfile.codeInput!.buildManifest({
            seed: {
                topicId: "functions",
            },
            messageBase: "topics.python.python-1.functions.quiz.code-1",
            exercise: {
                id: "code-1",
                kind: "code_input",
                title: "Define double",
                prompt: "Write a function double that returns twice the number.",
                starterCode: "def double(n):\n    pass\n",
                solutionCode: "def double(n):\n    return n * 2\n",
                recipeType: "semantic",
                semanticChecks: [
                    {
                        type: "function_returns",
                        functionName: "double",
                        args: [3],
                        expected: 6,
                    },
                ],
                hint: "Hint",
                help: {
                    concept: "Concept",
                    hint_1: "Hint 1",
                    hint_2: "Hint 2",
                },
            },
        } as any);

        expect(manifest.showExpectedExample).toBe(true);
    });

    it("drops tests during repair when semanticChecks force a semantic recipe", () => {
        const codeInput = pythonProfile.codeInput;
        if (!codeInput) {
            throw new Error("pythonProfile.codeInput must be defined");
        }
        if (!codeInput.repairDraft) {
            throw new Error("pythonProfile.codeInput.repairDraft must be defined");
        }

        const repaired = codeInput.repairDraft({
            seed: {
                topicId: "classes-and-instances",
            },
            exercise: {
                id: "code-1",
                kind: "code_input",
                title: "Code",
                prompt: "Define a class and return a value from a method.",
                starterCode: "class Car:\n    pass\n",
                solutionCode: "class Car:\n    pass\n",
                tests: [
                    { stdin: "", stdout: "ok\n", match: "exact" },
                ],
                semanticChecks: [
                    { type: "defines_class", className: "Car" },
                ],
            },
        } as any);

        expect(repaired.recipeType).toBe("semantic");
        expect(repaired.tests).toBeUndefined();
    });
});
