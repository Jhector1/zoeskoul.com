import type { PracticeExperienceMode } from "@zoeskoul/learner-workspace/practice/experience/types";
import {
  resolveRevealCompletionTransition as resolveSharedRevealCompletionTransition,
  type RevealCompletionTransition,
} from "@zoeskoul/learner-workspace/practice/experience/revealCompletion";

export type { RevealCompletionTransition };

export function resolveRevealCompletionTransition(
  mode: PracticeExperienceMode | null | undefined,
): RevealCompletionTransition {
  return resolveSharedRevealCompletionTransition(mode);
}
