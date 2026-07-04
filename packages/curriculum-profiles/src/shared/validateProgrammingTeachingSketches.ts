import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
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

function hasMultilineCodeExample(text: string): boolean {
    return codeFenceBlocks(text).some((block: string) => {
        const lines = block
            .split("\n")
            .map((line: string) => line.trim())
            .filter(Boolean);
        return lines.length >= 2;
    });
}


function normalizeKebabText(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function isTryItPlaceholderSketch(block: TopicAuthoringDraft["sketchBlocks"][number]) {
    const id = normalizeKebabText((block as { id?: unknown }).id);
    const title = normalizeKebabText((block as { title?: unknown }).title);
    const body = String((block as { bodyMarkdown?: unknown }).bodyMarkdown ?? "").trim();

    // A model may add a prose sketch named "Try it yourself" even though
    // embedded Try It activities are represented by code_input exercises. Do
    // not count that placeholder as a teaching sketch for all_sketches.
    return (
        id === "try-it-yourself" ||
        title === "try-it-yourself" ||
        (title === "try-it" && body.length < 240)
    );
}

function teachingSketchBlocks(draft: TopicAuthoringDraft) {
    const blocks = Array.isArray(draft.sketchBlocks) ? draft.sketchBlocks : [];
    return blocks.filter((block) => !isTryItPlaceholderSketch(block));
}

function codeInputCount(draft: TopicAuthoringDraft): number {
    return Array.isArray(draft.quizDraft)
        ? draft.quizDraft.filter((exercise) => exercise?.kind === "code_input").length
        : 0;
}

export function validateProgrammingTeachingSketches(args: {
    profileId: string;
    seed?: TopicSeed;
    draft: TopicAuthoringDraft;
}): SemanticValidationIssue[] {
    const issues: SemanticValidationIssue[] = [];
    const blocks = teachingSketchBlocks(args.draft);
    const bodies = blocks.map((block: TopicAuthoringDraft["sketchBlocks"][number]) =>
        String(block.bodyMarkdown ?? ""),
    );
    const combined = bodies.join("\n\n");
    const projectLike = isProjectLikeTopic(args.seed);

    if (!projectLike && !bodies.some((body: string) => hasWorkedExample(body))) {
        issues.push({
            code: "PROGRAMMING_WORKED_EXAMPLE_MISSING",
            category: "pedagogy",
            severity: "error",
            message:
                `Programming profile "${args.profileId}" is missing a concrete worked example in sketchBlocks. Include a fenced code example or an explicit worked example walkthrough.`,
        });
    }

    if (
        !projectLike &&
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

    const conceptualOnly = args.seed?.practice?.conceptualOnly === true;
    const requiresTryIt = args.seed?.practice?.requiresTryIt === true;
    const placement = args.seed?.practice?.tryItPlacement;
    const requiredTryItCount = placement === "all_sketches" ? blocks.length : 1;
    const actualCodeInputs = codeInputCount(args.draft);

    if (!conceptualOnly && requiresTryIt && actualCodeInputs < 1) {
        issues.push({
            code: "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
            category: "pedagogy",
            severity: "error",
            message:
                `Programming profile "${args.profileId}" requires Try It coverage for this hands-on topic, but draft.quizDraft does not contain a code_input practice path.`,
        });
    }

    if (
        !conceptualOnly &&
        requiresTryIt &&
        placement === "all_sketches" &&
        blocks.length > 0 &&
        actualCodeInputs < requiredTryItCount
    ) {
        issues.push({
            code: "PROGRAMMING_TRY_IT_PER_SKETCH_MISSING",
            category: "pedagogy",
            severity: "error",
            message:
                `Programming profile "${args.profileId}" uses all_sketches Try It policy, but has ${actualCodeInputs} code_input exercise(s) for ${blocks.length} sketch block(s).`,
        });
    }

    return issues;
}

function isProjectLikeTopic(seed: any): boolean {
    const topicId = String(seed?.topicId ?? seed?.topic?.id ?? "").toLowerCase();
    const sectionId = String(seed?.sectionId ?? seed?.section?.id ?? "").toLowerCase();
    const topicType = String(seed?.topicType ?? seed?.topic?.type ?? seed?.type ?? "").toLowerCase();
    const projectType = String(seed?.projectType ?? seed?.topic?.projectType ?? "").toLowerCase();

    return (
        topicType === "project" ||
        topicType === "module_project" ||
        topicType === "capstone" ||
        projectType === "module_project" ||
        projectType === "capstone" ||
        topicId.includes("project") ||
        topicId.includes("capstone") ||
        sectionId.includes("project") ||
        sectionId.includes("capstone")
    );
}
