import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue } from "@zoeskoul/curriculum-profiles";

function normalizePrompt(prompt: string): string {
    return prompt.trim().toLowerCase();
}

function looksPluralMultiChoicePrompt(prompt: string): boolean {
    const p = normalizePrompt(prompt);

    return (
        p.includes("select all") ||
        p.includes("choose all") ||
        p.includes("all that apply") ||
        p.includes("which are") ||
        p.includes("which scenarios") ||
        p.includes("which of the following are") ||
        p.includes("which of these are") ||
        p.includes("which statements are") ||
        p.includes("which examples are") ||
        p.includes("which uses are")
    );
}

export function buildMultiChoiceCompletenessIssues(args: {
    draft: TopicAuthoringDraft;
}): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "multi_choice") continue;

        const correctCount = exercise.correctOptionIds.length;

        if (looksPluralMultiChoicePrompt(exercise.prompt) && correctCount < 2) {
            issues.push({
                code: "MULTI_CHOICE_TOO_FEW_CORRECT_OPTIONS",
                category: "clarity",
                severity: "warn",
                message: `Multi-choice exercise "${exercise.id}" looks like it should have multiple correct answers, but only ${correctCount} correct option is marked.`,
            });
        }
    }

    return issues;
}