/**
 * Canonical learner-workspace initial outer-pane resolution.
 *
 * Ownership:
 * - `defaultSurface` chooses the outer Editor/Results surface.
 * - SQL pane defaults choose only the inner SQL Results/Tables/ERD/Chen tab.
 * - Runner-pane defaults choose only the inner Output/Terminal tab.
 *
 * Web and Student must consume this resolver rather than implementing their
 * own Editor/Results fallback policy.
 */

export type WorkspaceInitialPane =
  | "editor"
  | "output";

export type WorkspaceInitialPaneArgs = {
  /**
   * Authored outer workspace preference.
   */
  defaultSurface?: "editor" | "results" | null;

  /**
   * Inner runner-tab preference.
   *
   * This must never choose the outer Editor/Results surface. Runner tabs only
   * choose what is shown inside Results after the learner opens that surface.
   */
  runnerPaneOptions?: {
    defaultTab?: string | null;
    compactDefaultTab?: string | null;
  } | null;

  /**
   * Accepted for compatibility with CodeRunner callers. Language does not
   * choose the outer surface.
   */
  language?: unknown;

  /**
   * Accepted for compatibility with CodeRunner callers. Inner SQL tabs do not
   * choose the outer surface.
   */
  sqlPaneOptions?: unknown;
};

export function resolveWorkspaceInitialPane(
  args: WorkspaceInitialPaneArgs,
): WorkspaceInitialPane {
  if (args.defaultSurface === "results") {
    return "output";
  }

  if (args.defaultSurface === "editor") {
    return "editor";
  }

  // Inner SQL/runner tabs never choose the outer workspace surface.
  // Without an explicit authored defaultSurface, learner work starts in Editor.
  return "editor";
}
