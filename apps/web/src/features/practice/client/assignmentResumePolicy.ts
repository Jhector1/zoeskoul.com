import type { PracticeExperienceMode } from "@/lib/practice/experience/types";

export type PracticeClientStatePersistence = "session" | "off";

export function resolvePracticeResumePolicy(args: {
  experienceMode: PracticeExperienceMode;
  requestedPersistence: PracticeClientStatePersistence;
  expectedExperienceMode?: PracticeExperienceMode;
}) {
  const assignment = args.experienceMode === "assignment";

  return {
    clientStatePersistence: assignment
      ? ("off" as const)
      : args.requestedPersistence,
    expectedExperienceMode:
      args.expectedExperienceMode ?? (assignment ? "assignment" : undefined),
    resumeHistoryOnBoot: assignment,
  };
}

export function buildServerResumePlan<T>(args: {
  enabled: boolean;
  complete: boolean;
  localStack: T[];
  history: T[];
}) {
  if (args.complete) {
    return {
      seedStack: null as T[] | null,
      shouldLoadCurrent: false,
      nextQuestionIndex: Math.max(0, args.localStack.length - 1),
    };
  }

  if (args.localStack.length > 0) {
    return {
      seedStack: null as T[] | null,
      shouldLoadCurrent: false,
      nextQuestionIndex: args.localStack.length - 1,
    };
  }

  const seedStack =
    args.enabled && args.history.length > 0 ? [...args.history] : null;

  return {
    seedStack,
    shouldLoadCurrent: true,
    nextQuestionIndex: seedStack?.length ?? 0,
  };
}
