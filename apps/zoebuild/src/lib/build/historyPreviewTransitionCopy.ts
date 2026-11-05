/** One owner-authorized restore state plus the runner's actual operation status.
 * Never turn elapsed browser time into a terminal error. Slow is not failed.
 */
export function historyPreviewTransitionCopy(input: Readonly<{
  target: number;
  sourceVersion: number | null;
  restoreError: boolean;
  previewMessage: string | null;
  previewState: string;
}>): Readonly<{ title: string; description: string }> {
  if (input.restoreError) return {
    title: `Version ${input.target} needs to be reloaded`,
    description: "The saved source was selected, but this editor could not refresh it. Reload the project; don't restore it again.",
  };
  if (input.sourceVersion === null) return {
    title: `Opening Version ${input.target}…`,
    description: "Waiting for the saved-version selection response. Your previous source is preserved until the server confirms the change.",
  };
  if (input.previewState === "error") return {
    title: `Version ${input.target} preview needs attention`,
    description: input.previewMessage ?? "The preview operation reported an error. The selected files remain available in Code.",
  };
  if (input.previewState === "ready") return {
    title: `Loading Version ${input.target} website…`,
    description: "The runner is ready. Waiting for the selected React page to render in the protected preview.",
  };
  return {
    title: `Preparing Version ${input.target} preview…`,
    description: input.previewMessage ?? "The selected source is saved. The preview worker is still preparing it; you can use Code and Zoé.",
  };
}
