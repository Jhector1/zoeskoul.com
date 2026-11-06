import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";

/**
 * Personalize only the initial, neutral TanStack starter. This operates on
 * workspace source before the initial revision is persisted, never on saved
 * or user-edited projects and never in the preview transport.
 */
export function personalizeInitialGeneratedSite(
  workspace: WorkspaceStateV2,
  projectName: string,
): WorkspaceStateV2 {
  const sitePath = "src/data/site.ts";
  const normalizedName = projectName.trim();
  if (!normalizedName) {
    throw new Error("Cannot create an initial site without a project name.");
  }

  const replacements = [
    [
      'name: "My Website"',
      `name: ${JSON.stringify(normalizedName)}`,
    ],
    [
      'tagline: "Welcome to My Website"',
      `tagline: ${JSON.stringify(`Welcome to ${normalizedName}`)}`,
    ],
  ] as const;

  let found = 0;
  const nodes = workspace.nodes.map((node) => {
    if (node.id !== sitePath || node.kind !== "file") return node;
    found += 1;
    let content = node.content;
    for (const [before, after] of replacements) {
      if (content.split(before).length !== 2) {
        throw new Error(`Unexpected initial TanStack site content: ${sitePath}`);
      }
      content = content.replace(before, after);
    }
    return { ...node, content };
  });

  if (found !== 1) {
    throw new Error(`Expected exactly one initial TanStack site file: ${sitePath}`);
  }
  return { ...workspace, nodes };
}
