export type ReviewWorkspaceCapabilities = {
  /** Whether the mounted code/sketch/board workspace accepts edits. */
  canEditWorkspace: boolean;
  /** Whether answer checks, reveals, hints, or AI-tutor practice actions may run. */
  canSubmitPractice: boolean;
  /** Whether quiz state, completion, reset, and progress may be changed. */
  canMutateProgress: boolean;
  /** Whether learner completion controls which content can be opened next. */
  usesProgressGating: boolean;
};

export const DEFAULT_REVIEW_WORKSPACE_CAPABILITIES: ReviewWorkspaceCapabilities = {
  canEditWorkspace: true,
  canSubmitPractice: true,
  canMutateProgress: true,
  usesProgressGating: true,
};

export function resolveReviewWorkspaceCapabilities(
  value: Partial<ReviewWorkspaceCapabilities> | null | undefined,
): ReviewWorkspaceCapabilities {
  return {
    ...DEFAULT_REVIEW_WORKSPACE_CAPABILITIES,
    ...(value ?? {}),
  };
}

/**
 * Tutoring workspaces separate observation from ownership.
 *
 * - A tutor observing a learner, or anyone viewing tutor/reference content,
 *   can navigate freely but cannot mutate the viewed owner's state.
 * - A learner's private "Mine" workspace keeps normal progress gating.
 * - A tutor's editable master workspace is authoring/teaching space and is not
 *   trapped by learner completion gates.
 */
export function resolveTutoringReviewWorkspaceCapabilities(args: {
  canManage: boolean;
  canEdit: boolean;
  workspaceView: "master" | "reference" | "mine" | "learner";
}): ReviewWorkspaceCapabilities {
  const canMutate = Boolean(args.canEdit);

  return {
    canEditWorkspace: canMutate,
    canSubmitPractice: canMutate,
    canMutateProgress: canMutate,
    usesProgressGating: !args.canManage && args.workspaceView === "mine",
  };
}
