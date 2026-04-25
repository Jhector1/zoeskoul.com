import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue } from "@zoeskoul/curriculum-profiles";

function countFillBlanks(template: string, prompt: string): number {
    const t = String(template ?? "");
    const p = String(prompt ?? "");

    const templateBracketBlanks = (t.match(/\[blank\d*\]/gi) ?? []).length;
    const templateUnderscoreBlanks = (t.match(/_{2,}/g) ?? []).length;
    const promptUnderscoreBlanks = (p.match(/_{2,}/g) ?? []).length;

    return templateBracketBlanks + templateUnderscoreBlanks + promptUnderscoreBlanks;
}

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