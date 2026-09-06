import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const cwd = process.cwd();
const root = fs.existsSync(
  path.join(cwd, "apps", "web"),
)
  ? cwd
  : path.resolve(cwd, "../..");

function source(relative: string) {
  return fs.readFileSync(
    path.join(root, relative),
    "utf8",
  );
}

describe("Learning Announcement ownership", () => {
  const service = source(
    "apps/web/src/lib/learningAnnouncements/learningAnnouncements.ts",
  );
  const schoolRoute = source(
    "apps/web/src/app/api/teacher/schools/[id]/announcements/route.ts",
  );
  const classRoute = source(
    "apps/web/src/app/api/teacher/learning-groups/[id]/announcements/route.ts",
  );
  const studentRoute = source(
    "apps/web/src/app/api/student/announcements/route.ts",
  );

  it("keeps announcements separate from marketing campaigns", () => {
    expect(service).not.toContain(
      "StudentCampaign",
    );
    expect(service).not.toContain(
      "publicChallenge",
    );
    expect(service).not.toContain(
      "@/lib/marketing",
    );
  });

  it("uses canonical school and class authorization", () => {
    expect(schoolRoute).toContain(
      "getLearningOrganizationAccess",
    );
    expect(schoolRoute).toContain(
      "canManageSchool",
    );
    expect(classRoute).toContain(
      "ownedTeachingRecordWhere",
    );
  });

  it("keeps learner delivery authenticated and Student-owned", () => {
    expect(studentRoute).toContain(
      "getCurrentUserAccess",
    );
    expect(studentRoute).toContain(
      "listUnreadLearningAnnouncementsForStudent",
    );
  });

  it("snapshots existing accepted class students", () => {
    expect(service).toContain(
      'role: "student"',
    );
    expect(service).toContain(
      "learningAnnouncementReceipt.createMany",
    );
  });
});
