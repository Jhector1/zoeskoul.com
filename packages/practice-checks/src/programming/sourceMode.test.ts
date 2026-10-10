import { describe, expect, it } from "vitest";
import { ProgrammingExpectedSchema } from "./schemas.js";

describe("programming source check mode", () => {
    it("accepts web source-only expected payloads without stdout tests", () => {
        const parsed = ProgrammingExpectedSchema.safeParse({
            kind: "code_input",
            language: "web",
            checkMode: "source",
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;
        expect(parsed.data.language).toBe("web");
        expect(parsed.data.checkMode).toBe("source");
        expect(parsed.data.tests).toEqual([]);
    });
});
