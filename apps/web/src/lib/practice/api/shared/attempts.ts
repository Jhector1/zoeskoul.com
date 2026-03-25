import {
    computeMaxAttemptsCore,
    type RunMode,
} from "@/lib/practice/policies/attempts";

export function computeMaxAttempts(args: {
    mode: RunMode;
    assignmentMaxAttempts?: any;
    sessionMaxAttempts?: any;
    practiceMaxAttempts?: any;
}) {
    return computeMaxAttemptsCore(args);
}

export function computeAttemptsLeft(args: {
    used: number;
    max: number | null;
}) {
    if (args.max == null) return null;
    return Math.max(0, args.max - args.used);
}

export type { RunMode };