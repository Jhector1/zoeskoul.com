import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  acceptLearningGroupInvite,
  learningGroupInviteState,
  syncPendingLearningGroupInvites,
} from "./groupInvites";

describe("LearningGroup class invitations", () => {
  it("reuses the canonical invitation lifecycle state", () => {
    const now = new Date("2026-09-03T02:30:00.000Z");

    expect(
      learningGroupInviteState(
        { expiresAt: "2026-09-04T02:30:00.000Z" },
        now,
      ),
    ).toBe("pending");

    expect(
      learningGroupInviteState(
        { expiresAt: "2026-09-02T02:30:00.000Z" },
        now,
      ),
    ).toBe("expired");
  });

  it("acceptance creates only LearningGroupMember and preserves an existing instructor role", async () => {
    const memberUpsert = vi.fn(async () => ({}));
    const inviteUpdate = vi.fn(async () => ({}));

    const prisma = {
      learningGroupInvite: {
        findUnique: vi.fn(async () => ({
          id: "invite-1",
          groupId: "group-1",
          email: "student@example.com",
          expiresAt: new Date("2026-10-01T00:00:00.000Z"),
          acceptedAt: null,
          acceptedByUserId: null,
          revokedAt: null,
          group: {
            id: "group-1",
            name: "Python 101",
            slug: "python-101",
            owner: {
              id: "teacher-1",
              name: "Teacher",
              email: "teacher@example.com",
            },
            organization: null,
          },
        })),
        update: inviteUpdate,
      },
      learningGroupMember: {
        upsert: memberUpsert,
      },
      $transaction: vi.fn(
        async (operations: Promise<unknown>[]) =>
          Promise.all(operations),
      ),
    };

    const result = await acceptLearningGroupInvite(
      prisma as never,
      {
        token: "class-token",
        userId: "student-1",
        userEmail: "STUDENT@example.com",
        now: new Date("2026-09-03T02:30:00.000Z"),
      },
    );

    expect(result.ok).toBe(true);
    expect(memberUpsert).toHaveBeenCalledWith({
      where: {
        groupId_userId: {
          groupId: "group-1",
          userId: "student-1",
        },
      },
      create: {
        groupId: "group-1",
        userId: "student-1",
        role: "student",
      },
      update: {},
    });
    expect(inviteUpdate).toHaveBeenCalled();
  });

  it("rejects the wrong account without touching class membership", async () => {
    const memberUpsert = vi.fn();

    const prisma = {
      learningGroupInvite: {
        findUnique: vi.fn(async () => ({
          id: "invite-1",
          groupId: "group-1",
          email: "invited@example.com",
          expiresAt: new Date("2026-10-01T00:00:00.000Z"),
          acceptedAt: null,
          acceptedByUserId: null,
          revokedAt: null,
          group: {
            id: "group-1",
            name: "Python 101",
            slug: "python-101",
            owner: {
              id: "teacher-1",
              name: "Teacher",
              email: "teacher@example.com",
            },
            organization: null,
          },
        })),
      },
      learningGroupMember: {
        upsert: memberUpsert,
      },
    };

    const result = await acceptLearningGroupInvite(
      prisma as never,
      {
        token: "class-token",
        userId: "wrong-user",
        userEmail: "wrong@example.com",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "email_mismatch",
    });
    expect(memberUpsert).not.toHaveBeenCalled();
  });

  it("reports only newly created invitations for automatic delivery", async () => {
    const now = new Date("2026-09-03T04:00:00.000Z");
    const findUnique = vi.fn()
      .mockResolvedValueOnce({
        expiresAt: new Date("2026-10-03T04:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
      })
      .mockResolvedValueOnce(null);

    const prisma = {
      learningGroupInvite: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findUnique,
        upsert: vi.fn(async () => ({})),
      },
    };

    const result = await syncPendingLearningGroupInvites(prisma as never, {
      groupId: "group-1",
      pendingEmails: ["already-pending@example.com", "new@example.com"],
      now,
    });

    expect(result.autoDeliveryEmails).toEqual(["new@example.com"]);
  });

});
