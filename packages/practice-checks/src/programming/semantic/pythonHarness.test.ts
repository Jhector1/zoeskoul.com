import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildPythonSemanticHarness,
    parseSemanticHarnessResult,
} from "./pythonHarness.js";

function runHarness(args: {
    userCode: string;
    semanticChecks: Parameters<typeof buildPythonSemanticHarness>[0]["semanticChecks"];
    semanticModuleNames?: string[];
    cwd?: string;
}) {
    const source = buildPythonSemanticHarness(args);

    const result = spawnSync("python3", ["-c", source], {
        cwd: args.cwd,
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

    it("checks state after a sequence of method calls", () => {
        const result = runHarness({
            userCode: [
                "class BankAccount:",
                "    def __init__(self, initial_balance):",
                "        self._balance = initial_balance",
                "",
                "    def deposit(self, amount):",
                "        if amount > 0:",
                "            self._balance += amount",
                "",
                "    def get_balance(self):",
                "        return self._balance",
            ].join("\n"),
            semanticChecks: [
                {
                    type: "method_sequence_returns",
                    className: "BankAccount",
                    constructorArgs: [100],
                    calls: [
                        {
                            methodName: "deposit",
                            methodArgs: [50],
                        },
                    ],
                    methodName: "get_balance",
                    methodArgs: [],
                    expected: 150,
                },
            ],
        });

        expect(result).toEqual({
            ok: true,
            userStdout: "",
        });
    });


    it("preloads solution modules and coerces class-discriminated semantic fixtures", () => {
        const cwd = mkdtempSync(path.join(tmpdir(), "zoe-semantic-modules-"));
        mkdirSync(path.join(cwd, "models"));
        mkdirSync(path.join(cwd, "services"));
        writeFileSync(path.join(cwd, "models", "book.py"), [
            "class BaseItem:",
            "    def __init__(self, title):",
            "        self.title = title",
            "",
            "    def display_line(self):",
            "        return self.title",
            "",
            "class Book(BaseItem):",
            "    def __init__(self, title, author):",
            "        super().__init__(title)",
            "        self.author = author",
            "",
            "    def display_line(self):",
            "        return f'Book: {self.title} by {self.author}'",
        ].join("\n"));
        writeFileSync(path.join(cwd, "services", "report_service.py"), [
            "def build_report(items):",
            "    return [item.display_line() for item in items]",
        ].join("\n"));

        const result = runHarness({
            cwd,
            userCode: "from services.report_service import build_report",
            semanticModuleNames: ["models.book", "services.report_service"],
            semanticChecks: [
                {
                    type: "defines_class",
                    className: "BaseItem",
                },
                {
                    type: "function_returns",
                    functionName: "build_report",
                    args: [
                        [
                            [
                                ["class", "Book"],
                                ["title", "Clean Code"],
                                ["author", "Robert C. Martin"],
                            ],
                        ],
                    ],
                    argKinds: ["list_of_dict_entries"],
                    expected: ["Book: Clean Code by Robert C. Martin"],
                    expectedKind: "value",
                },
            ],
        });

        expect(result).toEqual({
            ok: true,
            userStdout: "",
        });
    });

    it("treats accidental singleton primitive expected lists as the primitive value", () => {
        const result = runHarness({
            userCode: [
                "class Account:",
                "    def __init__(self, owner, balance):",
                "        self.owner = owner",
                "        self.balance = balance",
                "",
                "    def deposit(self, amount):",
                "        self.balance += amount",
                "        return self.balance",
            ].join("\n"),
            semanticChecks: [
                {
                    type: "attribute_sequence_equals",
                    className: "Account",
                    constructorArgs: ["Rae", 70],
                    calls: [{ methodName: "deposit", methodArgs: [25] }],
                    attributeName: "balance",
                    expected: [95],
                    expectedKind: "value",
                },
            ],
        });

        expect(result).toEqual({
            ok: true,
            userStdout: "",
        });
    });

});