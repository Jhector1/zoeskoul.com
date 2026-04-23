import type { CritiqueIssue, CritiqueReport } from "@zoeskoul/curriculum-profiles";

function dedupeIssues(issues: CritiqueIssue[]): CritiqueIssue[] {
    const seen = new Set<string>();
    const out: CritiqueIssue[] = [];

    for (const issue of issues) {
        const key = JSON.stringify([
            issue.code,
            issue.category,
            issue.severity,
            issue.exerciseId ?? "",
            issue.message,
        ]);

        if (seen.has(key)) continue;
        seen.add(key);
        out.push(issue);
    }

    return out;
}

export function mergeCritiqueReports(args: {
    topicId: string;
    reports: CritiqueReport[];
    extraIssues?: CritiqueIssue[];
}): CritiqueReport {
    const mergedIssues = dedupeIssues([
        ...args.reports.flatMap((report) => report.issues ?? []),
        ...(args.extraIssues ?? []),
    ]);

    return {
        topicId: args.topicId,
        ok: !mergedIssues.some((issue) => issue.severity === "error"),
        issues: mergedIssues,
    };
}