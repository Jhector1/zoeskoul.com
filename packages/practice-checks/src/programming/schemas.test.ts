import { describe, expect, it } from "vitest";
import { ProgrammingExpectedSchema } from "./schemas";

describe("ProgrammingExpectedSchema", () => {
    it("parses stdout expected", () => {
        const parsed = ProgrammingExpectedSchema.parse({
            kind: "code_input",
            tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
        });

        expect(parsed.checkMode).toBe("stdout");
        expect(parsed.tests).toHaveLength(1);
    });
    it("preserves per-test fixture files", () => {
        const parsed = ProgrammingExpectedSchema.parse({
            kind: "code_input",
            tests: [
                {
                    stdin: "",
                    stdout: "Alice\n",
                    match: "exact",
                    files: [
                        {
                            path: "people.csv",
                            content: "name\nAlice\n",
                            readOnly: true,
                        },
                    ],
                },
            ],
        });

        expect(parsed.tests[0]?.files).toEqual([
            {
                path: "people.csv",
                content: "name\nAlice\n",
                readOnly: true,
            },
        ]);
    });
    it("parses semantic expected", () => {
        const parsed = ProgrammingExpectedSchema.parse({
            kind: "code_input",
            checkMode: "semantic",
            language: "python",
            semanticChecks: [{ type: "defines_class", className: "Book" }],
        });

        expect(parsed.checkMode).toBe("semantic");
        expect(parsed.semanticChecks).toHaveLength(1);
    });

    it("preserves terminal expectations when provided", () => {
        const parsed = ProgrammingExpectedSchema.parse({
            kind: "code_input",
            tests: [{ stdout: "" }],
            terminalExpectations: {
                requiredCommands: [
                    {
                        pattern: "^pwd$",
                        message: "Run pwd.",
                    },
                ],
                outputContains: ["/workspace"],
                cwdEndsWith: "linux-lab",
            },
        });

        expect(parsed.terminalExpectations).toEqual({
            requiredCommands: [
                {
                    pattern: "^pwd$",
                    message: "Run pwd.",
                },
            ],
            outputContains: ["/workspace"],
            cwdEndsWith: "linux-lab",
        });
    });

    it("fails when semantic expected has no semanticChecks", () => {
        const parsed = ProgrammingExpectedSchema.safeParse({
            kind: "code_input",
            checkMode: "semantic",
            language: "python",
        });

        expect(parsed.success).toBe(false);
    });
});
