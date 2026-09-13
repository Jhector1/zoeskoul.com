export type ResetMountedEditorRetentionArgs = {
    resetRevision: number;
    workspaceGeneration: number | null | undefined;
    workspaceApplyRevision: number | null | undefined;
    workspaceOrigin: string | null | undefined;
    userEdited: boolean | null | undefined;
};

/**
 * Topic/Module reset may navigate back to the first lesson while Review keeps
 * the side-car editor mounted. A card without its own authored editor must not
 * discard the canonical starter workspace that the reset just installed.
 *
 * This retention is deliberately narrow and ends after the learner edits.
 */
export function shouldRetainFreshResetMountedEditor(
    args: ResetMountedEditorRetentionArgs,
): boolean {
    const resetRevision = Number(args.resetRevision ?? 0);
    const workspaceGeneration = Number(args.workspaceGeneration ?? -1);
    const workspaceApplyRevision = Number(args.workspaceApplyRevision ?? -1);

    if (resetRevision <= 0) return false;
    if (workspaceGeneration !== resetRevision) return false;
    if (workspaceApplyRevision !== resetRevision) return false;
    if (args.workspaceOrigin !== "starter") return false;
    if (args.userEdited === true) return false;

    return true;
}
