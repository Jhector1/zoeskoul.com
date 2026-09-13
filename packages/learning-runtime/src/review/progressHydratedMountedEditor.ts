export function applyReviewProgressHydratedWorkspaceToMountedEditor<TWorkspace>(
  args: {
    ownerKey: string;
    workspace: TWorkspace | null | undefined;
    generation: number | undefined;
    shouldHydrateEditorState: boolean;
    patchEditorWorkspace: (
      ownerKey: string,
      workspace: TWorkspace,
      options?: {
        generation?: number;
        source?: string;
        mutation?: {
          generation: number;
          source: string;
          mutation: "hydrate";
        };
        applyToMountedEditor?: boolean;
      },
    ) => void;
  },
) {
  if (!args.shouldHydrateEditorState) return false;
  if (!args.workspace) return false;
  if (typeof args.generation !== "number") return false;

  args.patchEditorWorkspace(args.ownerKey, args.workspace, {
    generation: args.generation,
    source: "review-progress-hydrate",
    mutation: {
      generation: args.generation,
      source: "review-progress-hydrate",
      mutation: "hydrate",
    },
    /**
     * Runtime state and the mounted Monaco model are separate owners.
     * Hydration can correctly restore runtime.exercises while Monaco is still
     * displaying the starter model it mounted with. Force the already-mounted
     * editor to consume the hydrated workspace.
     */
    applyToMountedEditor: true,
  });

  return true;
}
