import { afterEach, describe, expect, it } from "vitest";
import { clearCodeRunner, setCodeRunner } from "@zoeskoul/curriculum-runtime";
import { validatePythonGolden } from "./validatePythonGolden.js";

describe("validatePythonGolden", () => {
    afterEach(() => {
        clearCodeRunner();
    });

    it("requires explicit python language and forbids SQL recipe/runtime fields", async () => {
        const result = await validatePythonGolden({
            seed: { topicId: "python-topic" } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "python-topic",
                subjectSlug: "python",
                moduleSlug: "python-1",
                sectionSlug: "python-1-section-1",
                prefix: "topics.python.python-1.python-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                runtimeDefaults: {
                    kind: "sql",
                    datasetId: "products_catalog",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "sql",
                        fixedSqlDialect: "sqlite",
                        recipe: {
                            type: "sql_query",
                            solutionCode: "SELECT * FROM products;",
                        },
                    },
                ],
            } as any,
        });

        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining([
                "CODE_PROFILE_RUNTIME_KIND_MISMATCH",
                "CODE_PROFILE_EXERCISE_LANGUAGE_MISMATCH",
                "CODE_PROFILE_RECIPE_TYPE_FORBIDDEN",
                "CODE_PROFILE_SQL_RUNTIME_FIELD_FORBIDDEN",
            ]),
        );
    });

    it("passes a normal python code_input bundle", async () => {
        setCodeRunner(async ({ stdin }: { stdin?: string }) => ({
            ok: true,
            stdout: stdin === "3\n" ? "4\n" : "",
            stderr: "",
            exitCode: 0,
        }));

        const result = await validatePythonGolden({
            seed: { topicId: "python-topic" } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "python-topic",
                subjectSlug: "python",
                moduleSlug: "python-1",
                sectionSlug: "python-1-section-1",
                prefix: "topics.python.python-1.python-topic",
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
                        recipe: {
                            type: "fixed_tests",
                            tests: [
                                {
                                    stdin: "3\n",
                                    stdout: "4\n",
                                    match: "exact",
                                },
                            ],
                            solutionCode: "n = int(input())\nprint(n + 1)\n",
                        },
                    },
                ],
            } as any,
        });

        expect(result.issues).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it("fails golden validation when solutionCode does not satisfy published tests", async () => {
        setCodeRunner(async () => ({
            ok: true,
            stdout: "5\n",
            stderr: "",
            exitCode: 0,
        }));

        const result = await validatePythonGolden({
            seed: { topicId: "python-topic" } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "python-topic",
                subjectSlug: "python",
                moduleSlug: "python-1",
                sectionSlug: "python-1-section-1",
                prefix: "topics.python.python-1.python-topic",
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
                        recipe: {
                            type: "fixed_tests",
                            tests: [
                                {
                                    stdin: "3\n",
                                    stdout: "4\n",
                                    match: "exact",
                                },
                            ],
                            solutionCode: "n = int(input())\nprint(n + 1)\n",
                        },
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toContain(
            "CODE_PROFILE_SOLUTION_OUTPUT_MISMATCH",
        );
        expect(result.ok).toBe(false);
    });
});
