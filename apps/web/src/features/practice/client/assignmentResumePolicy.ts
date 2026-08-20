import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import { shouldResumePracticeFromServer } from "@/lib/practice/experience/routePolicy";

export type PracticeClientStatePersistence = "session" | "off";

export function resolvePracticeResumePolicy(args: {
  experienceMode: PracticeExperienceMode;
  requestedPersistence: PracticeClientStatePersistence;
  expectedExperienceMode?: PracticeExperienceMode;
}) {
  const resolvedMode = args.expectedExperienceMode ?? args.experienceMode;
  const serverBacked = shouldResumePracticeFromServer(resolvedMode);

  return {
    // Persisted assignment and subscriber sessions must hydrate from the
    // server. Session storage can be stale after another tab or a resumed
    // practice session advances, which would otherwise reopen question one
    // while the server correctly reports later progress.
    clientStatePersistence: serverBacked
      ? ("off" as const)
      : args.requestedPersistence,
    expectedExperienceMode: serverBacked
      ? resolvedMode
      : args.expectedExperienceMode,
    resumeHistoryOnBoot: serverBacked,
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
    // Status history includes the currently owned instance, even when it is
    // unanswered. Re-loading here would manufacture the next question and can
    // move a learner away from a just-revealed exercise on refresh.
    shouldLoadCurrent: seedStack === null,
    nextQuestionIndex: seedStack ? seedStack.length - 1 : 0,
  };
}
