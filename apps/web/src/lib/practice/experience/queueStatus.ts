import type { QItem } from "@/lib/practice/uiTypes";
import {
  resolvePracticeQueueStatus as resolveSharedPracticeQueueStatus,
  type PracticeQueueStatus,
} from "@zoeskoul/learner-workspace/practice/experience/queueStatus";

export type { PracticeQueueStatus };

export function resolvePracticeQueueStatus(
  item: QItem | null | undefined,
): PracticeQueueStatus {
  return resolveSharedPracticeQueueStatus(item);
}
