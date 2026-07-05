import { isRevealStepKey } from "@/lib/practice/help/steps";

export type MobilePracticeHelpState = {
  hintKeys: string[];
  openedHintKeys: string[];
  nextHintKey: string | null;
  revealEnabled: boolean;
  revealOpened: boolean;
};

export function resolveMobilePracticeHelpState(args: {
  enabledStepKeys: string[];
  openedStepKeys: string[];
  allowReveal: boolean;
}): MobilePracticeHelpState {
  const opened = new Set(args.openedStepKeys);
  const hintKeys = args.enabledStepKeys.filter((key) => !isRevealStepKey(key));
  const openedHintKeys = hintKeys.filter((key) => opened.has(key));
  const nextHintKey = hintKeys.find((key) => !opened.has(key)) ?? null;
  const revealEnabled =
    args.allowReveal && args.enabledStepKeys.some((key) => isRevealStepKey(key));
  const revealOpened = args.openedStepKeys.some((key) => isRevealStepKey(key));

  return {
    hintKeys,
    openedHintKeys,
    nextHintKey,
    revealEnabled,
    revealOpened,
  };
}
