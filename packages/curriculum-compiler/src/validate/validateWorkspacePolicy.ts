import type { ResolvedWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { RetryableTopicValidationError } from "./RetryableTopicValidationError.js";

const NON_LEARNER_FACING_KEYS = new Set([
    "terminalExpectations",
    "workspaceExpectations",
    "starterCode",
    "solutionCode",
    "starterFiles",
    "fixedTests",
    "hiddenShellCheck",
    "checker",
]);

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPattern(term: string) {
    const escaped = escapeRegExp(term.trim());
    if (!escaped) return null;

    if (/^[a-z0-9_. -]+$/i.test(term)) {
        return new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, "i");
    }

    return new RegExp(escaped, "i");
}

function throwWorkspacePolicyError(args: {
    retryable?: boolean;
    code: string;
    message: string;
    details?: unknown;
}): never {
    if (args.retryable) {
        throw new RetryableTopicValidationError({
            code: args.code,
            message: args.message,
            details: args.details,
        });
    }

    throw new Error(args.message);
}

function findMatch(text: string, terms: string[]) {
    for (const term of terms) {
        const pattern = toPattern(term);
        if (!pattern) continue;
        const match = text.match(pattern);
        if (match) return { term, value: match[0] };
    }

    return null;
}

function collectLearnerFacingText(value: unknown, path: string[] = []): string[] {
    if (typeof value === "string") {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item, index) =>
            collectLearnerFacingText(item, [...path, String(index)]),
        );
    }

    if (!value || typeof value !== "object") {
        return [];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        if (NON_LEARNER_FACING_KEYS.has(key)) {
            return [];
        }

        return collectLearnerFacingText(child, [...path, key]);
    });
}

export function validateWorkspacePolicy(args: {
    text: string | unknown;
    policy: ResolvedWorkspacePolicy;
    location: string;
    retryable?: boolean;
}) {
    const forbiddenTerms = [
        ...args.policy.forbiddenActionLanguage,
        ...args.policy.avoidTerms,
    ];
    const learnerFacingText =
        typeof args.text === "string"
            ? args.text
            : collectLearnerFacingText(args.text).join("\n");
    const match = findMatch(learnerFacingText, forbiddenTerms);

    if (match) {
        const preferredReplacement = args.policy.preferredTerms[match.term];
        const suggestion = preferredReplacement
            ? ` Prefer ${JSON.stringify(preferredReplacement)} instead.`
            : "";

        throwWorkspacePolicyError({
            retryable: args.retryable,
            code: "WORKSPACE_LANGUAGE_POLICY_VIOLATION",
            message: `${args.location}: contains forbidden learner-facing term ${JSON.stringify(match.value)}.${suggestion}`,
            details: {
                term: match.term,
                match: match.value,
                workspacePolicyId: args.policy.workspacePolicyId ?? null,
            },
        });
    }
}
