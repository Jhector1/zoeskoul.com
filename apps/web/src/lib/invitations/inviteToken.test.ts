import { describe, expect, it } from "vitest";
import {
  classroomInviteExpiry,
  classroomInviteState,
  hashClassroomInviteToken,
  maskClassroomInviteEmail,
} from "./inviteToken";

describe("classroom invitation tokens", () => {
  it("uses a stable SHA-256 hash without persisting the raw token", () => {
    expect(hashClassroomInviteToken("invite-token")).toHaveLength(64);
    expect(hashClassroomInviteToken("invite-token")).toBe(
      hashClassroomInviteToken("invite-token"),
    );
  });

  it("expires invitations after thirty days", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    expect(classroomInviteExpiry(now).toISOString()).toBe(
      "2026-08-22T12:00:00.000Z",
    );
  });

  it("resolves pending, accepted, expired, and revoked states", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    expect(
      classroomInviteState({ expiresAt: "2026-07-24T12:00:00.000Z" }, now),
    ).toBe("pending");
    expect(
      classroomInviteState(
        {
          expiresAt: "2026-07-24T12:00:00.000Z",
          acceptedAt: "2026-07-23T11:00:00.000Z",
        },
        now,
      ),
    ).toBe("accepted");
    expect(
      classroomInviteState({ expiresAt: "2026-07-22T12:00:00.000Z" }, now),
    ).toBe("expired");
    expect(
      classroomInviteState(
        {
          expiresAt: "2026-07-24T12:00:00.000Z",
          revokedAt: "2026-07-23T11:00:00.000Z",
        },
        now,
      ),
    ).toBe("revoked");
  });

  it("masks the invited address on account mismatch screens", () => {
    expect(maskClassroomInviteEmail("kelly@example.com")).toBe(
      "ke•••@example.com",
    );
  });
});
