import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeProgrammingExpected } from "@zoeskoul/practice-checks";
import { clearCodeRunner, setCodeRunner } from "./runner.js";
import { validatePythonSemanticCode } from "./validateSemanticPython.js";

describe("validatePythonSemanticCode file-scoped checks", () => {
    beforeEach(() => clearCodeRunner());
    afterEach(() => clearCodeRunner());

    it("builds the semantic harness from the authored solution file named by path", async () => {
        let executedHarness = "";

        setCodeRunner(async ({ code }) => {
            executedHarness = String(code ?? "");
            const usedBookFile =
                executedHarness.includes("class Book(CatalogItem)") &&
                !executedHarness.includes(
                    "entry file must not be used for this check",
                );

            return {
                ok: true,
                stdout: usedBookFile
                    ? '__ZOE_SEMANTIC_RESULT__{"ok":true,"errors":[],"userStdout":""}'
                    : '__ZOE_SEMANTIC_RESULT__{"ok":false,"errors":["wrong source"],"userStdout":""}',
                stderr: "",
                exitCode: 0,
            };
        });

        const result = await validatePythonSemanticCode({
            solutionCode:
                "raise RuntimeError('entry file must not be used for this check')\n",
            expected: makeProgrammingExpected({
                kind: "code_input",
                language: "python",
                checkMode: "semantic",
                semanticChecks: [
                    {
                        type: "method_returns",
                        path: "models/book.py",
                        className: "Book",
                        constructorArgs: ["Dune"],
                        methodName: "label",
                        methodArgs: [],
                        expected: "Book: Dune",
                    },
                ],
            }),
            files: [
                {
                    path: "models/catalog_item.py",
                    content: [
                        "class CatalogItem:",
                        "    def __init__(self, title):",
                        "        self.title = title",
                        "",
                    ].join("\n"),
                },
                {
                    path: "models/book.py",
                    content: [
                        "from models.catalog_item import CatalogItem",
                        "",
                        "class Book(CatalogItem):",
                        "    def label(self):",
                        "        return f\"Book: {self.title}\"",
                        "",
                    ].join("\n"),
                },
            ],
            semanticModuleNames: ["models.catalog_item", "models.book"],
        });

        expect(result).toEqual({ ok: true });
        expect(executedHarness).toContain("class Book(CatalogItem)");
        expect(executedHarness).not.toContain(
            "entry file must not be used for this check",
        );
    });

    it("fails clearly when a file-scoped semantic check names a missing solution file", async () => {
        const result = await validatePythonSemanticCode({
            solutionCode: "print('entry')\n",
            expected: makeProgrammingExpected({
                kind: "code_input",
                language: "python",
                checkMode: "semantic",
                semanticChecks: [
                    {
                        type: "defines_class",
                        path: "models/missing.py",
                        className: "Missing",
                    },
                ],
            }),
            files: [],
        });

        expect(result).toEqual({
            ok: false,
            reason: "execution_failed",
            message: "Missing semantic-check solution file: models/missing.py",
        });
    });
});
