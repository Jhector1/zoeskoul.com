import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const cwd = resolve(process.cwd());
const root = cwd.endsWith("/apps/teacher")
  ? resolve(cwd, "../..")
  : cwd;

const source = (path: string) =>
  readFileSync(resolve(root, path), "utf8");

const panel = source(
  "apps/teacher/src/features/classes/TeacherClassCoursesPanel.tsx",
);

describe("Teacher Class Course Workspace V248 entry", () => {
  it("opens the web-hosted class course workspace from the class course card", () => {
    expect(panel).toContain("classCourseWorkspaceHref");
    expect(panel).toContain("/teacher-classes/");
    expect(panel).toContain("websiteOrigin");
    expect(panel).toContain("props.websiteOrigin");
    expect(panel).not.toContain("args.apiOrigin");
    expect(panel).toContain("course.subjectSlug");
    expect(panel).toContain('"courses.openWorkspace"');
  });

  it("keeps assignment creation on the Teacher route and carries class/course context", () => {
    expect(panel).toContain("/assignments/new?subjectId=");
    expect(panel).toContain("course.subjectId");
    expect(panel).toContain("props.classId");
  });
});
