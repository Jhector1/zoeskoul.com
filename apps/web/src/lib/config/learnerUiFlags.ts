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
