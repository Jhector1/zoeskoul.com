import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function source(relative: string) {
  return readFileSync(resolve(root, relative), "utf8");
}

const collection = source("apps/web/src/app/api/teacher/learning-groups/route.ts");
const item = source("apps/web/src/app/api/teacher/learning-groups/[id]/route.ts");
const manual = source("apps/web/src/app/api/teacher/learning-groups/[id]/invites/route.ts");
const statusRoute = source("apps/web/src/app/api/teacher/learning-groups/[id]/status/route.ts");
const delivery = source("apps/web/src/lib/learningGroups/groupInviteDelivery.ts");
const invites = source("apps/web/src/lib/learningGroups/groupInvites.ts");
const learner = source("apps/web/src/app/(public)/[locale]/(generalZone)/invitations/class/[token]/page.tsx");
const teacherUi = source("apps/teacher/src/features/classes/TeacherClassInvites.tsx");

describe("LearningGroup invitation consent boundary", () => {
  it("invites every newly entered learner email instead of directly enrolling known accounts", () => {
    expect(collection).toContain("desiredEmails");
    expect(collection).toContain("pendingEmails: desiredEmails");
    expect(collection).not.toContain("resolveUsersByEmail");
    expect(collection).not.toContain("createMany");
    expect(item).toContain("currentMemberEmails");
    expect(item).toContain("inviteEmails");
    expect(item).not.toContain("resolveUsersByEmail");
    expect(item).not.toContain("createMany");
  });

  it("preserves accepted members while requiring acceptance for new emails", () => {
    expect(item).toContain("studentUserIdsToKeep");
    expect(item).toContain('role: "student"');
    expect(invites).toContain("learningGroupMember.upsert");
    expect(learner).toContain("acceptLearningGroupInvite");
  });

  it("defers draft delivery and releases unsent invites when the class opens", () => {
    expect(collection).toContain("deferred: prepared.autoDeliveryEmails.length");
    expect(collection).not.toContain("autoDeliverLearningGroupInvites");
    expect(item).toContain('group.status === "open"');
    expect(statusRoute).toContain("autoDeliverLearningGroupInvites");
    expect(statusRoute).toContain("syncPendingLearningGroupInvites");
    expect(statusRoute).toContain("invite.expiresAt <= now");
    expect(invites).toContain("autoDeliveryEmails");
    expect(delivery).toContain('context.status !== "open"');
  });

  it("retains copy-link and resend actions", () => {
    expect(manual).toContain("deliverLearningGroupInvite");
    expect(teacherUi).toContain('"link"');
    expect(teacherUi).toContain('"email"');
    expect(teacherUi).toContain('"resendEmail"');
  });

  it("does not cross assignment or tutoring invitation concerns", () => {
    for (const text of [collection, item, manual, delivery, invites]) {
      expect(text).not.toContain("learningAssignmentUser.upsert");
      expect(text).not.toContain("tutoringSessionUser.upsert");
    }
  });
});
