import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../shared/profileServices.js";

const INTERNAL_WORKSPACE_PATHS = new Set(["main.sh", ".zoeskoul/setup.sh"]);

function normalizePath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isInternalWorkspacePath(path: string): boolean {
    const normalized = normalizePath(path);
    return (
        INTERNAL_WORKSPACE_PATHS.has(normalized) ||
        normalized.startsWith(".zoeskoul/")
    );
}

function isInsideRepository(path: string, repositoryPath: string): boolean {
    const normalized = normalizePath(path);
    return (
        normalized === repositoryPath ||
        normalized.startsWith(`${repositoryPath}/`) ||
        isInternalWorkspacePath(normalized)
    );
}

function promptRequiresExactFileEdit(prompt: string): boolean {
    const namesAFile = /(?:\.[a-z0-9]{1,10}|\.gitignore)\b/i.test(prompt);
    const asksForAnEdit =
        /\b(?:open|create|edit|write)\s+(?:the\s+)?(?:`[^`]+`|[^\s`]+(?:\.[a-z0-9]{1,10}|\.gitignore)\b)/i.test(prompt) ||
        /\breplace\s+`/i.test(prompt) ||
        /\badd exactly\b/i.test(prompt);
    return namesAFile && asksForAnEdit;
}

function inlineLiterals(prompt: string): string[] {
    return [...prompt.matchAll(/`([^`\r\n]+)`/g)]
        .map((match) => match[1]?.trim() ?? "")
        .filter(Boolean);
}

function fencedText(prompt: string): string[] {
    return [...prompt.matchAll(/```(?:[a-z0-9_-]+)?\s*\n([\s\S]*?)```/gi)]
        .map((match) => match[1]?.trim() ?? "")
        .filter(Boolean);
}

function suppliesExactEdit(prompt: string): boolean {
    const literals = inlineLiterals(prompt);
    const blocks = fencedText(prompt);
    const hasReplacement =
        /\b(?:find|replace)\b/i.test(prompt) &&
        /\b(?:replace|with)\b/i.test(prompt) &&
        literals.length >= 3;
    const hasExactPayload =
        /\b(?:exact|exactly|containing)\b/i.test(prompt) &&
        (literals.length >= 2 || blocks.length > 0);
    const hasLocation =
        /\b(?:at the beginning|at the end|after|before|replace|containing|with exactly this text|one line|these two lines|(?:starting\s+)?on line \d+)\b/i.test(
            prompt,
        );

    return hasReplacement || (hasExactPayload && hasLocation);
}

export function validateGitProjectJourneyDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): SemanticValidationIssue[] {
    const reference = args.seed.projectJourney;
    if (!reference) return [];

    const journey = args.seed.projectJourneys?.find(
        (candidate) => candidate.id === reference.journeyId,
    );
    if (!journey) {
        return [
            {
                code: "GIT_PROJECT_JOURNEY_NOT_FOUND",
                category: "prompt_intent",
                severity: "error",
                message: `Project journey "${reference.journeyId}" is not available on the topic seed.`,
            },
        ];
    }

    const issues: SemanticValidationIssue[] = [];
    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;

        const repositoryPath = exercise.gitExpectations?.repositoryPath;
        if (
            typeof repositoryPath === "string" &&
            normalizePath(repositoryPath) !== journey.repositoryPath
        ) {
            issues.push({
                code: "GIT_PROJECT_JOURNEY_REPOSITORY_MISMATCH",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: `gitExpectations.repositoryPath must be "${journey.repositoryPath}" for journey "${journey.id}".`,
            });
        }

        const paths = [
            exercise.entryFilePath,
            ...(exercise.starterFiles ?? []).map((file) => file.path),
            ...(exercise.solutionFiles ?? []).map((file) => file.path),
        ].filter((path): path is string => typeof path === "string" && path.length > 0);

        for (const path of paths) {
            if (isInsideRepository(path, journey.repositoryPath)) continue;
            issues.push({
                code: "GIT_PROJECT_JOURNEY_PATH_MISMATCH",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: `Workspace path "${path}" must stay inside ${journey.repositoryPath}/ for journey "${journey.id}".`,
            });
        }

        if (!journey.exactEditInstructionsRequired) continue;
        if (!promptRequiresExactFileEdit(exercise.prompt)) continue;

        if (!exercise.prompt.includes(`${journey.repositoryPath}/`)) {
            issues.push({
                code: "GIT_FILE_EDIT_PATH_NOT_EXPLICIT",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: `File-edit instructions must name the full project-relative path under ${journey.repositoryPath}/.`,
            });
        }
        if (!suppliesExactEdit(exercise.prompt)) {
            issues.push({
                code: "GIT_FILE_EDIT_NOT_EXACT",
                category: "prompt_intent",
                severity: "error",
                exerciseId: exercise.id,
                message: "Git lessons must supply the exact text and exact replacement or insertion location instead of testing web-development knowledge.",
            });
        }
    }

    return issues;
}
