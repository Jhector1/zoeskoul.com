import type { Difficulty } from "@/lib/practice/types";

type SessionRevealShape = {
    assignmentId?: string | null;
    assignment?: {
        allowReveal?: boolean | null;
        difficulty?: string | null;
    } | null;
};

export function computeAllowRevealEffective(
    session: SessionRevealShape | null | undefined,
    allowRevealParam?: "true" | "false",
) {
    const requested = allowRevealParam === "true";

    if (session?.assignmentId) {
        return Boolean(session.assignment?.allowReveal) && requested;
    }

    if (session) return false;
    return requested;
}

export function getAssignmentDifficulty(
    session: SessionRevealShape | null | undefined,
): Difficulty | null {
    const d = session?.assignment?.difficulty;
    return d ? (d as Difficulty) : null;
}