import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const source = (relative: string) => readFileSync(resolve(root, relative), "utf8");

const schema = source("packages/db/prisma/schema.prisma");
const migration = source("packages/db/prisma/migrations/20261006043000_learning_group_lifecycle/migration.sql");
const collection = source("apps/web/src/app/api/teacher/learning-groups/route.ts");
const item = source("apps/web/src/app/api/teacher/learning-groups/[id]/route.ts");
const status = source("apps/web/src/app/api/teacher/learning-groups/[id]/status/route.ts");
const manualInvite = source("apps/web/src/app/api/teacher/learning-groups/[id]/invites/route.ts");
const announcements = source("apps/web/src/app/api/teacher/learning-groups/[id]/announcements/route.ts");
const legacyEditor = source("apps/web/src/components/teaching/learning-groups/LearningGroupEditor.tsx");
const inviteDomain = source("apps/web/src/lib/learningGroups/groupInvites.ts");
const assignmentAudience = source("apps/web/src/lib/learningAssignments/assignmentAdminServer.ts");
const tutoringAudience = source("apps/web/src/lib/tutoring/sessionAdminServer.ts");

describe("LearningGroup lifecycle boundary", () => {
  it("owns lifecycle on LearningGroup and preserves existing classes as open", () => {
    expect(schema).toContain("status           LearningGroupStatus       @default(draft)");
    expect(schema).toContain("enum LearningGroupStatus {");
    expect(migration).toContain("DEFAULT 'open'");
    expect(migration).toContain("SET DEFAULT 'draft'");
  });

  it("uses the dedicated status mutation for draft/open/closed transitions", () => {
    expect(status).toContain('current === "draft" && next === "open"');
    expect(status).toContain('current === "open" && next === "closed"');
    expect(status).toContain('current === "closed" && next === "open"');
    expect(status).not.toContain('next === "draft"');
    expect(item).toContain("export async function DELETE");
  });

  it("holds learner delivery until a class is open", () => {
    expect(collection).toContain("deferred: prepared.autoDeliveryEmails.length");
    expect(item).toContain('group.status === "open"');
    expect(status).toContain("syncPendingLearningGroupInvites");
    expect(status).toContain("invite.expiresAt <= now");
    expect(manualInvite).toContain('group.status !== "open"');
    expect(inviteDomain).toContain('invite.group.status !== "open"');
    expect(announcements).toContain('group.status !== "open"');
  });

  it("keeps the legacy Web fallback capable of opening and closing classes", () => {
    expect(legacyEditor).toContain('/status`');
    expect(legacyEditor).toContain('changeStatus(next: "open" | "closed")');
  });

  it("allows only open classes as new assignment or tutoring audiences", () => {
    expect(assignmentAudience).toContain('{ status: "open" }');
    expect(assignmentAudience).toContain("allowedInactiveGroupIds");
    expect(tutoringAudience).toContain('{ status: "open" }');
    expect(tutoringAudience).toContain("allowedInactiveGroupIds");
  });
});
