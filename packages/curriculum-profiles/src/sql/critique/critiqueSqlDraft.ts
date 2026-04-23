import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CritiqueReport } from "../../shared/profileServices.js";
import { makeEmptyCritiqueReport } from "../../shared/noopReports.js";

export async function critiqueSqlDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<CritiqueReport> {
    const report = makeEmptyCritiqueReport(args.seed.topicId);

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind === "multi_choice" && exercise.options.length < 3) {
            report.issues.push({
                code: "SQL_WEAK_DISTRACTORS",
                category: "pedagogy",
                severity: "warn",
                exerciseId: exercise.id,
                message: "Multi-choice exercise has too few options for strong distractors.",
            });
        }
    }

    report.ok = !report.issues.some((x) => x.severity === "error");
    return report;
}