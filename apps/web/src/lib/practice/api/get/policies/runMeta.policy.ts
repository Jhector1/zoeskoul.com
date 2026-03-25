import type { Difficulty } from "@/lib/practice/types";
import { computeMaxAttempts } from "../../shared/attempts";
import { resolvePracticeRunMode } from "../../shared/run";

export function buildRunMeta(args: {
    session: any | null;
    diff: Difficulty;
    allowRevealEffective: boolean;
}) {
    const { session, diff, allowRevealEffective } = args;

    const mode = resolvePracticeRunMode(session);
    const maxAttempts = computeMaxAttempts({
        mode,
        assignmentMaxAttempts: session?.assignment?.maxAttempts ?? null,
    });

    const returnUrl = typeof session?.returnUrl === "string" ? session.returnUrl : null;

    if (mode === "assignment") {
        return {
            mode: "assignment" as const,
            lockDifficulty: diff,
            lockTopic: "all" as const,
            allowReveal: false,
            showDebug: Boolean(session?.assignment?.showDebug),
            targetCount: session?.targetCount ?? 10,
            maxAttempts,
            returnUrl,
        };
    }

    if (mode === "session" || mode === "onboarding_trial") {
        return {
            mode,
            lockDifficulty: diff,
            lockTopic: "all" as const,
            allowReveal: false,
            showDebug: false,
            targetCount: session?.targetCount ?? 0,
            maxAttempts,
            returnUrl,
        };
    }

    return {
        mode: "practice" as const,
        lockDifficulty: null,
        lockTopic: null,
        targetCount: 10,
        allowReveal: allowRevealEffective,
        showDebug: false,
        maxAttempts,
        returnUrl: null,
    };
}