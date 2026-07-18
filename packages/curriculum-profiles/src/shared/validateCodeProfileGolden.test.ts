import { afterEach, describe, expect, it } from "vitest";
import { clearCodeRunner, setCodeRunner } from "@zoeskoul/curriculum-runtime";
import { validateCodeProfileGolden } from "./validateCodeProfileGolden.js";

describe("validateCodeProfileGolden", () => {
    afterEach(() => {
        clearCodeRunner();
    });

    it("blocks unsupported semantic languages with a clear code", async () => {
        const issues = await validateCodeProfileGolden({
            profileId: "javascript",
            expectedLanguage: "javascript" as any,
            allowedRecipeTypes: ["semantic"] as any,
            topicBundle: {
                topicId: "js-topic",
                subjectSlug: "javascript",
                moduleSlug: "js-1",
                sectionSlug: "js-1-1",
                prefix: "topics.javascript.js-1.js-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                runtimeDefaults: {
                    kind: "code",
                    language: "javascript",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "javascript",
                        recipe: {
                            type: "semantic",
                            language: "javascript",
                            solutionCode: `console.log("hello")`,
                            semanticChecks: [{ type: "printed_line_count", min: 1 }],
                        },
                    },
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "CODE_PROFILE_SEMANTIC_LANGUAGE_UNSUPPORTED",
        );
    });

    it("rejects incomplete multi-file solution coverage", async () => {
        const issues = await validateCodeProfileGolden({
            profileId: "python",
            expectedLanguage: "python",
            allowedRecipeTypes: ["fixed_tests"] as any,
            topicBundle: {
                topicId: "helpers-topic",
                subjectSlug: "python-v2",
                moduleSlug: "python-v2-4",
                sectionSlug: "python-v2-4-1",
                prefix: "topics.python-v2.python-v2-4.helpers-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                runtimeDefaults: {
                    kind: "code",
                    language: "python",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "python",
                        starterFiles: [
                            {
                                path: "main.py",
                                content: "from helpers import greet\nprint(greet())\n",
                                isEntry: true,
                            },
                            {
                                path: "helpers.py",
                                content: "def greet():\n    return 'hi'\n",
                            },
                        ],
                        solutionFiles: [
                            {
                                path: "main.py",
                                content: "from helpers import greet\nprint(greet())\n",
                                isEntry: true,
                            },
                        ],
                        recipe: {
                            type: "fixed_tests",
                            solutionCode: "from helpers import greet\nprint(greet())\n",
                            tests: [
                                { stdout: "hi\n", match: "exact" },
                                { stdout: "hi\n", match: "exact" },
                            ],
                        },
                    },
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "CODE_PROFILE_MULTI_FILE_SOLUTION_INCOMPLETE",
        );
    });

    it("validates direct manifest code when no authored draft is available", async () => {
        setCodeRunner(async ({ stdin }: { stdin?: string }) => ({
            ok: true,
            stdout: stdin === "3\n" ? "4\n" : "",
            stderr: "",
            exitCode: 0,
        }));

        const issues = await validateCodeProfileGolden({
            profileId: "python",
            expectedLanguage: "python",
            allowedRecipeTypes: ["fixed_tests"],
            topicBundle: {
                topicId: "add-one",
                subjectSlug: "python-v2",
                moduleSlug: "python-v2-1",
                sectionSlug: "python-v2-1-1",
                prefix: "topics.python-v2.python-v2-1.add-one",
                minutes: 10,
                topic: { labelKey: "label", summaryKey: "summary" },
                runtimeDefaults: { kind: "code", language: "python" },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "python",
                        recipe: {
                            type: "fixed_tests",
                            solutionCode: "n = int(input())\nprint(n + 1)\n",
                            tests: [
                                { stdin: "3\n", stdout: "4\n", match: "exact" },
                            ],
                        },
                    },
                ],
            } as any,
        });

        expect(issues).toEqual([]);
    });

    it("executes authored code instead of unresolved message references", async () => {
        let executedCode = "";
        setCodeRunner(async ({ code, stdin }: { code?: string; stdin?: string }) => {
            executedCode = String(code ?? "");
            return {
                ok: true,
                stdout: stdin === "3\n" ? "5\n" : "10\n",
                stderr: "",
                exitCode: 0,
            };
        });

        const issues = await validateCodeProfileGolden({
            profileId: "python",
            expectedLanguage: "python",
            allowedRecipeTypes: ["fixed_tests"],
            draft: {
                title: "Add two",
                summary: "Practice a different input transformation.",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Add two",
                        prompt: "Read a number and print two more.",
                        hint: "Convert the input to an integer.",
                        help: {
                            concept: "Integer input supports arithmetic.",
                            hint_1: "Call int around input.",
                            hint_2: "Add two before printing.",
                        },
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 2)\n",
                        tests: [
                            { stdin: "3\n", stdout: "5\n", match: "exact" },
                            { stdin: "8\n", stdout: "10\n", match: "exact" },
                        ],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
            topicBundle: {
                topicId: "add-two",
                subjectSlug: "python-v2",
                moduleSlug: "python-v2-1",
                sectionSlug: "python-v2-1-1",
                prefix: "topics.python-v2.python-v2-1.add-two",
                minutes: 10,
                topic: { labelKey: "label", summaryKey: "summary" },
                runtimeDefaults: { kind: "code", language: "python" },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "topics.python-v2.python-v2-1.add-two.quiz.code-1",
                        language: "python",
                        recipe: {
                            type: "fixed_tests",
                            solutionCode:
                                "@:topics.python-v2.python-v2-1.add-two.quiz.code-1.solutionCode",
                            tests: [
                                { stdin: "3\n", stdout: "5\n", match: "exact" },
                                { stdin: "8\n", stdout: "10\n", match: "exact" },
                            ],
                        },
                    },
                ],
            } as any,
        });

        expect(executedCode).toContain("print(n + 2)");
        expect(executedCode).not.toContain("@:");
        expect(issues).toEqual([]);
    });

});
