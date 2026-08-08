export type ReviewPracticeRevealResponse = {
  reveal?: unknown;
  finalized?: boolean;
  sessionComplete?: boolean;
  summary?: unknown;
};

/**
 * A reveal is a terminal, zero-credit outcome for the current practice item.
 * Keep that terminal state on the item itself so review navigation, persistence,
 * and route-owned project steps all agree after remounting.
 */
export function buildReviewPracticeRevealCompletionPatch(args: {
  current: { result?: unknown };
  response: ReviewPracticeRevealResponse;
}) {
  const revealAnswer = args.response.reveal ?? null;

  if (!args.response.finalized || revealAnswer == null) return null;

  const previousResult = (args.current.result ?? {}) as Record<string, unknown>;

  return {
    submitted: true,
    revealed: true,
    feedbackDismissed: true,
    result: {
      ...previousResult,
      ok: previousResult.ok === true ? true : false,
      finalized: true,
      revealUsed: true,
      revealAnswer,
      sessionComplete: Boolean(args.response.sessionComplete),
      ...(args.response.summary !== undefined
        ? { summary: args.response.summary }
        : {}),
    } as any,
  };
}
