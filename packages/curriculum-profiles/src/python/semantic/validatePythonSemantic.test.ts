import { describe, expect, it } from "vitest";
import { validatePythonSemantic } from "./validatePythonSemantic.js";

describe("validatePythonSemantic", () => {
    it("does not treat class methods as standalone function-return exercises", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "encapsulation-and-responsibility" } as any,
            draft: {
                title: "Encapsulation and Responsibility",
                summary: "Practice object attributes and methods.",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Example",
                        bodyMarkdown:
                            "Example:\n\n```python\nclass Book:\n    def get_info(self):\n        return 'info'\n```\n\nLine by line: the class owns the method, and the method returns information.",
                    },
                    {
                        id: "try-it-yourself",
                        title: "Try it yourself",
                        bodyMarkdown:
                            "Try it yourself: change one method return value, predict the result, then run the code.",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-class-method",
                        kind: "code_input",
                        title: "Use a class method",
                        prompt:
                            "Create a `Book` object, update its title attribute, and print the result of `get_info()`.",
                        hint: "Call the method on the object.",
                        help: {
                            concept:
                                "Methods can return values that describe object state.",
                            hint_1: "Create the object first.",
                            hint_2: "Print the method result.",
                        },
                        starterCode:
                            "class Book:\n" +
                            "    def __init__(self, title, author):\n" +
                            "        self.title = title\n" +
                            "        self.author = author\n" +
                            "\n" +
                            "    def get_info(self):\n" +
                            "        return f\"{self.title} by {self.author}\"\n",
                        solutionCode:
                            "class Book:\n" +
                            "    def __init__(self, title, author):\n" +
                            "        self.title = title\n" +
                            "        self.author = author\n" +
                            "\n" +
                            "    def get_info(self):\n" +
                            "        return f\"{self.title} by {self.author}\"\n" +
                            "\n" +
                            "book = Book(\"1984\", \"George Orwell\")\n" +
                            "book.title = \"Animal Farm\"\n" +
                            "print(book.get_info())\n",
                        tests: [
                            {
                                stdin: "",
                                stdout: "Animal Farm by George Orwell\n",
                                match: "exact",
                            },
                        ],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).not.toContain(
            "PYTHON_FUNCTION_RETURN_MUST_BE_SEMANTIC",
        );
    });
    it("flags SQL recipe/runtime fields inside Python code_input exercises", async () => {
        const result = await validatePythonSemantic({
            seed: {
                topicId: "python-topic",
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                },
            } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Use input and print.",
                        help: {
                            concept: "Read input and compute the answer.",
                            hint_1: "Store the value in a variable.",
                            hint_2: "Print the final result.",
                        },
                        starterCode: "name = input()\n",
                        solutionCode: "print(input())\n",
                        tests: [{ stdin: "hi\n", stdout: "hi\n", match: "exact" }],
                        recipeType: "sql_query",
                        datasetId: "products_catalog",
                        checkSql: "SELECT * FROM products;",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining([
                "PYTHON_SQL_RECIPE_FORBIDDEN",
                "PYTHON_DATASET_ID_FORBIDDEN",
                "PYTHON_CHECK_SQL_FORBIDDEN",
            ]),
        );
        expect(result.ok).toBe(false);
    });

    it("flags SQL wording leakage in Python prompts", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write a SQL query that uses SELECT name FROM users.",
                        hint: "Think about the WHERE clause.",
                        help: {
                            concept: "You are querying a database table.",
                            hint_1: "Use SQL syntax.",
                            hint_2: "Return matching rows.",
                        },
                        starterCode: "SELECT name FROM users;",
                        solutionCode: "SELECT name FROM users;",
                        tests: [{ stdin: "", stdout: "", match: "exact" }],
                    },
                ],
            } as any,
        });

        expect(
            result.issues.some((issue) => issue.code === "PYTHON_SQL_QUERY_LEAKAGE"),
        ).toBe(true);
        expect(
            result.issues.some((issue) => issue.code === "PYTHON_SQL_CLAUSE_LEAKAGE"),
        ).toBe(true);
        expect(
            result.issues.some((issue) => issue.code === "PYTHON_SQL_NAMED_LEAKAGE"),
        ).toBe(true);
    });

    it("passes normal Python content", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch",
                        bodyMarkdown: [
                            "Worked example:",
                            "```python",
                            "n = int(input())",
                            "print(n + 1)",
                            "```",
                        ].join("\n"),
                    },
                    {
                        id: "sketch-2",
                        title: "Explain it",
                        bodyMarkdown:
                            "Line by line: the first line reads the number, and the second line prints the answer after adding one.",
                    },
                    {
                        id: "sketch-3",
                        title: "Try it yourself",
                        bodyMarkdown:
                            "Try it yourself: change the code so it prints the number plus two instead.",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Read a number and print the number plus one.",
                        hint: "Convert the input to an integer before adding.",
                        help: {
                            concept: "Use int(input()) when you need numeric math.",
                            hint_1: "Store the input in a variable.",
                            hint_2: "Print the computed result.",
                        },
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it("flags Python code_input exercises that omit programming tests", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Read a number and print the number plus one.",
                        hint: "Convert the input before adding.",
                        help: {
                            concept: "Use int(input()) for numeric input.",
                            hint_1: "Store the input in a variable.",
                            hint_2: "Print the final result.",
                        },
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toContain("PYTHON_TESTS_MISSING");
        expect(result.ok).toBe(false);
    });

    it("flags function-style Python exercises that expect stdout without printing", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt:
                            "Create a function that checks a student's grade and returns 'Pass' or 'Fail'.",
                        hint: "Return the correct string.",
                        help: {
                            concept: "Use conditionals to decide what the function should return.",
                            hint_1: "Check the invalid case first.",
                            hint_2: "Return the matching label.",
                        },
                        starterCode: "def grade_checker(grade):\n    # Your code here\n",
                        solutionCode:
                            "def grade_checker(grade):\n    if grade >= 60:\n        return 'Pass'\n    return 'Fail'\n",
                        tests: [{ stdin: "85\n", stdout: "Pass\n", match: "exact" }],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toContain(
            "PYTHON_FUNCTION_STDOUT_MISMATCH",
        );
        expect(result.ok).toBe(false);
    });

    it("flags placeholder boolean tests when the exercise expects named string outputs", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Eligibility Checker",
                        prompt:
                            "Create a program that checks if a person is eligible to vote. Print 'Eligible' or 'Not eligible'.",
                        hint: "Use an and condition.",
                        help: {
                            concept: "Check both conditions.",
                            hint_1: "Use age and citizenship.",
                            hint_2: "Print the matching label.",
                        },
                        starterCode: "age = 20\nis_citizen = True\n",
                        solutionCode:
                            "age = 20\nis_citizen = True\nif age >= 18 and is_citizen:\n    print('Eligible')\nelse:\n    print('Not eligible')\n",
                        tests: [{ stdin: "1\n", stdout: "True\n", match: "exact" }],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toContain(
            "PYTHON_PLACEHOLDER_BOOLEAN_TESTS_MISMATCH",
        );
        expect(result.ok).toBe(false);
    });

    it("flags Python drafts that do not teach with a worked example even when practice exists", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Definition",
                        bodyMarkdown:
                            "Conditional statements let your program choose between branches.",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Read a number and print the number plus one.",
                        hint: "Convert the input before adding.",
                        help: {
                            concept: "Use int(input()) for numeric input.",
                            hint_1: "Store the input in a variable.",
                            hint_2: "Print the final result.",
                        },
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining([
                "PROGRAMMING_WORKED_EXAMPLE_MISSING",
            ]),
        );
        expect(result.ok).toBe(false);
    });

    it("accepts real code_input practice instead of requiring a try-it-yourself sketch", async () => {
        const result = await validatePythonSemantic({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Worked example",
                        bodyMarkdown: [
                            "Worked example:",
                            "```python",
                            "n = int(input())",
                            "print(n + 1)",
                            "```",
                        ].join("\n"),
                    },
                    {
                        id: "sketch-2",
                        title: "Explain it",
                        bodyMarkdown:
                            "Line by line: the first line reads the number, and the second line prints the answer after adding one.",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Read a number and print the number plus one.",
                        hint: "Convert the input before adding.",
                        help: {
                            concept: "Use int(input()) for numeric input.",
                            hint_1: "Store the input in a variable.",
                            hint_2: "Print the final result.",
                        },
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(result.issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
        );
        expect(result.ok).toBe(true);
    });

    it("passes Python drafts with a worked example, line-by-line explanation, and try-it-yourself sketch", async () => {
        const result = await validatePythonSemantic({
            seed: {
                topicId: "python-topic",
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                },
            } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Worked example",
                        bodyMarkdown: [
                            "Worked example:",
                            "```python",
                            "score = 72",
                            "if score >= 60:",
                            "    print('Pass')",
                            "```",
                        ].join("\n"),
                    },
                    {
                        id: "sketch-2",
                        title: "Explain it",
                        bodyMarkdown:
                            "Line by line: the first line stores the score, the second line checks the condition, and the third line prints the result.",
                    },
                    {
                        id: "sketch-3",
                        title: "Try it yourself",
                        bodyMarkdown:
                            "Try it yourself: change the score to 45 and predict what the program will print before you run it.",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Read a number and print the number plus one.",
                        hint: "Convert the input before adding.",
                        help: {
                            concept: "Use int(input()) for numeric input.",
                            hint_1: "Store the input in a variable.",
                            hint_2: "Print the final result.",
                        },
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
                        recipeType: "fixed_tests",
                    },
                ],
            } as any,
        });

        expect(
            result.issues.some((issue) =>
                issue.code.startsWith("PROGRAMMING_"),
            ),
        ).toBe(false);
        expect(result.ok).toBe(true);
    });
});
