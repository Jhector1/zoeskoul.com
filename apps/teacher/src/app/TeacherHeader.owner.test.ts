import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const header = readFileSync(
  new URL(
    "./TeacherHeader.tsx",
    import.meta.url,
  ),
  "utf8",
);

const shell = readFileSync(
  new URL(
    "./TeacherAppShell.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Teacher global header ownership", () => {
  it("reuses shared HeaderChrome instead of forking header geometry", () => {
    expect(header).toContain(
      'from "@zoeskoul/learner-ui"',
    );
    expect(header).toContain(
      "<HeaderChrome",
    );
    expect(header).not.toContain(
      '<header className="sticky top-0 z-50">',
    );
  });

  it("uses only live Teacher destinations", () => {
    for (const href of [
      'href: "/"',
      'href: "/classes"',
      'href: "/assignments"',
      'href: "/reports"',
      'href: "/school"',
    ]) {
      expect(header).toContain(href);
    }

    for (const deadRoute of [
      'href: "/students"',
      'href: "/gradebook"',
      'href: "/courses"',
    ]) {
      expect(header).not.toContain(
        deadRoute,
      );
    }
  });

  it("keeps routing in the Teacher adapter and all copy in i18n", () => {
    expect(header).toContain(
      "TeacherLink",
    );
    expect(header).toContain(
      '"Teacher.header"',
    );
    expect(header).toContain(
      "websiteOrigin",
    );
    expect(header).not.toContain(
      "window.history",
    );
  });

  it("renders the global header around every routed Teacher surface", () => {
    expect(shell).toContain(
      "<TeacherHeader",
    );
    expect(shell).toContain(
      "const location =",
    );
    expect(shell).toContain(
      "let content;",
    );
    expect(shell).toContain(
      "{content}",
    );
    expect(shell).toContain(
      "headerSection(",
    );
  });
});

const teacherStyles = readFileSync(
  new URL(
    "../styles.css",
    import.meta.url,
  ),
  "utf8",
);

describe("Teacher shared style ownership", () => {
  it("loads canonical ZoeSkoul tokens/components and scans shared HeaderChrome", () => {
    expect(teacherStyles).toContain(
      "packages/ui-styles/colors.css",
    );
    expect(teacherStyles).toContain(
      "packages/ui-styles/ui-v2.css",
    );
    expect(teacherStyles).toContain(
      "packages/learner-ui/src",
    );
    expect(teacherStyles).not.toContain(
      "teacher-ui-v2.css",
    );
    expect(teacherStyles).not.toContain(
      "TeacherHeader.css",
    );
  });
});
