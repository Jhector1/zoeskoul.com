import {countFillBlanks, TopicAuthoringDraft} from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue } from "@zoeskoul/curriculum-profiles";



export function buildFillBlankSingleBlankIssues(args: {
    draft: TopicAuthoringDraft;
}): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "fill_blank_choice") continue;

        const blankCount = countFillBlanks(exercise.template, exercise.prompt);

        if (blankCount > 1) {
            issues.push({
                code: "FILL_BLANK_TOO_MANY_BLANKS",
                category: "clarity",
                severity: "error",
                message: `fill_blank_choice exercise "${exercise.id}" contains ${blankCount} blanks, but this kind supports exactly 1.`,
            });
        }
    }

    return issues;
}