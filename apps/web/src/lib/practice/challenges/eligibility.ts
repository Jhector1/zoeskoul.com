export type PublicChallengeEligibilityTarget = {
  exercisePurpose?: unknown;
  exerciseKind?: unknown;
};

export function isEligiblePublicChallengeTarget(
  target: PublicChallengeEligibilityTarget,
): boolean {
  return (
    String(target.exercisePurpose ?? "").trim() === "project" &&
    String(target.exerciseKind ?? "").trim() === "code_input"
  );
}

export function assertEligiblePublicChallengeTarget(
  target: PublicChallengeEligibilityTarget,
): void {
  if (isEligiblePublicChallengeTarget(target)) return;

  throw new Error(
    `Only code_input project exercises can be shared as public challenges. Received purpose "${String(
      target.exercisePurpose ?? "unknown",
    )}" and kind "${String(target.exerciseKind ?? "unknown")}".`,
  );
}
