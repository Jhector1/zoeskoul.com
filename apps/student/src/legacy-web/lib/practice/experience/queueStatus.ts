import type { QItem } from "@/lib/practice/uiTypes";

export type PracticeQueueStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "revealed"
  | "correct";

/**
 * A validation response is not the same thing as completion.
 *
 * Unlimited practice keeps an exercise open after an incorrect check, so the
 * queue must only report `completed` when the server finalized the instance
 * (or the client has the equivalent submitted marker).
 */
export function resolvePracticeQueueStatus(
  item: QItem | null | undefined,
): PracticeQueueStatus {
  if (!item) return "not_started";

  const result = item.result as any;
  const revealed = Boolean(
    item.revealed || result?.revealUsed || result?.revealAnswer,
  );

  if (result?.ok === true) return "correct";
  if (revealed) return "revealed";
  if (item.submitted || result?.finalized === true) return "completed";

  if (result || (typeof item.attempts === "number" && item.attempts > 0)) {
    return "in_progress";
  }

  return "not_started";
}
