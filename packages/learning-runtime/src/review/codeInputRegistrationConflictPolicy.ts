export type ReviewCodeInputRegistrationContent = Readonly<{
  code: string;
  stdin: string;
  language: string;
  workspaceKey: string;
}>;

function sameRegistrationContent(
  left: ReviewCodeInputRegistrationContent | null | undefined,
  right: ReviewCodeInputRegistrationContent | null | undefined,
) {
  if (!left || !right) return false;

  return (
    left.code === right.code &&
    left.stdin === right.stdin &&
    left.language === right.language &&
    left.workspaceKey === right.workspaceKey
  );
}

export function shouldPreserveProtectedReviewCodeInputRegistration(args: {
  previousProtected: boolean;
  incomingClaimsLearnerOwnership: boolean;
  previousGeneration: number | undefined;
  incomingGeneration: number | undefined;
  activeGeneration: number;
  previous: ReviewCodeInputRegistrationContent;
  incoming: ReviewCodeInputRegistrationContent;
  runtime: ReviewCodeInputRegistrationContent | null;
}) {
  if (!args.previousProtected) return false;

  /** Reset generation is authoritative over learner ownership. */
  if (
    args.activeGeneration > 0 &&
    args.previousGeneration !== args.activeGeneration
  ) {
    return false;
  }

  if (sameRegistrationContent(args.previous, args.incoming)) {
    return true;
  }

  const runtimeMatchesPrevious = sameRegistrationContent(
    args.runtime,
    args.previous,
  );
  const runtimeMatchesIncoming = sameRegistrationContent(
    args.runtime,
    args.incoming,
  );

  /**
   * registerCodeInput() is a passive render registration, not a learner edit.
   * userEdited/workspaceOrigin can be inherited from surrounding progress state,
   * so those flags alone cannot make a different incoming workspace authoritative.
   *
   * If canonical runtime uniquely agrees with the incoming registration, accept
   * it (for example a newer remote/progress hydration). Otherwise preserve the
   * already-protected learner snapshot.
   */
  if (runtimeMatchesIncoming && !runtimeMatchesPrevious) {
    return false;
  }

  return true;
}
