import type { RunMode } from "./attempts";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";

type RunModeSessionShape = {
  id?: string | null;
  assignmentId?: string | null;
  mode?: string | null;
  meta?: unknown;
};

export function resolvePracticeRunMode(
  session: RunModeSessionShape | null | undefined,
): RunMode {
  return resolvePracticeExperienceMode(session);
}
