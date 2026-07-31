import type { QItem } from "@/lib/practice/uiTypes";

export function resolvePracticeDisplayStack(args: {
  stack: QItem[] | null | undefined;
  reviewStack: QItem[] | null | undefined;
  answeredCount: number;
}): QItem[] {
  const local = Array.isArray(args.stack) ? args.stack : [];
  const review = Array.isArray(args.reviewStack) ? args.reviewStack : [];
  const answeredCount = Math.max(0, Math.floor(Number(args.answeredCount) || 0));

  if (!review.length) return local;
  if (review.length >= answeredCount) return review;
  if (review.length > local.length) return review;
  return local;
}

export function resolvePracticeQueuePlaceholderStatus(args: {
  index: number;
  answeredCount: number;
}): "completed" | "not_started" {
  return args.index < Math.max(0, Math.floor(Number(args.answeredCount) || 0))
    ? "completed"
    : "not_started";
}
