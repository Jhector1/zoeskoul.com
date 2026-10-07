import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith("/apps/teacher")
  ? cwd
  : path.resolve(cwd, "apps/teacher");

const read = (relativePath: string) =>
  fs.readFileSync(path.join(teacherRoot, relativePath), "utf8");

describe("Teacher computed input theme V261A", () => {
  it("adds ui-input-ide while preserving computed class expressions", () => {
    const files = [
      "src/features/assignments/TeacherAssignmentEditor.tsx",
      "src/features/classes/TeacherClassCreateWizard.tsx",
      "src/features/classes/TeacherClassEditor.tsx",
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain('["ui-input-ide", (');
      expect(source).not.toContain("bg-white");
    }
  });
});
