import { describe, expect, it } from "vitest";
import {
  REVIEW_WORKSPACE_DRAFT_STORAGE_MODE,
  REVIEW_WORKSPACE_RUNTIME_COMMIT_DELAY_MS,
  resolveReviewWorkspacePersistencePolicy,
  shouldCommitReviewWorkspaceToRuntimeAfterIdle,
} from "./reviewWorkspaceRuntimeCommit";

describe("review workspace persistence policy", () => {
  it("keeps browser-local draft storage off for editable tutoring", () => {
    const policy = resolveReviewWorkspacePersistencePolicy({
      isTutoringSession: true,
      canEdit: true,
    });

    expect(REVIEW_WORKSPACE_DRAFT_STORAGE_MODE).toBe("off");
    expect(policy).toEqual({
      draftStorageMode: "off",
      runtimeCommitMode: "runtime-debounced",
    });
  });

  it("keeps browser-local draft storage off for read-only tutoring", () => {
    expect(
      resolveReviewWorkspacePersistencePolicy({
        isTutoringSession: true,
        canEdit: false,
      }),
    ).toEqual({
      draftStorageMode: "off",
      runtimeCommitMode: "deferred",
    });
  });

  it("commits editable ordinary review workspaces after a short idle period", () => {
    expect(
      resolveReviewWorkspacePersistencePolicy({
        isTutoringSession: false,
        canEdit: true,
      }),
    ).toEqual({
      draftStorageMode: "off",
      runtimeCommitMode: "runtime-debounced",
    });
  });

  it("keeps read-only ordinary review workspaces deferred", () => {
    expect(
      resolveReviewWorkspacePersistencePolicy({
        isTutoringSession: false,
        canEdit: false,
      }),
    ).toEqual({
      draftStorageMode: "off",
      runtimeCommitMode: "deferred",
    });
  });

  it("commits an editable review workspace after the user stops typing", () => {
    expect(
      shouldCommitReviewWorkspaceToRuntimeAfterIdle({
        mode: "runtime-debounced",
        isReviewRouteMode: true,
        isDirectUserWorkspaceEdit: true,
        structureChanged: false,
        hasWorkspaceContent: true,
      }),
    ).toBe(true);
  });

  it("does not treat hydration as a user runtime commit", () => {
    expect(
      shouldCommitReviewWorkspaceToRuntimeAfterIdle({
        mode: "runtime-debounced",
        isReviewRouteMode: true,
        isDirectUserWorkspaceEdit: false,
        structureChanged: false,
        hasWorkspaceContent: true,
      }),
    ).toBe(false);
  });

  it("uses a bounded idle delay", () => {
    expect(REVIEW_WORKSPACE_RUNTIME_COMMIT_DELAY_MS).toBeGreaterThanOrEqual(400);
    expect(REVIEW_WORKSPACE_RUNTIME_COMMIT_DELAY_MS).toBeLessThanOrEqual(1_000);
  });
});
