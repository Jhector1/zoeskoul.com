import { describe, expect, it } from "vitest";
import { ProgrammingExpectedSchema } from "./schemas.js";

describe("ProgrammingExpectedSchema semantic file paths", () => {
    it("preserves semantic check paths through shared parsing", () => {
        const parsed = ProgrammingExpectedSchema.parse({
            kind: "code_input",
            language: "python",
            checkMode: "semantic",
            semanticChecks: [
                {
                    type: "defines_class",
                    className: "Book",
                    path: "models/book.py",
                },
            ],
            solutionCode: "class Book:\n    pass\n",
        });

        expect(parsed.checkMode).toBe("semantic");
        if (parsed.checkMode !== "semantic") {
            throw new Error("Expected semantic programming payload.");
        }

        expect(parsed.semanticChecks[0]?.path).toBe("models/book.py");
    });
});
