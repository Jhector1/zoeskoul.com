import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith("/apps/teacher")
  ? cwd
  : path.resolve(cwd, "apps/teacher");

const source = (relativePath: string) =>
  fs.readFileSync(
    path.join(teacherRoot, relativePath),
    "utf8",
  );

const shell = source("src/app/TeacherAppShell.tsx");
const header = source("src/app/TeacherHeader.tsx");
const workspace = source(
  "src/features/classes/TeacherClassWorkspace.tsx",
);
const courses = source(
  "src/features/classes/TeacherClassCoursesPanel.tsx",
);

describe("Teacher course routing and Student surface parity V257", () => {
  it("hands Web-owned class course routes to websiteOrigin", () => {
    expect(courses).toContain("websiteOrigin: string");
    expect(courses).toContain("args.websiteOrigin");
    expect(courses).toContain("props.websiteOrigin");
    expect(courses).not.toContain("args.apiOrigin");
    expect(workspace).toContain("websiteOrigin: string");
    expect(workspace).toContain(
      "websiteOrigin={props.websiteOrigin}",
    );
    expect(shell).toContain(
      "websiteOrigin={props.websiteOrigin}",
    );
  });

  it("uses shared token background instead of Tailwind dark page chrome", () => {
    expect(shell).toContain(
      'className="min-h-screen ui-bg text-[rgb(var(--ui-text)/1)]"',
    );
    expect(shell).not.toContain('dark:bg-[#0b0d12]');
    expect(header).toContain("ui-surface-soft");
    expect(header).toContain("var(--ui-text)");
    expect(header).toContain("var(--ui-text-muted)");
  });

  it("uses existing shared button/surface helpers in course cards", () => {
    expect(courses).toContain("ui-btn ui-btn-primary");
    expect(courses).toContain("ui-btn ui-btn-secondary");
    expect(courses).toContain("ui-surface rounded-lg");
    expect(courses).not.toContain("bg-black");
    expect(courses).not.toContain("dark:text-white");
  });
});
