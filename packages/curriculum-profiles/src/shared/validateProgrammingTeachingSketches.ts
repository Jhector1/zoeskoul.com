import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "./profileServices.js";

function hasCodeFence(text: string): boolean {
    return /```[\s\S]*?```/.test(text);
}

function codeFenceBlocks(text: string): string[] {
    return Array.from(text.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)).map(
        (match) => match[1] ?? "",
    );
}

function hasWorkedExample(text: string): boolean {
    return (
        hasCodeFence(text) ||
        /\bfor example\b/i.test(text) ||
        /\bexample\s*:/i.test(text) ||
        /\bworked example\b/i.test(text)
    );
}

function hasLineByLineExplanation(text: string): boolean {
    return (
        /\bline by line\b/i.test(text) ||
        /\beach line\b/i.test(text) ||
        /\bthis line\b/i.test(text) ||
        /\bfirst line\b/i.test(text) ||
        /\bsecond line\b/i.test(text) ||
        /\bstep by step\b/i.test(text) ||
        /\blet'?s break (it|this) down\b/i.test(text)
    );
}

function hasTryItYourself(text: string): boolean {
    return (
        /\btry it yourself\b/i.test(text) ||
        /\btry this\b/i.test(text) ||
        /\byour turn\b/i.test(text) ||
        /\btry on your own\b/i.test(text)
    );
}

function hasMultilineCodeExample(text: string): boolean {
    return codeFenceBlocks(text).some((block: string) => {
        const lines = block
            .split("\n")
            .map((line: string) => line.trim())
            .filter(Boolean);
        return lines.length >= 2;
    });
}

export function validateProgrammingTeachingSketches(args: {
    profileId: string;
    draft: TopicAuthoringDraft;
}): SemanticValidationIssue[] {
    const issues: SemanticValidationIssue[] = [];
    const blocks = Array.isArray(args.draft.sketchBlocks) ? args.draft.sketchBlocks : [];
    const bodies = blocks.map((block: TopicAuthoringDraft["sketchBlocks"][number]) =>
        String(block.bodyMarkdown ?? ""),
    );
    const combined = bodies.join("\n\n");

    if (!bodies.some((body: string) => hasWorkedExample(body))) {
        issues.push({
            code: "PROGRAMMING_WORKED_EXAMPLE_MISSING",
            category: "pedagogy",
            severity: "error",
            message:
                `Programming profile "${args.profileId}" is missing a concrete worked example in sketchBlocks. Include a fenced code example or an explicit worked example walkthrough.`,
        });
    }

    if (
        hasMultilineCodeExample(combined) &&
        !bodies.some((body: string) => hasLineByLineExplanation(body))
    ) {
        issues.push({
            code: "PROGRAMMING_LINE_BY_LINE_EXPLANATION_MISSING",
            category: "pedagogy",
            severity: "error",
            message:
                `Programming profile "${args.profileId}" includes a multi-line code example but does not explain it step by step or line by line in sketchBlocks.`,
        });
    }

    if (!bodies.some((body: string) => hasTryItYourself(body))) {
        issues.push({
            code: "PROGRAMMING_TRY_IT_YOURSELF_MISSING",
            category: "pedagogy",
            severity: "error",
            message:
                `Programming profile "${args.profileId}" is missing a "Try it yourself" style learner prompt in sketchBlocks.`,
        });
    }

    return issues;
}
