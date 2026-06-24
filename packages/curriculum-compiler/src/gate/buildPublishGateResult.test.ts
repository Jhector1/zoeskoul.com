import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getRepoRoot } from "@zoeskoul/curriculum-core";
import { buildPublishGateResult } from "./buildPublishGateResult.js";

const subjectSlug = "python--publish-gate-quality-test--draft";
const reportRoot = path.join(
    getRepoRoot(),
    ".curriculum-drafts",
    "python",
    "reports",
    subjectSlug,
);

async function writeJson(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

afterEach(async () => {
    await fs.rm(reportRoot, { recursive: true, force: true });
});

describe("buildPublishGateResult", () => {
    it("aggregates curriculum quality severities into publish-gate stats", async () => {
        await writeJson(
            path.join(reportRoot, "module1", "topic-a", "quality-report.json"),
            {
                ok: false,
                profileId: "python",
                subjectSlug,
                summary: {
                    modules: 1,
                    topicsTotal: 1,
                    exercises: 1,
                    exerciseKinds: { code_input: 1 },
                    codeInputs: 1,
                    projects: 1,
                    capstones: 0,
                    thinFixedTestCount: 1,
                    blockers: 1,
                    errors: 1,
                    warnings: 1,
                    infos: 1,
                },
                severityCounts: {
                    blocker: 1,
                    error: 1,
                    warning: 1,
                    info: 1,
                },
                issues: [
                    { code: "A", severity: "blocker", message: "blocker" },
                    { code: "B", severity: "error", message: "error" },
                    { code: "C", severity: "warning", message: "warning" },
                    { code: "D", severity: "info", message: "info" },
                ],
            },
        );

        await writeJson(
            path.join(reportRoot, "course-quality-report.json"),
            {
                ok: false,
                profileId: "python",
                subjectSlug,
                summary: {
                    modules: 1,
                    topicsTotal: 1,
                    exercises: 1,
                    exerciseKinds: { code_input: 1 },
                    codeInputs: 1,
                    projects: 1,
                    capstones: 0,
                    thinFixedTestCount: 1,
                    blockers: 2,
                    errors: 3,
                    warnings: 4,
                    infos: 5,
                },
                severityCounts: {
                    blocker: 2,
                    error: 3,
                    warning: 4,
                    info: 5,
                },
                issues: [],
            },
        );

        const gate = await buildPublishGateResult({
            subjectSlug,
            profileId: "python",
        });

        expect(gate.stats.qualityBlockers).toBe(2);
        expect(gate.stats.qualityErrors).toBe(3);
        expect(gate.stats.qualityWarnings).toBe(4);
        expect(gate.stats.qualityInfos).toBe(5);
        expect(gate.reasons).toContain(
            "Curriculum quality report found 2 blocker(s).",
        );
        expect(gate.reasons).toContain(
            "Curriculum quality report found 3 error(s).",
        );
    });
});
