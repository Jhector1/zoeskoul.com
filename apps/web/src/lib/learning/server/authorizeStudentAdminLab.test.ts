import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(),
  module: vi.fn(),
  manifest: vi.fn(),
  practiceAccess: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subjectEnrollment: { findFirst: mocks.enrollment },
    practiceModule: { findFirst: mocks.module },
  },
}));
vi.mock("@/lib/practice/actor", () => ({
  actorKeyOf: ({ userId }: { userId: string | null }) => `u:from:${userId}`,
}));
vi.mock("@/lib/practice/access/resolvePracticeAccess", () => ({
  resolvePracticeAccess: mocks.practiceAccess,
}));
vi.mock("@/lib/curriculum/resolveTopicBundleManifest", () => ({
  resolveTopicBundleManifest: mocks.manifest,
}));

import { authorizeStudentAdminLab } from "./authorizeStudentAdminLab";

const actor = { userId: "user1", guestId: null };
const target = {
  moduleSlug: "linux-module-3-users-groups-troubleshooting",
  topicSlug: "sudo-root-concepts",
} as const;
const request = new Request("https://example.test/api/run/pty/sessions/admin/start", {
  method: "POST",
});

describe("live published Course 2 admission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enrollment.mockResolvedValue({ subjectId: "subject1" });
    mocks.module.mockResolvedValue({ subjectId: "subject1" });
    mocks.manifest.mockReturnValue({
      subjectSlug: "linux-files-permissions-users",
      moduleSlug: target.moduleSlug,
      topicId: target.topicSlug,
    });
    mocks.practiceAccess.mockResolvedValue({ ok: true });
  });

  it("requires a signed-in database-backed learner", async () => {
    expect(await authorizeStudentAdminLab({ actor: {userId:null,guestId:"guest"}, request, target })).toBe(false);
    expect(mocks.enrollment).not.toHaveBeenCalled();
  });

  it("checks enrollment, active course module, published topic and practice access", async () => {
    expect(await authorizeStudentAdminLab({ actor, request, target })).toBe(true);
    expect(mocks.enrollment).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        actorKey: "u:from:user1",
        userId: "user1",
        archivedAt: null,
        status: {in:["enrolled","completed"]},
        subject: {slug:"linux-files-permissions-users",status:"active"},
      }),
    }));
    expect(mocks.practiceAccess).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({subject:"linux-files-permissions-users",module:target.moduleSlug}),
    }));
  });

  it("does not grant to unenrolled learners or mismatched subjects", async () => {
    mocks.enrollment.mockResolvedValueOnce(null);
    expect(await authorizeStudentAdminLab({actor,request,target})).toBe(false);
    mocks.module.mockResolvedValueOnce({subjectId:"other-subject"});
    expect(await authorizeStudentAdminLab({actor,request,target})).toBe(false);
    expect(mocks.practiceAccess).not.toHaveBeenCalled();
  });

  it("rejects draft content and wrong module metadata", async () => {
    mocks.manifest.mockReturnValueOnce(null);
    expect(await authorizeStudentAdminLab({actor,request,target})).toBe(false);
    mocks.manifest.mockReturnValueOnce({subjectSlug:"linux--linux-files-permissions-users--draft",moduleSlug:target.moduleSlug,topicId:target.topicSlug});
    expect(await authorizeStudentAdminLab({actor,request,target})).toBe(false);
    expect(mocks.practiceAccess).not.toHaveBeenCalled();
  });

  it("honors existing practice-access denial", async () => {
    mocks.practiceAccess.mockResolvedValueOnce({ok:false});
    expect(await authorizeStudentAdminLab({actor,request,target})).toBe(false);
  });
});
