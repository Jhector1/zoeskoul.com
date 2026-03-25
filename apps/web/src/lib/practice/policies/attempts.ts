// src/lib/practice/policies/attempts.ts
export type RunMode = "assignment" | "session" | "practice" | "onboarding_trial";

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
 * - assignment: finite default 3 (override by assignmentMaxAttempts)
 * - session: finite default 3 (override by sessionMaxAttempts)
 * - practice: unlimited default (null) (override by practiceMaxAttempts)
 *
 * If you want a global finite cap for free practice, set:
 *   PRACTICE_DEFAULT_MAX_ATTEMPTS="5"
 * If you want a different session default:
 *   SESSION_DEFAULT_MAX_ATTEMPTS="3"
 */
export function computeMaxAttemptsCore(args: {
    mode: RunMode;

    assignmentMaxAttempts?: any; // number | string | null
    sessionMaxAttempts?: any;    // number | string | null
    practiceMaxAttempts?: any;   // number | string | null
}): number | null {
    const mode = args.mode;

    const assignmentDefault = parseEnvInt("ASSIGNMENT_DEFAULT_MAX_ATTEMPTS", 3);
    const sessionDefault = parseEnvInt("SESSION_DEFAULT_MAX_ATTEMPTS", 3);
    const practiceDefault = parseEnvInt("PRACTICE_DEFAULT_MAX_ATTEMPTS", null); // null => unlimited

    if (mode === "assignment") {
        return parseMaxAttemptsAny(args.assignmentMaxAttempts) ?? assignmentDefault;
    }

    if (mode === "session") {
        return parseMaxAttemptsAny(args.sessionMaxAttempts) ?? sessionDefault;
    }

    // practice
    return parseMaxAttemptsAny(args.practiceMaxAttempts) ?? practiceDefault;
}