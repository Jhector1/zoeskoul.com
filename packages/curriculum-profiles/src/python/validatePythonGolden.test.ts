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

    it("passes semantic python golden validation for a valid Book solution", async () => {
        setCodeRunner(async ({ code }: { code?: string }) => ({
            ok: true,
            stdout:
                typeof code === "string" && code.includes("__ZOE_SEMANTIC_RESULT__")
                    ? '__ZOE_SEMANTIC_RESULT__{"ok":true,"errors":[],"userStdout":"1984 by George Orwell\\nBrave New World by Aldous Huxley\\n"}'
                    : "",
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
                            type: "semantic",
                            language: "python",
                            solutionCode: `class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n    def description(self):\n        return f"{self.title} by {self.author}"\nbook1 = Book("1984", "George Orwell")\nbook2 = Book("Brave New World", "Aldous Huxley")\nprint(book1.description())\nprint(book2.description())\n`,
                            semanticChecks: [
                                { type: "defines_class", className: "Book" },
                                { type: "constructible", className: "Book", constructorArgs: ["Test Title", "Test Author"] },
                                { type: "instance_attributes", className: "Book", constructorArgs: ["Test Title", "Test Author"], attributes: ["title", "author"] },
                                { type: "method_returns", className: "Book", constructorArgs: ["Test Title", "Test Author"], methodName: "description", expected: "Test Title by Test Author" },
                                { type: "created_instances", className: "Book", min: 2 },
                                { type: "printed_line_count", min: 2 },
                            ],
                        },
                    },
                ],
            } as any,
        });

        expect(result.ok).toBe(true);
    });

    it("blocks semantic python golden validation when the official solution fails semantic checks", async () => {
        setCodeRunner(async ({ code }: { code?: string }) => ({
            ok: true,
            stdout:
                typeof code === "string" && code.includes("__ZOE_SEMANTIC_RESULT__")
                    ? '__ZOE_SEMANTIC_RESULT__{"ok":false,"errors":["Define a class named Book."],"userStdout":""}'
                    : "",
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
                            type: "semantic",
                            language: "python",
                            solutionCode: `print("wrong")`,
                            semanticChecks: [{ type: "defines_class", className: "Book" }],
                        },
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toContain(
            "CODE_PROFILE_SOLUTION_SEMANTIC_MISMATCH",
        );
        expect(result.ok).toBe(false);
    });
});
