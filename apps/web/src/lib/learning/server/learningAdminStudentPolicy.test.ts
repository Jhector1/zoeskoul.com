import { describe, expect, it } from "vitest";
import {
  matchesPublishedAdminTopic,
  parseStudentAdminLabTarget,
  STUDENT_ADMIN_COURSE_SLUG,
} from "./learningAdminStudentPolicy";

const admin = {
  moduleSlug: "linux-module-3-users-groups-troubleshooting",
  topicSlug: "sudo-root-concepts",
} as const;

describe("Course 2 administrator admission policy", () => {
  it("accepts only the three designated Course 2 topics in their exact module", () => {
    expect(parseStudentAdminLabTarget(admin)).toEqual(admin);
    expect(parseStudentAdminLabTarget({
      ...admin,
      topicSlug: "ownership-administration-concepts",
    })).not.toBeNull();
    expect(parseStudentAdminLabTarget({
      moduleSlug: "linux-module-4-secure-project-capstone",
      topicSlug: "final-capstone-secure-project",
    })).not.toBeNull();
  });

  it("rejects an arbitrary topic, mismatched module, or extra browser fields", () => {
    expect(parseStudentAdminLabTarget({ ...admin, topicSlug: "current-user-and-groups" })).toBeNull();
    expect(parseStudentAdminLabTarget({ ...admin, moduleSlug: "linux-module-4-secure-project-capstone" })).toBeNull();
    expect(parseStudentAdminLabTarget({ ...admin, grant: "untrusted" })).toBeNull();
    expect(parseStudentAdminLabTarget({ ...admin, actorKey: "u:forged" })).toBeNull();
    expect(parseStudentAdminLabTarget({ ...admin, files: [] })).toBeNull();
    expect(parseStudentAdminLabTarget(null)).toBeNull();
    expect(parseStudentAdminLabTarget([])).toBeNull();
    expect(parseStudentAdminLabTarget(Object.create({ ...admin }))).toBeNull();
  });

  it("accepts only compiled published metadata with matching module and topic", () => {
    const compiled = {
      subjectSlug: STUDENT_ADMIN_COURSE_SLUG,
      moduleSlug: admin.moduleSlug,
      topicId: admin.topicSlug,
    };
    expect(matchesPublishedAdminTopic(admin, compiled)).toBe(true);
    expect(matchesPublishedAdminTopic(admin, { ...compiled, subjectSlug: "linux--linux-files-permissions-users--draft" })).toBe(false);
    expect(matchesPublishedAdminTopic(admin, { ...compiled, topicId: "another-topic" })).toBe(false);
    expect(matchesPublishedAdminTopic(admin, { ...compiled, moduleSlug: "wrong-module" })).toBe(false);
    expect(matchesPublishedAdminTopic(admin, null)).toBe(false);
  });
});
