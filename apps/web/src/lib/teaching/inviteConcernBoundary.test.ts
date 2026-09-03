import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAuthenticateAccessHref } from "@zoeskoul/permissions/accessGate";

const root = process.cwd();
const source = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const schema = source("packages/db/prisma/schema.prisma");
const classDomain = source("apps/web/src/lib/learningGroups/groupInvites.ts");
const assignmentDomain = source("apps/web/src/lib/learningAssignments/assignmentInvites.ts");
const tutoringDomain = source("apps/web/src/lib/tutoring/sessionInvites.ts");
const classApi = source("apps/web/src/app/api/teacher/learning-groups/[id]/invites/route.ts");
const classDelivery = source("apps/web/src/lib/learningGroups/groupInviteDelivery.ts");
const classPage = source("apps/web/src/app/(public)/[locale]/(generalZone)/invitations/class/[token]/page.tsx");
const classEmail = source("apps/web/src/lib/learningGroups/groupInviteEmail.ts");
const sharedEmail = source("apps/web/src/lib/invitations/classroomInviteEmail.ts");
const classUi = source("apps/teacher/src/features/classes/TeacherClassInvites.tsx");
const classClient = source("apps/teacher/src/features/classes/teacherClassesClient.ts");

describe("Teaching invitation concern boundaries", () => {
  it("stores each domain separately", () => {
    expect(schema).toContain("model LearningGroupInvite {");
    expect(schema).toContain("model LearningAssignmentInvite {");
    expect(schema).toContain("model TutoringSessionInvite {");
    expect(schema).not.toContain("model TeachingInvite {");
  });

  it("keeps acceptance effects domain-specific", () => {
    expect(classDomain).toContain("learningGroupMember.upsert");
    expect(classDomain).not.toContain("learningAssignmentUser.upsert");
    expect(classDomain).not.toContain("tutoringSessionUser.upsert");
    expect(assignmentDomain).toContain("learningAssignmentUser.upsert");
    expect(assignmentDomain).not.toContain("learningGroupMember.upsert");
    expect(tutoringDomain).toContain("tutoringSessionUser.upsert");
    expect(tutoringDomain).not.toContain("learningGroupMember.upsert");
  });

  it("reuses shared mechanics with a class-specific email concern", () => {
    expect(classDomain).toContain("@/lib/invitations/inviteToken");
    expect(classEmail).toContain("@/lib/invitations/classroomInviteEmail");
    expect(classEmail).toContain('classroomKind: "class membership"');
    expect(sharedEmail).toContain('"class membership"');
    expect(sharedEmail).toContain("Join class");
  });

  it("keeps class delivery and learner acceptance on the class domain", () => {
    expect(classApi).toContain("deliverLearningGroupInvite");
    expect(classApi).toContain("appCorsJson");
    expect(classApi).toContain("appCorsPreflight");
    expect(classDelivery).toContain("rotateLearningGroupInvite");
    expect(classDelivery).toContain("/invitations/class/");
    expect(classApi + classDelivery).not.toContain("learningAssignmentInvite");
    expect(classApi + classDelivery).not.toContain("tutoringSessionInvite");
    expect(classPage).toContain("acceptLearningGroupInvite");
    expect(classPage).toContain('reason: "class_invite"');
    expect(classPage).not.toContain("acceptLearningAssignmentInvite");
    expect(classPage).not.toContain("acceptTutoringSessionInvite");
  });

  it("uses the shared safe authentication continuation with a distinct reason", () => {
    const href = buildAuthenticateAccessHref({
      locale: "fr",
      next: "/fr/invitations/class/token",
      reason: "class_invite",
      resource: "Python 101",
    });
    const url = new URL(href, "https://zoeskoul.test");
    expect(url.pathname).toBe("/fr/authenticate");
    expect(url.searchParams.get("reason")).toBe("class_invite");
    expect(url.searchParams.get("callbackUrl")).toBe("/fr/invitations/class/token");
  });

  it("keeps Teacher class invite UI separate", () => {
    expect(classUi).toContain("Teacher.classes.invites");
    expect(classClient).toContain("/api/teacher/learning-groups/${encodeURIComponent(classId)}/invites");
    expect(classUi + classClient).not.toContain("TeacherAssignmentInvites");
    expect(classUi + classClient).not.toContain("/tutoring-sessions/");
  });
});
