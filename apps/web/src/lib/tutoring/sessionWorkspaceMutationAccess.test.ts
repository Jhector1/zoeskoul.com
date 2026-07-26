import { describe, expect, it } from "vitest";
import {
  canMutateTutoringWorkspace,
  resolveTutoringWorkspaceAccess,
} from "./sessionWorkspaceAccessCore";

describe("tutoring workspace mutation access", () => {
  const base = {
    currentUserId: "tutor-1",
    canManage: true,
    canEditOwnProgress: true,
    status: "live" as const,
    publishedVersion: 1,
  };

  it("rejects a tutor mutation while observing a learner", () => {
    const resolved = resolveTutoringWorkspaceAccess({
      ...base,
      requestedView: "learner",
      requestedLearnerId: "student-1",
      learnerIsParticipant: true,
    });

    expect(resolved?.readOnly).toBe(true);
    expect(canMutateTutoringWorkspace(resolved)).toBe(false);
  });

  it("allows the tutor's editable master workspace", () => {
    const resolved = resolveTutoringWorkspaceAccess({
      ...base,
      requestedView: "master",
    });

    expect(resolved?.readOnly).toBe(false);
    expect(canMutateTutoringWorkspace(resolved)).toBe(true);
  });

  it("keeps two selected learner reviews on distinct read-only owner keys", () => {
    const first = resolveTutoringWorkspaceAccess({
      ...base,
      requestedView: "learner",
      requestedLearnerId: "student-1",
      learnerIsParticipant: true,
    });
    const second = resolveTutoringWorkspaceAccess({
      ...base,
      requestedView: "learner",
      requestedLearnerId: "student-2",
      learnerIsParticipant: true,
    });

    expect(first?.ownerKey).toBe("user:student-1");
    expect(second?.ownerKey).toBe("user:student-2");
    expect(first?.ownerKey).not.toBe(second?.ownerKey);
    expect(first?.ownerKey).not.toBe("shared");
    expect(second?.ownerKey).not.toBe("shared");
    expect(first?.readOnly).toBe(true);
    expect(second?.readOnly).toBe(true);
  });
});
