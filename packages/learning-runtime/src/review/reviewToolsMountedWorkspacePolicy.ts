export type ReviewToolsMountedWorkspaceBinding<TWorkspace> = {
  workspace: TWorkspace;
  generation: number | undefined;
  applyToMountedEditor: boolean;
};

export function resolveReviewToolsMountedWorkspaceAfterBind<TWorkspace>(args: {
  boundWorkspace: TWorkspace | null | undefined;
  boundOrigin: string | null | undefined;
  boundGeneration: number | undefined;
  runtimeExercise:
    | {
        workspace?: TWorkspace | null;
        codeWorkspace?: TWorkspace | null;
        ideWorkspace?: TWorkspace | null;
        workspaceOrigin?: string | null;
        userEdited?: boolean;
        workspaceGeneration?: number;
      }
    | null
    | undefined;
}): ReviewToolsMountedWorkspaceBinding<TWorkspace> | null {
  const runtime = args.runtimeExercise;
  const runtimeWorkspace =
    runtime?.workspace ??
    runtime?.codeWorkspace ??
    runtime?.ideWorkspace ??
    null;

  const runtimeOwnsLearnerWorkspace = Boolean(
    runtimeWorkspace &&
      (
        runtime?.userEdited === true ||
        runtime?.workspaceOrigin === "user" ||
        runtime?.workspaceOrigin === "saved"
      ),
  );

  /**
   * patchExercise() is the canonical conflict/preservation owner.
   *
   * A bind can start from a stale registry snapshot while runtime already owns
   * newer learner work restored from progress. patchExercise() correctly
   * preserves that newer work, so the subsequent mounted-editor handoff must
   * consume the post-patch runtime workspace rather than replaying the stale
   * registry workspace into Monaco.
   */
  if (runtimeOwnsLearnerWorkspace && runtimeWorkspace) {
    return {
      workspace: runtimeWorkspace,
      generation:
        typeof runtime?.workspaceGeneration === "number"
          ? runtime.workspaceGeneration
          : args.boundGeneration,
      applyToMountedEditor: true,
    };
  }

  if (
    args.boundWorkspace &&
    (args.boundOrigin === "user" || args.boundOrigin === "saved")
  ) {
    return {
      workspace: args.boundWorkspace,
      generation: args.boundGeneration,
      applyToMountedEditor: false,
    };
  }

  return null;
}
