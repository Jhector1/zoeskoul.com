export type ReviewProgressResetIntent =
  | Readonly<{ kind: "module" }>
  | Readonly<{ kind: "topic"; topicId: string }>;

function normalizeExistingResetIntent(
  value: unknown,
): ReviewProgressResetIntent | null {
  if (!value || typeof value !== "object") return null;

  const kind = String((value as any).kind ?? "");
  if (kind === "module") return { kind: "module" };

  if (kind === "topic") {
    const topicId = String((value as any).topicId ?? "").trim();
    return topicId ? { kind: "topic", topicId } : null;
  }

  return null;
}

export function resolveReviewProgressResetIntent(args: {
  reason?: string | null;
  topicId?: string | null;
  existing?: unknown;
}): ReviewProgressResetIntent | null {
  const existing = normalizeExistingResetIntent(args.existing);
  if (existing) return existing;

  if (args.reason === "reset-module") {
    return { kind: "module" };
  }

  if (args.reason === "reset-topic" || args.reason === "reset-card") {
    const topicId = String(args.topicId ?? "").trim();
    return topicId ? { kind: "topic", topicId } : null;
  }

  return null;
}

export function attachReviewProgressResetIntent<T extends object>(args: {
  payload: T;
  reason?: string | null;
  topicId?: string | null;
}) {
  const resetIntent = resolveReviewProgressResetIntent({
    reason: args.reason,
    topicId: args.topicId,
    existing: (args.payload as any).resetIntent,
  });

  return resetIntent
    ? ({ ...args.payload, resetIntent } as T & {
        resetIntent: ReviewProgressResetIntent;
      })
    : args.payload;
}
