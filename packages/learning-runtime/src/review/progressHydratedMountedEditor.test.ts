import { describe, expect, it, vi } from "vitest";

import {
  applyReviewProgressHydratedWorkspaceToMountedEditor,
} from "./progressHydratedMountedEditor";

describe("applyReviewProgressHydratedWorkspaceToMountedEditor", () => {
  it("forces the hydrated saved workspace into the mounted editor", () => {
    const patchEditorWorkspace = vi.fn();
    const workspace = { version: 2, nodes: [] };

    expect(
      applyReviewProgressHydratedWorkspaceToMountedEditor({
        ownerKey: "exercise:key",
        workspace,
        generation: 0,
        shouldHydrateEditorState: true,
        patchEditorWorkspace,
      }),
    ).toBe(true);

    expect(patchEditorWorkspace).toHaveBeenCalledTimes(1);
    expect(patchEditorWorkspace).toHaveBeenCalledWith(
      "exercise:key",
      workspace,
      {
        generation: 0,
        source: "review-progress-hydrate",
        mutation: {
          generation: 0,
          source: "review-progress-hydrate",
          mutation: "hydrate",
        },
        applyToMountedEditor: true,
      },
    );
  });

  it("does not replace Monaco when editor state was intentionally not hydrated", () => {
    const patchEditorWorkspace = vi.fn();

    expect(
      applyReviewProgressHydratedWorkspaceToMountedEditor({
        ownerKey: "exercise:key",
        workspace: { version: 2 },
        generation: 0,
        shouldHydrateEditorState: false,
        patchEditorWorkspace,
      }),
    ).toBe(false);

    expect(patchEditorWorkspace).not.toHaveBeenCalled();
  });

  it("does not issue an unversioned mounted-editor replacement", () => {
    const patchEditorWorkspace = vi.fn();

    expect(
      applyReviewProgressHydratedWorkspaceToMountedEditor({
        ownerKey: "exercise:key",
        workspace: { version: 2 },
        generation: undefined,
        shouldHydrateEditorState: true,
        patchEditorWorkspace,
      }),
    ).toBe(false);

    expect(patchEditorWorkspace).not.toHaveBeenCalled();
  });
});
