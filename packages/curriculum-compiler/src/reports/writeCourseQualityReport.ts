import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot } from "@zoeskoul/curriculum-core";
import type { CurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFileAtomic(filePath: string, value: string) {
    const tempPath = `${filePath}.tmp`;
    await ensureDir(filePath);
    await fs.writeFile(tempPath, value, "utf8");
    await fs.rename(tempPath, filePath);
}

function formatTextReport(report: CurriculumQualityReport): string {
    const lines = [
        `subject: ${report.subjectSlug}`,
        `profile: ${report.profileId}`,
        `course: ${report.courseSlug ?? ""}`.trim(),
        `modules: ${report.summary.modules}`,
        `topics: ${report.summary.topicsTotal}`,
        `exercise counts: ${JSON.stringify(report.summary.exerciseKinds)}`,
        `code_input count: ${report.summary.codeInputs}`,
        `severity counts: ${JSON.stringify(report.severityCounts)}`,
        "",
    ].filter(Boolean);

    for (const issue of report.issues) {
        lines.push(
            `[${issue.severity}] ${issue.code}: ${issue.message}`,
        );
    }

    return lines.join("\n") + "\n";
}

export async function writeCourseQualityReport(args: {
    subjectSlug: string;
    report: CurriculumQualityReport;
}) {
    const baseDir = path.join(
        getRepoRoot(),
        ".curriculum-drafts",
        "reports",
        args.subjectSlug,
    );

    await writeFileAtomic(
        path.join(baseDir, "course-quality-report.json"),
        JSON.stringify(args.report, null, 2) + "\n",
    );
    await writeFileAtomic(
        path.join(baseDir, "course-quality-report.txt"),
        formatTextReport(args.report),
    );
}
