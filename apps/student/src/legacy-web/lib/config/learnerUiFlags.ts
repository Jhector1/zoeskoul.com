export const learnerUiFlags = {
  /**
   * Shows internal learning/debug UI such as bound exercise ids, unbind controls,
   * raw sync state, and other developer-only metadata.
   */
  showDebugLearningUi: process.env.NEXT_PUBLIC_ZOE_DEBUG_LEARNING_UI === "1",

  /**
   * Keeps the learner workspace focused by hiding redundant helper cards and
   * secondary controls. Enabled by default; set NEXT_PUBLIC_ZOE_COMPACT_LEARNER_UI=0
   * in local/dev when you want the older verbose learner UI.
   */
  compactLearnerUi: process.env.NEXT_PUBLIC_ZOE_COMPACT_LEARNER_UI !== "0",
} as const;


export type LearnerUiFlagState = Pick<
  typeof learnerUiFlags,
  "compactLearnerUi" | "showDebugLearningUi"
>;

export function isCompactLearnerUiActive(
  flags: LearnerUiFlagState = learnerUiFlags,
) {
  return flags.compactLearnerUi && !flags.showDebugLearningUi;
}

/**
 * Expanded headings are useful in the verbose/debug learner surface, but the
 * compact surface already carries the active lesson context in its sticky
 * progress chrome. Hiding local card/sketch headings there avoids repeating
 * three near-identical titles before every exercise.
 */
export function shouldShowExpandedLearnerTitles(
  flags: LearnerUiFlagState = learnerUiFlags,
) {
  return !isCompactLearnerUiActive(flags);
}
