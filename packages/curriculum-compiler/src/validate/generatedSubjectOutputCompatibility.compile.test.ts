import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot } from "@zoeskoul/curriculum-core";

describe("generated subject output compatibility test module", () => {
    it("keeps codeInputCount declared once so the file compiles", () => {
        const filePath = path.join(
            getRepoRoot(),
            "packages/curriculum-compiler/src/validate/generatedSubjectOutputCompatibility.test.ts",
        );
        const source = fs.readFileSync(filePath, "utf8");
        const declarations = source.match(/\blet\s+codeInputCount\s*=/g) ?? [];

        expect(declarations).toHaveLength(1);
    });
});
