import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./TeacherSchoolPage.tsx", import.meta.url), "utf8");
const panel = readFileSync(
  new URL("./TeacherStaffClassAssignments.tsx", import.meta.url),
  "utf8",
);
const client = readFileSync(new URL("./teacherSchoolClient.ts", import.meta.url), "utf8");

describe("Teacher class instructor assignment V264A", () => {
  it("keeps explicit class assignment inside Institution Staff", () => {
    expect(page).toContain("TeacherStaffClassAssignments");
    expect(page).toContain('membership.role === "instructor"');
    expect(page).toContain("access?.canManageStaff");
  });

  it("uses the school-scoped instructor mutation API", () => {
    expect(client).toContain("updateClassInstructor");
    expect(client).toContain("/class-instructors");
    expect(panel).toMatch(/client\s*\.\s*updateClassInstructor/);
  });

  it("renders assignments from institution-scoped class payload only", () => {
    expect(client).toContain("instructorUserIds:string[]");
    expect(panel).toContain("group.instructorUserIds.includes");
    expect(panel).toContain("props.classes");
  });
});
