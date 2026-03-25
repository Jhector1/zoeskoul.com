import { isOnboardingTrialSession } from "@/lib/onboarding/trialPolicy";
import type { RunMode } from "./attempts";

type RunModeSessionShape = {
    id?: string | null;
    assignmentId?: string | null;
    mode?: string | null;
};

export function resolvePracticeRunMode(
    session: RunModeSessionShape | null | undefined,
): RunMode {
    if (session?.assignmentId) return "assignment";
    if (isOnboardingTrialSession(session)) return "onboarding_trial";
    if (session?.id) return "session";
    return "practice";
}