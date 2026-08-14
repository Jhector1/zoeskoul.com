import { describe, expect, it } from "vitest";

import {
  buildCanonicalWorkspaceIdentity,
  nextWorkspaceSaveRevision,
  shouldApplyWorkspaceResponse,
  shouldPersistWorkspaceMutation,
  WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS,
  WORKSPACE_RUNTIME_SAVE_COALESCE_MS,
  WORKSPACE_TEXT_SAVE_DEBOUNCE_MS,
} from "@zoeskoul/learning-runtime/review/workspacePersistenceContract";

describe("workspace persistence contract", () => {
  it("isolates tutor, learner, assignment, and submission ownership fields", () => {
    const base = {
      endpoint: "/api/tutoring-sessions/session-1/progress",
      subjectSlug: "python",
      moduleSlug: "module-1",
      locale: "en",
    };
    const tutor = buildCanonicalWorkspaceIdentity({
      ...base,
      ownerKey: "shared",
      workspaceView: "master",
    });
    const firstSubmission = buildCanonicalWorkspaceIdentity({
      ...base,
      ownerKey: "user:student-1",
      workspaceView: "learner",
      learnerId: "student-1",
      assignmentId: "assignment-1",
      submissionId: "submission-1",
    });
    const secondSubmission = buildCanonicalWorkspaceIdentity({
      ...base,
      ownerKey: "user:student-2",
      workspaceView: "learner",
      learnerId: "student-2",
      assignmentId: "assignment-1",
      submissionId: "submission-2",
    });

    expect(new Set([tutor, firstSubmission, secondSubmission]).size).toBe(3);
  });

  it("persists text within the required debounce window without a second runtime delay", () => {
    expect(WORKSPACE_TEXT_SAVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(500);
    expect(WORKSPACE_TEXT_SAVE_DEBOUNCE_MS).toBeLessThanOrEqual(700);
    expect(WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS).toBeLessThanOrEqual(700);
    expect(WORKSPACE_RUNTIME_SAVE_COALESCE_MS).toBe(250);
  });

  it("creates monotonic revisions even for multiple mutations in one millisecond", () => {
    expect(
      nextWorkspaceSaveRevision({ previousRevision: 500, now: 500 }),
    ).toBe(501);
  });

  it("rejects a response from the workspace that was previously mounted", () => {
    expect(
      shouldApplyWorkspaceResponse({
        expectedIdentity: "student:a:submission:2",
        responseIdentity: "student:b:submission:9",
        requestAborted: false,
        currentRevision: 1,
        responseRevision: 20,
        sameContent: false,
      }),
    ).toBe(false);
  });

  it("rejects an aborted hydration even when its revision is newer", () => {
    expect(
      shouldApplyWorkspaceResponse({
        expectedIdentity: "tutor:master",
        responseIdentity: "tutor:master",
        requestAborted: true,
        currentRevision: 2,
        responseRevision: 3,
        sameContent: false,
      }),
    ).toBe(false);
  });

  it("rejects a delayed poll that is older than the visible revision", () => {
    expect(
      shouldApplyWorkspaceResponse({
        expectedIdentity: "tutor:master",
        responseIdentity: "tutor:master",
        requestAborted: false,
        currentRevision: 8,
        responseRevision: 7,
        sameContent: false,
      }),
    ).toBe(false);
  });

  it("accepts an exact-tree replacement at a newer revision", () => {
    expect(
      shouldApplyWorkspaceResponse({
        expectedIdentity: "tutor:master",
        responseIdentity: "tutor:master",
        requestAborted: false,
        currentRevision: 8,
        responseRevision: 9,
        sameContent: false,
      }),
    ).toBe(true);
  });

  it("never persists read-only mount churn or remote hydration", () => {
    expect(
      shouldPersistWorkspaceMutation({
        readOnly: true,
        hydrated: true,
        applyingRemote: false,
        hasAuthoritativeContent: true,
        wouldReplaceNonEmptyWithEmpty: false,
      }),
    ).toBe(false);
    expect(
      shouldPersistWorkspaceMutation({
        readOnly: false,
        hydrated: true,
        applyingRemote: true,
        hasAuthoritativeContent: true,
        wouldReplaceNonEmptyWithEmpty: false,
      }),
    ).toBe(false);
  });

  it("blocks a transient empty snapshot from replacing persisted files", () => {
    expect(
      shouldPersistWorkspaceMutation({
        readOnly: false,
        hydrated: true,
        applyingRemote: false,
        hasAuthoritativeContent: false,
        wouldReplaceNonEmptyWithEmpty: true,
      }),
    ).toBe(false);
  });
});
