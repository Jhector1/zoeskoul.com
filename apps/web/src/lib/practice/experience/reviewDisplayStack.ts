import type { QItem } from "@/lib/practice/uiTypes";
import {
  resolvePracticeDisplayStack as resolveSharedPracticeDisplayStack,
  resolvePracticeQueuePlaceholderStatus,
} from "@zoeskoul/learner-workspace/practice/experience/reviewDisplayStack";

export { resolvePracticeQueuePlaceholderStatus };

export function resolvePracticeDisplayStack(args: {
  stack: QItem[] | null | undefined;
  reviewStack: QItem[] | null | undefined;
  answeredCount: number;
}): QItem[] {
  return resolveSharedPracticeDisplayStack<QItem>(args);
}
