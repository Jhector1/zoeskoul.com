import fs from "node:fs/promises";
import path from "node:path";
import type { CourseQualityReport } from "@zoeskoul/curriculum-contracts";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFileAtomic(filePath: string, value: string) {
    const tempPath = `${filePath}.tmp`;
    await ensureDir(filePath);
    await fs.writeFile(tempPath, value, "utf8");
    await fs.rename(tempPath, filePath);
}

function formatTextReport(report: CourseQualityReport): string {
    const lines = [
        `subject: ${report.subjectSlug}`,
        `profile: ${report.profileId}`,
        `course: ${report.courseSlug ?? ""}`.trim(),
        `modules: ${report.modulesTotal}`,
        `topics: ${report.topicsTotal}`,
        `exercise counts: ${JSON.stringify(report.exerciseCounts)}`,
        `code_input summary: ${JSON.stringify(report.codeInputSummary)}`,
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
    report: CourseQualityReport;
}) {
    const baseDir = path.join(
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
