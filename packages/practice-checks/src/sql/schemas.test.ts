import { describe, expect, it } from "vitest";
import { SqlExpectedSchema } from "./schemas";

describe("SqlExpectedSchema", () => {
    it("parses sql expected", () => {
        const parsed = SqlExpectedSchema.parse({
            kind: "code_input",
            language: "sql",
            runtime: { kind: "sql", datasetId: "inventory_ops", resultShape: "table" },
            tests: [{ kind: "sql", compareTo: "solution" }],
            solutionCode: "SELECT * FROM inventory_items;",
        });

        expect(parsed.strategy).toBe("sql");
        expect(parsed.tests[0]?.kind).toBe("sql");
    });
});
