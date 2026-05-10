import type { ResolvedWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
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

export function validateWorkspacePolicy(args: {
    text: string;
    policy: ResolvedWorkspacePolicy;
    location: string;
}) {
    const c = args.policy.workspace.capabilities;

    if (!c.terminal.enabled) {
        for (const pattern of TERMINAL_PATTERNS) {
            if (pattern.test(args.text)) {
                throw new Error(
                    `${args.location}: mentions terminal/command line but terminal is disabled.`,
                );
            }
        }
    }

    if (!c.filesystem.enabled) {
        for (const pattern of FILE_PATTERNS) {
            if (pattern.test(args.text)) {
                throw new Error(
                    `${args.location}: mentions files but filesystem is disabled.`,
                );
            }
        }
    }
    for (const term of args.policy.avoidTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escaped, "i");

        if (pattern.test(args.text)) {
            throw new Error(
                `${args.location}: contains avoided workspace/course term "${term}".`,
            );
        }
    }
}