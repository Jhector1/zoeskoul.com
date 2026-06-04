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
});
