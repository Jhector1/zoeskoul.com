import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
    buildPythonSemanticHarness,
    parseSemanticHarnessResult,
} from "./pythonHarness.js";

function runHarness(args: {
    userCode: string;
    semanticChecks: Parameters<typeof buildPythonSemanticHarness>[0]["semanticChecks"];
}) {
    const source = buildPythonSemanticHarness(args);

    const result = spawnSync("python3", ["-c", source], {
        encoding: "utf8",
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            [
                `Python harness exited with status ${result.status}.`,
                "STDOUT:",
                result.stdout,
                "STDERR:",
                result.stderr,
                "HARNESS SOURCE:",
                source,
            ].join("\n"),
        );
    }

    const parsed = parseSemanticHarnessResult(result.stdout);

    if (!parsed) {
        throw new Error(
            [
                "Python harness did not print a parseable semantic result.",
                "STDOUT:",
                result.stdout,
                "STDERR:",
                result.stderr,
                "HARNESS SOURCE:",
                source,
            ].join("\n"),
        );
    }

    return parsed;
}

describe("buildPythonSemanticHarness", () => {
    it("unwraps accidental extra list layer for one list argument", () => {
        const result = runHarness({
            userCode: [
                "def validate_report(lines):",
                "    has_title = 'Study Report' in lines",
                "    has_completed_line = False",
                "    for line in lines:",
                "        if line.startswith('Completed:'):",
                "            has_completed_line = True",
                "    return has_title and has_completed_line",
            ].join("\n"),
            semanticChecks: [
                {
                    type: "function_returns",
                    functionName: "validate_report",
                    args: [
                        [
                            [
                                "Study Report",
                                "Completed: 2/3",
                                "Pending: 1",
                            ],
                        ],
                    ],
                    expected: true,
                    expectedKind: "value",
                },
                {
                    type: "function_returns",
                    functionName: "validate_report",
                    args: [
                        [
                            [
                                "Completed: 2/3",
                                "Pending: 1",
                            ],
                        ],
                    ],
                    argKinds: ["dict_entries"],
                    expected: false,
                    expectedKind: "value",
                },
            ],
        });

        expect(result).toEqual({
            ok: true,
            userStdout: "",
        });
    });it("compares returned class instances to expected list_of_dict_entries", () => {
        const result = runHarness({
            userCode: [
                "class Task:",
                "    def __init__(self, title, category, done=False):",
                "        self.title = title",
                "        self.category = category",
                "        self.done = done",
                "",
                "def build_sample_tasks():",
                "    return [",
                "        Task('Buy milk', 'home', False),",
                "        Task('Read chapter 3', 'school', True),",
                "        Task('Walk dog', 'home', False),",
                "    ]",
            ].join("\n"),
            semanticChecks: [
                {
                    type: "defines_class",
                    className: "Task",
                    message: "Define Task.",
                },
                {
                    type: "function_returns",
                    functionName: "build_sample_tasks",
                    args: [],
                    argKinds: [],
                    expected: [
                        [
                            ["title", "Buy milk"],
                            ["category", "home"],
                            ["done", false],
                        ],
                        [
                            ["title", "Read chapter 3"],
                            ["category", "school"],
                            ["done", true],
                        ],
                        [
                            ["title", "Walk dog"],
                            ["category", "home"],
                            ["done", false],
                        ],
                    ],
                    expectedKind: "list_of_dict_entries",
                    message:
                        "build_sample_tasks should return task objects with the expected attributes.",
                },
            ],
        });

        expect(result).toEqual({
            ok: true,
            userStdout: "",
        });
    });

    it("coerces list_of_dict_entries into class instances for function_returns", () => {
        const result = runHarness({
            userCode: [
                "class Item:",
                "    def __init__(self, name, price):",
                "        self.name = name",
                "        self.price = price",
                "",
                "def total_price(items):",
                "    total = 0",
                "    for item in items:",
                "        total += item.price",
                "    return total",
            ].join("\n"),
            semanticChecks: [
                {
                    type: "defines_class",
                    className: "Item",
                    message: "Define Item.",
                },
                {
                    type: "constructible",
                    className: "Item",
                    constructorArgs: ["Pen", 3],
                    message: "Item should construct.",
                },
                {
                    type: "instance_attributes",
                    className: "Item",
                    constructorArgs: ["Pen", 3],
                    attributes: ["name", "price"],
                    message: "Item should store attributes.",
                },
                {
                    type: "function_returns",
                    functionName: "total_price",
                    args: [
                        [
                            [
                                ["name", "Pen"],
                                ["price", 3],
                            ],
                            [
                                ["name", "Book"],
                                ["price", 7],
                            ],
                        ],
                    ],
                    argKinds: ["list_of_dict_entries"],
                    expected: 10,
                    expectedKind: "value",
                    message: "Should sum prices.",
                },
            ],
        });

        expect(result).toEqual({
            ok: true,
            userStdout: "",
        });
    });
});