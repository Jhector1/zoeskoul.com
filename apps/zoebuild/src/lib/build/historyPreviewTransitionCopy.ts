/** Human-facing progress for a saved version's preview. Never imply that
 * restoring files requires the runner to finish, or that a preview failure
 * changed the saved version. */
export function historyPreviewTransitionCopy(input: Readonly<{
  target: number;
  sourceVersion: number | null;
  failed: boolean;
  previewMessage: string | null;
  previewState: string;
}>): Readonly<{ title: string; description: string }> {
  if (input.failed) return input.sourceVersion === null
    ? {
        title: `Version ${input.target} could not be confirmed`,
        description: "The selection response was not confirmed. Reload to inspect the current saved version.",
      }
    : {
        title: `Version ${input.target} preview is taking longer than expected`,
        description: "The selected files are available in Code. The previous preview remains hidden. You can retry or reload.",
      };
  if (input.sourceVersion === null) return {
    title: `Opening Version ${input.target}…`,
    description: "Selecting the saved files and their dependencies…",
  };
  return {
    title: `Preparing Version ${input.target} preview…`,
    description: input.previewState !== "error" && input.previewMessage
      ? input.previewMessage
      : "Preparing the selected website. You can keep using the editor and Zoé.",
  };
}
