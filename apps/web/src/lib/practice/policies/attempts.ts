// src/lib/practice/policies/attempts.ts
export type RunMode =
    | "assignment"
    | "public_challenge"
    | "daily_five"
    | "onboarding_trial"
    | "standard"
    | "practice";

/**
 * Parse attempts from:
 * - number (<=0 => unlimited)
 * - string: "inf" | "infinity" | "unlimited" => unlimited
 * - null/undefined => unlimited
 */
export function parseMaxAttemptsAny(v: any): number | null {
    if (v == null) return null;

    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (!s) return null;
        if (s === "inf" || s === "infinity" || s === "unlimited") return null;

        const n = Number(s);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.max(1, Math.floor(n));
    }

    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1, Math.floor(n));
}

function parseEnvInt(name: string, fallback: number | null) {
    const raw = process.env[name];
    const out = parseMaxAttemptsAny(raw);
    return out ?? fallback;
}

/**
 * Attempts policy (server truth):
 * - assignment: finite default 3 (override by assignmentQuestionMaxAttempts)
 * - assignment/daily practice/onboarding trial: finite
 * - public challenge: unlimited
 * - standard/subscriber practice and ad-hoc practice: unlimited by default
 *
 * If you want a global finite cap for free practice, set:
 *   PRACTICE_DEFAULT_MAX_ATTEMPTS="5"
 * If you want a different session default:
 *   SESSION_DEFAULT_MAX_ATTEMPTS="3"
 */
export function computeMaxAttemptsCore(args: {
    mode: RunMode;

    assignmentQuestionMaxAttempts?: any; // number | string | null
    sessionMaxAttempts?: any;    // number | string | null
    practiceMaxAttempts?: any;   // number | string | null
}): number | null {
    const mode = args.mode;

    const assignmentDefault = parseEnvInt("ASSIGNMENT_QUESTION_DEFAULT_MAX_ATTEMPTS", 3);
    const sessionDefault = parseEnvInt("SESSION_DEFAULT_MAX_ATTEMPTS", 3);
    const practiceDefault = parseEnvInt("PRACTICE_DEFAULT_MAX_ATTEMPTS", null); // null => unlimited

    if (mode === "assignment") {
        return parseMaxAttemptsAny(args.assignmentQuestionMaxAttempts) ?? assignmentDefault;
    }

    if (mode === "public_challenge") {
        return null;
    }

    if (mode === "daily_five" || mode === "onboarding_trial") {
        return parseMaxAttemptsAny(args.sessionMaxAttempts) ?? sessionDefault;
    }

    // standard subscriber practice and non-session practice are unlimited by default.
    return parseMaxAttemptsAny(args.practiceMaxAttempts) ?? practiceDefault;
}