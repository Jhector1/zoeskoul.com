
import { describe, expect, it } from "vitest";
import { buildHintCritiqueIssues } from "./buildHintCritiqueIssues.js";

describe("buildHintCritiqueIssues", () => {
    it("converts hint warnings into critique issues", () => {
        const issues = buildHintCritiqueIssues([
            "Hint reveals answer in exercise ex-1",
            "Hint reveals fill_blank answer in exercise ex-2",
        ]);

        expect(issues).toHaveLength(2);
        expect(issues[0]?.severity).toBe("error");
        expect(issues[0]?.message).toContain("Hint reveals answer in exercise ex-1");
    });

    it("returns an empty array for no warnings", () => {
        expect(buildHintCritiqueIssues([])).toEqual([]);
    });
});