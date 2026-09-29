import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "apps/web/src/lib/practice/api/get/useCases/getStatus.ts",
    ),
    "utf8",
);

describe("language expected history sanitization", () => {
    it("supports native targetText summaries", () => {
        expect(source).toContain('k === "voice_input"');
        expect(source).toContain('k === "word_bank_arrange"');
        expect(source).toContain('k === "listen_build"');
        expect(source).toContain("raw?.targetText");
        expect(source).toContain("{ kind: k, targetText: String(targetText) }");
    });

    it("keeps text_input on value", () => {
        expect(source).toContain('k === "text_input"');
        expect(source).toContain('{ kind: "text_input", value: String(value) }');
    });
});
