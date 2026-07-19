import type { PracticeExperienceMode } from "@/lib/practice/experience/types";

/**
 * Resolve the client presentation mode before the session status request has
 * finished. Route intent is only a bootstrap fallback; persisted run metadata
 * remains authoritative as soon as it is available.
 */
export function resolveClientPracticeExperienceMode(args: {
  requestedAssignment: boolean;
  runMode?: PracticeExperienceMode | null;
  expectedExperienceMode?: PracticeExperienceMode;
}): PracticeExperienceMode {
  if (args.requestedAssignment) return "assignment";
  return args.runMode ?? args.expectedExperienceMode ?? "practice";
}
