import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const source = (relative: string) =>
  readFileSync(resolve(root, relative), "utf8");

const access = source("src/lib/teaching/classAccess.ts");
const assignment = source("src/lib/learningAssignments/assignmentAdminServer.ts");

describe("Assignment class isolation V263C", () => {
  it("keeps the canonical class predicate composable with caller lifecycle OR", () => {
    expect(access).toContain("AND: [");
    expect(access).toContain("OR: [");
    expect(access).toContain("organizationAdminRole");
    expect(access).toContain("groupInstructorRole");
  });

  it("uses canonical class authorization for assignment audiences", () => {
    expect(assignment).toContain("learningGroupWhereForTeachingUser");
    expect(assignment).not.toContain("ownedTeachingRecordWhere");
  });

  it("preserves assignment lifecycle eligibility independently of authorization", () => {
    expect(assignment).toContain('{ status: "open" }');
    expect(assignment).toContain("allowedInactiveGroupIds");
    expect(assignment).toContain("OR: [");
  });
});
