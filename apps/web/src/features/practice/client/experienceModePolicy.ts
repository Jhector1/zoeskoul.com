import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import type {
  PracticeRuntimeSurface,
} from "@/lib/practice/experience/routePolicy";
import { resolvePracticeSurfaceMode } from "@/lib/practice/experience/routePolicy";
import type { PurposeMode, PurposePolicy } from "@/lib/subjects/types";

/**
 * Resolve the client presentation mode before the session status request has
 * finished. The surface owns the allowed experience family; persisted run
 * metadata owns the actual mode once it arrives.
 */
export function resolveClientPracticeExperienceMode(args: {
  surface: PracticeRuntimeSurface;
  requestedAssignment: boolean;
  runMode?: PracticeExperienceMode | null;
  initialExperienceMode?: PracticeExperienceMode | null;
}): PracticeExperienceMode {
  return resolvePracticeSurfaceMode({
    surface: args.surface,
    requestedAssignment: args.requestedAssignment,
    runMode: args.runMode,
    initialMode: args.initialExperienceMode,
  });
}

export function resolvePracticePurposeDefaults(args: {
  experienceMode: PracticeExperienceMode;
  requestedPurpose?: PurposeMode | null;
  requestedPolicy?: PurposePolicy | null;
  isLockedRun: boolean;
}): { preferPurpose: PurposeMode; purposePolicy: PurposePolicy } {
  const dailyProjectRun = args.experienceMode === "daily_five";
  const openPracticeRun =
    args.experienceMode === "standard" || args.experienceMode === "practice";

  const preferPurpose: PurposeMode = dailyProjectRun
    ? "project"
    : args.requestedPurpose ?? (openPracticeRun ? "mixed" : "quiz");
  const purposePolicy: PurposePolicy = dailyProjectRun
    ? "strict"
    : args.requestedPolicy ?? "fallback";

  if (args.isLockedRun && !dailyProjectRun) {
    return { preferPurpose: "quiz", purposePolicy: "fallback" };
  }

  return { preferPurpose, purposePolicy };
}
