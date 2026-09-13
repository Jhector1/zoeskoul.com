export function shouldPropagateReviewCodeInputSnapshotToRuntime(args: {
  registrationChanged: boolean;
  applyToMountedEditor: boolean;
  userEdited: boolean;
}) {
  /**
   * The registry is only a presentation/binding cache. The review runtime is the
   * canonical persistence owner.
   *
   * A React registration can already contain the latest Monaco workspace before
   * the debounced CodeToolPane flush reaches syncCodeInputSnapshot(). In that
   * race, registrationChanged is false even though runtime.exercises still holds
   * the previous learner workspace. Never let registry dedupe swallow a real
   * user edit.
   *
   * Mounted-editor replacement is also a command and must continue through even
   * when its registration snapshot is unchanged.
   */
  return (
    args.registrationChanged ||
    args.applyToMountedEditor ||
    args.userEdited
  );
}
