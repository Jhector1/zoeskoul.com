import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import type {
  PracticeRuntimeSurface,
} from "@/lib/practice/experience/routePolicy";
import { resolvePracticeSurfaceMode } from "@/lib/practice/experience/routePolicy";
import type { PurposeMode, PurposePolicy } from "@zoeskoul/curriculum-contracts/subjects/types";

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

  if (openPracticeRun) {
    return { preferPurpose: "practice", purposePolicy: "strict" };
  }

  if (dailyProjectRun) {
    return { preferPurpose: "project", purposePolicy: "strict" };
  }

  if (args.isLockedRun) {
    return { preferPurpose: "quiz", purposePolicy: "fallback" };
  }

  return {
    preferPurpose: args.requestedPurpose ?? "quiz",
    purposePolicy: args.requestedPolicy ?? "fallback",
  };
}
