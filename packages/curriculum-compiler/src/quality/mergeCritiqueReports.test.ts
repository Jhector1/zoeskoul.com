
import { describe, expect, it } from "vitest";
import { mergeCritiqueReports } from "./mergeCritiqueReports.js";

describe("mergeCritiqueReports", () => {
    it("merges multiple reports and extra issues into one report", () => {
        const merged = mergeCritiqueReports({
            topicId: "topic-1",
            reports: [
                {
                    ok: true,
                    topicId: "topic-1",
                    issues: [
                        {
                            code: "A",
                            category: "clarity",
                            severity: "warn",
                            message: "Warn A",
                        },
                    ],
                },
                {
                    ok: false,
                    topicId: "topic-1",
                    issues: [
                        {
                            code: "B",
                            category: "clarity",
                            severity: "error",
                            message: "Error B",
                        },
                    ],
                },
            ] as any,
            extraIssues: [
                {
                    code: "C",
                    category: "clarity",
                    severity: "error",
                    message: "Error C",
                },
            ] as any,
        });

        expect(merged.ok).toBe(false);
        expect(merged.issues).toHaveLength(3);
    });
});