import { describe, expect, it } from "vitest";
import { buildProjectScriptsForTest } from "./judge0Runner.js";

describe("Judge0 C compiler hardening", () => {
    it("shows warnings without treating them as learner errors", () => {
        const scripts = buildProjectScriptsForTest({
            language: "c",
            entry: "main.c",
            cCompilerMode: "learner",
        });
        expect(scripts.compile).toContain("-Wall -Wextra -Wpedantic");
        expect(scripts.compile).not.toContain("-Werror");
    });

    it("requires warning-free official solutions", () => {
        const scripts = buildProjectScriptsForTest({
            language: "c",
            entry: "main.c",
            cCompilerMode: "strict",
        });
        expect(scripts.compile).toContain("-Werror");
    });

    it("enables address and undefined-behavior sanitizers for golden validation", () => {
        const scripts = buildProjectScriptsForTest({
            language: "c",
            entry: "main.c",
            cCompilerMode: "sanitized",
        });
        expect(scripts.compile).toContain("-fsanitize=address,undefined");
        expect(scripts.run).toContain("detect_leaks=1");
        expect(scripts.run).toContain("UBSAN_OPTIONS");
    });
});
