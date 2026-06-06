import { describe, expect, it } from "vitest";
import { makeProgrammingExpected } from "@zoeskoul/practice-checks";
import { validatePythonSemanticCode } from "./validateSemanticPython.js";

describe("validatePythonSemanticCode", () => {
    it("passes fixture files to semantic Python checks", async () => {
        const result = await validatePythonSemanticCode({
            solutionCode: [
                "def load_tasks():",
                "    tasks = []",
                "    with open('tasks.txt', 'r') as file:",
                "        for line in file:",
                "            title, done = line.strip().split('|')",
                "            tasks.append({'title': title, 'done': done == 'True'})",
                "    return tasks",
            ].join("\n"),
            expected: makeProgrammingExpected({
                kind: "code_input",
                language: "python",
                checkMode: "semantic",
                semanticChecks: [
                    {
                        type: "function_returns",
                        functionName: "load_tasks",
                        args: [],
                        argKinds: [],
                        expected: [
                            [
                                ["title", "Write outline"],
                                ["done", false],
                            ],
                            [
                                ["title", "Review notes"],
                                ["done", true],
                            ],
                        ],
                        expectedKind: "list_of_dict_entries",
                    },
                ],
            }),
            files: [
                {
                    path: "tasks.txt",
                    content: "Write outline|False\nReview notes|True\n",
                },
            ],
        });

        expect(result).toEqual({ ok: true });
    });
});