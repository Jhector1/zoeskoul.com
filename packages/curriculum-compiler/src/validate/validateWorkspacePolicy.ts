import type { ResolvedWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { RetryableTopicValidationError } from "./RetryableTopicValidationError.js";

const TERMINAL_PATTERNS = [
    /\bterminal\b/i,
    /\bcommand line\b/i,
    /\bshell\b/i,
    /\bpython\s+[\w.-]+\.py\b/i,
    /\bpip install\b/i,
];

const FILE_PATTERNS = [
    /\bcreate (a )?file\b/i,
    /\bsave\s+(this|it|the code)\s+(as|to)\b/i,
    /\bsave\s+(as|to)\b/i,
    /\bopen (a )?file\b/i,
    /\b[\w.-]+\.py\b/i,
    /\bscript file\b/i,
    /\bpython script\b/i,
    /\bwrite (a )?script\b/i,
    /\bterminal\b/i,
    /\bcommand line\b/i,
    /\bcommand prompt\b/i,
    /\bshell\b/i,
    /\bREPL\b/i,
    /\bpip install\b/i,
    /\bpython\s+[\w./-]+\.py\b/i,
];

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

export function validateWorkspacePolicy(args: {
    text: string;
    policy: ResolvedWorkspacePolicy;
    location: string;
    retryable?: boolean;
}) {
    const c = args.policy.workspace.capabilities;

    if (!c.terminal.enabled) {
        for (const pattern of TERMINAL_PATTERNS) {
            const match = args.text.match(pattern);
            if (!match) continue;

            throwWorkspacePolicyError({
                retryable: args.retryable,
                code: "WORKSPACE_TERMINAL_POLICY_VIOLATION",
                message: `${args.location}: mentions ${JSON.stringify(match[0])} but terminal is disabled.`,
                details: { match: match[0] },
            });
        }
    }

    if (!c.filesystem.enabled) {
        for (const pattern of FILE_PATTERNS) {
            const match = args.text.match(pattern);
            if (!match) continue;

            throwWorkspacePolicyError({
                retryable: args.retryable,
                code: "WORKSPACE_FILESYSTEM_POLICY_VIOLATION",
                message: `${args.location}: mentions ${JSON.stringify(match[0])} but filesystem is disabled.`,
                details: { match: match[0] },
            });
        }
    }

    for (const term of args.policy.avoidTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escaped, "i");
        const match = args.text.match(pattern);

        if (!match) continue;

        throwWorkspacePolicyError({
            retryable: args.retryable,
            code: "WORKSPACE_AVOID_TERM_POLICY_VIOLATION",
            message: `${args.location}: contains avoided workspace/course term ${JSON.stringify(term)}.`,
            details: { term, match: match[0] },
        });
    }
}
