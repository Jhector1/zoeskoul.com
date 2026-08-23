import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import type {
  PracticeRuntimeSurface,
} from "@/lib/practice/experience/routePolicy";
import { resolvePracticeSurfaceMode } from "@/lib/practice/experience/routePolicy";
export { resolvePracticePurposeDefaults } from "@zoeskoul/practice-contracts";

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
