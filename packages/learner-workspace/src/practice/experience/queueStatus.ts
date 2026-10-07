export type PracticeQueueStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "revealed"
  | "correct";

export type PracticeQueueStatusItem = {
  result?: unknown;
  revealed?: boolean;
  submitted?: boolean;
  attempts?: number;
};

export function resolvePracticeQueueStatus(
  item: PracticeQueueStatusItem | null | undefined,
): PracticeQueueStatus {
  if (!item) return "not_started";

  const result = item.result as
    | {
        ok?: boolean;
        revealUsed?: boolean;
        revealAnswer?: boolean;
        finalized?: boolean;
      }
    | null
    | undefined;

  const revealed = Boolean(
    item.revealed || result?.revealUsed || result?.revealAnswer,
  );

  if (result?.ok === true) return "correct";
  if (revealed) return "revealed";
  if (item.submitted || result?.finalized === true) return "completed";

  if (
    result ||
    (typeof item.attempts === "number" && item.attempts > 0)
  ) {
    return "in_progress";
  }

  return "not_started";
}
