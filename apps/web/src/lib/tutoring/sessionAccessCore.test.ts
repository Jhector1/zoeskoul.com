import { describe, expect, it } from "vitest";

import { resolveTutoringAccess } from "./sessionAccessCore";

const base = {
  userId: "student-1",
  ownerId: "teacher-1",
  status: "live" as const,
  allowStudentEditing: false,
  directRole: "learner" as const,
  isGroupParticipant: false,
  isAdmin: false,
};

describe("resolveTutoringAccess", () => {
  it("keeps learner progress personal while the shared board is locked", () => {
    expect(resolveTutoringAccess(base)).toMatchObject({
      canEditOwnProgress: true,
      canEditSharedDocuments: false,
      canViewSolutions: false,
    });
  });

  it("keeps observers read-only", () => {
    expect(
      resolveTutoringAccess({
        ...base,
        allowStudentEditing: true,
        directRole: "observer",
      }),
    ).toMatchObject({
      canEditOwnProgress: false,
      canEditSharedDocuments: false,
    });
  });

  it("allows an invited teacher through participant access", () => {
    expect(resolveTutoringAccess(base)).not.toBeNull();
  });

  it("does not expose draft sessions to participants", () => {
    expect(resolveTutoringAccess({ ...base, status: "draft" })).toBeNull();
  });

  it("lets the owner manage a draft", () => {
    expect(
      resolveTutoringAccess({
        ...base,
        userId: "teacher-1",
        status: "draft",
        directRole: null,
      }),
    ).toMatchObject({ canManage: true, canViewSolutions: true });
  });
});
