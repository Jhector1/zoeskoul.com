import { afterEach, describe, expect, it } from "vitest";
import { clearCodeRunner } from "@zoeskoul/curriculum-runtime";
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
});
