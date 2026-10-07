export type PracticeMobilePrimaryAction = "submit" | "next";

export function resolvePracticeMobilePrimaryAction(args: {
  hasCurrent: boolean;
  submitted: boolean;
  finalized: boolean;
  outOfAttempts: boolean;
  canGoNext: boolean;
  revealAvailable?: boolean;
}): PracticeMobilePrimaryAction {
  const completeEnoughToAdvance =
    !args.revealAvailable &&
    (!args.hasCurrent || args.submitted || args.finalized || args.outOfAttempts);

  return completeEnoughToAdvance && args.canGoNext ? "next" : "submit";
}
