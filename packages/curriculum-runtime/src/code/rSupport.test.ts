import { afterEach, describe, expect, it, vi } from "vitest";

import {
    buildProjectScriptsForTest,
    resolveJudge0LanguageId,
} from "./judge0Runner.js";

describe("R Judge0 support", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses only the verified JUDGE0_LANG_R override for single-file R", () => {
        vi.stubEnv("JUDGE0_LANG_R", "99");
        expect(resolveJudge0LanguageId("r")).toBe(99);

        vi.stubEnv("JUDGE0_LANG_R", "");
        expect(resolveJudge0LanguageId("r")).toBeNull();
    });

    it("builds an R project run script without a compile step", () => {
        const scripts = buildProjectScriptsForTest({
            language: "r",
            entry: "src/main.R",
            files: [
                { path: "src/main.R", content: 'source("../helpers.R")\n' },
                { path: "helpers.R", content: "double_value <- function(x) x * 2\n" },
            ],
        });

        expect(scripts.compile).toBeNull();
        expect(scripts.run).toContain('ENTRY="src/main.R"');
        expect(scripts.run).toContain('Rscript --vanilla "$ENTRY"');
    });
});
