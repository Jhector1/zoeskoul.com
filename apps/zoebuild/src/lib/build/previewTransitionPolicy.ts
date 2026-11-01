/** User-facing status for the server-authoritative preview operation journal.
 * These stages describe progress, not proof that a React document rendered.
 */
export type PreviewOperationStage =
  | "queued"
  | "workspace"
  | "dependencies"
  | "container"
  | "readiness";

export function previewOperationStageMessage(stage: PreviewOperationStage | string | undefined): string {
  switch (stage) {
    case "queued":
      return "Waiting for an available preview worker…";
    case "workspace":
      return "Synchronizing the selected saved files…";
    case "dependencies":
      return "Preparing approved project dependencies…";
    case "container":
      return "Starting the isolated website worker…";
    case "readiness":
      return "Checking that the website responds…";
    default:
      return "Preparing the selected website…";
  }
}

/** An obsolete start failure must never replace the state of a newer version.
 * Both the server CAS source identity and the local workspace revision matter.
 */
export function previewStartOutcomeIsCurrent(args: Readonly<{
  startedSourceVersion: number;
  selectedSourceVersion: number;
  startedWorkspaceRevision: number;
  selectedWorkspaceRevision: number;
}>): boolean {
  return args.startedSourceVersion === args.selectedSourceVersion &&
    args.startedWorkspaceRevision === args.selectedWorkspaceRevision;
}
